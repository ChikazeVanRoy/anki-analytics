// Firebase's public web API, spoken directly over HTTPS: signing in with an email and password, and reading and writing
// the one Firestore document that holds the phone's snapshot. Used by the Mac (to upload) and the phone app (to read), so
// neither needs Firebase's SDK. No imports, as the Node server uses this too. Everything that touches the network goes
// through `Net`, so tests can stand in for Google.

export interface FirebaseConfig {
  apiKey: string
  projectId: string
}

export interface Session {
  idToken: string
  refreshToken: string
  /** When the idToken stops working (ms since 1970). */
  expiresAt: number
  uid: string
}

export interface Net {
  fetch: typeof fetch
  now: () => number
  /** The longest to wait for one request, so a stalled connection can't hold anything up (ms). */
  timeoutMs: number
  hosts: { identity: string; secureToken: string; firestore: string }
}

export const defaultNet = (): Net => ({
  fetch: (input, init) => fetch(input, init),
  now: Date.now,
  timeoutMs: 10_000,
  hosts: {
    identity: 'https://identitytoolkit.googleapis.com',
    secureToken: 'https://securetoken.googleapis.com',
    firestore: 'https://firestore.googleapis.com',
  },
})

/**
 * credentials: sign in again. denied: signed in, but the security rules say no (not deployed, or another account).
 * network: couldn't reach Google. too-big: the snapshot won't fit in one Firestore document. server: anything else.
 */
export type CloudErrorKind = 'credentials' | 'denied' | 'network' | 'too-big' | 'server'

export class CloudError extends Error {
  readonly kind: CloudErrorKind
  constructor(kind: CloudErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

/** A Firestore document holds up to 1 MiB; the snapshot goes in as base64, which needs a little headroom. */
export const MAX_SNAPSHOT_BASE64 = 900_000

interface Reply {
  status: number
  ok: boolean
  body: Record<string, unknown> | null
}

async function call(net: Net, url: string, init: RequestInit): Promise<Reply> {
  // AbortController + setTimeout rather than AbortSignal.timeout, which older browsers lack. The timer also covers the body.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), net.timeoutMs)
  try {
    let res: Response
    try {
      res = await net.fetch(url, { ...init, signal: controller.signal })
    } catch {
      throw new CloudError('network', 'Couldn’t reach Google.')
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { status: res.status, ok: res.ok, body: body && typeof body === 'object' ? body : null }
  } finally {
    clearTimeout(timer)
  }
}

/** Google's error text, e.g. INVALID_LOGIN_CREDENTIALS, or PERMISSION_DENIED for Firestore. */
function reason(reply: Reply): string {
  const error = reply.body?.error as { message?: unknown; status?: unknown } | undefined
  return typeof error?.message === 'string' ? error.message : typeof error?.status === 'string' ? error.status : `HTTP ${reply.status}`
}

const SIGN_IN_AGAIN = ['INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'USER_DISABLED', 'TOKEN_EXPIRED', 'INVALID_REFRESH_TOKEN', 'USER_NOT_FOUND', 'MISSING_REFRESH_TOKEN']

function authError(reply: Reply): CloudError {
  const why = reason(reply)
  return new CloudError(SIGN_IN_AGAIN.some((code) => why.startsWith(code)) ? 'credentials' : 'server', why)
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : null)

function toSession(idToken: unknown, refreshToken: unknown, expiresInSeconds: unknown, uid: unknown, now: number): Session {
  const id = text(idToken)
  const refresh = text(refreshToken)
  const owner = text(uid)
  if (!id || !refresh || !owner) throw new CloudError('server', 'Google’s sign-in reply was incomplete.')
  const seconds = Number(expiresInSeconds)
  return { idToken: id, refreshToken: refresh, uid: owner, expiresAt: now + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000 }
}

export async function signIn(config: FirebaseConfig, email: string, password: string, net = defaultNet()): Promise<Session> {
  const reply = await call(net, `${net.hosts.identity}/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  if (!reply.ok) throw authError(reply)
  return toSession(reply.body?.idToken, reply.body?.refreshToken, reply.body?.expiresIn, reply.body?.localId, net.now())
}

export async function refreshSession(config: FirebaseConfig, session: Session, net = defaultNet()): Promise<Session> {
  const reply = await call(net, `${net.hosts.secureToken}/v1/token?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`,
  })
  if (!reply.ok) throw authError(reply)
  return toSession(reply.body?.id_token, reply.body?.refresh_token, reply.body?.expires_in, reply.body?.user_id, net.now())
}

/** The session itself while its token has a minute or more left, otherwise a refreshed one. */
export const freshSession = (config: FirebaseConfig, session: Session, net = defaultNet()) =>
  session.expiresAt - 60_000 > net.now() ? Promise.resolve(session) : refreshSession(config, session, net)

// --- the snapshot document ---

const documentUrl = (config: FirebaseConfig, net: Net) =>
  `${net.hosts.firestore}/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/snapshots/latest`

function firestoreError(reply: Reply): CloudError {
  const why = reason(reply)
  if (reply.status === 401) return new CloudError('credentials', why)
  if (reply.status === 403) return new CloudError('denied', why)
  return new CloudError('server', why)
}

type Body = ConstructorParameters<typeof Response>[0]

/** Runs bytes through a (de)compression stream. Typed loosely: the browser's and Node's typings of streams disagree. */
async function pipe(bytes: Uint8Array, through: unknown): Promise<Uint8Array> {
  // A plain stream rather than Blob.stream(), which not every environment has
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  }) as unknown as { pipeThrough: (pair: unknown) => unknown }
  return new Uint8Array(await new Response(source.pipeThrough(through) as Body).arrayBuffer())
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

const fromBase64 = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))

export interface CloudSnapshot {
  /** The snapshot file's JSON text, as `parseSnapshot` reads it. */
  text: string
  generatedAt: string
}

/** Stores the snapshot, compressed, replacing the last one. */
export async function putSnapshot(config: FirebaseConfig, session: Session, snapshotText: string, generatedAt: string, net = defaultNet()) {
  const gz = toBase64(await pipe(new TextEncoder().encode(snapshotText), new CompressionStream('gzip')))
  if (gz.length > MAX_SNAPSHOT_BASE64) throw new CloudError('too-big', 'The snapshot is too big for one Firestore document.')
  const reply = await call(net, documentUrl(config, net), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.idToken}` },
    body: JSON.stringify({
      fields: {
        gz: { bytesValue: gz },
        generatedAt: { stringValue: generatedAt },
        uploadedAt: { timestampValue: new Date(net.now()).toISOString() },
      },
    }),
  })
  if (!reply.ok) throw firestoreError(reply)
}

/** The stored snapshot, or null if none has been uploaded yet. */
export async function getSnapshot(config: FirebaseConfig, session: Session, net = defaultNet()): Promise<CloudSnapshot | null> {
  const reply = await call(net, documentUrl(config, net), { headers: { Authorization: `Bearer ${session.idToken}` } })
  if (reply.status === 404) return null
  if (!reply.ok) throw firestoreError(reply)
  const fields = reply.body?.fields as Record<string, { bytesValue?: unknown; stringValue?: unknown }> | undefined
  const gz = text(fields?.gz?.bytesValue)
  const generatedAt = text(fields?.generatedAt?.stringValue)
  if (!gz || !generatedAt) throw new CloudError('server', 'The stored snapshot is incomplete.')
  try {
    return { text: new TextDecoder().decode(await pipe(fromBase64(gz), new DecompressionStream('gzip'))), generatedAt }
  } catch {
    throw new CloudError('server', 'The stored snapshot couldn’t be unpacked.')
  }
}
