// Serves the built app, so the launcher needs one background process and no dev server.

import { readFileSync, statSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url))

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

/** The file a request asks for, or null for a broken path or one that leaves `distDir`. */
export function resolveFile(url: string, distDir: string): string | null {
  let path: string
  try {
    path = decodeURIComponent(new URL(url, 'http://localhost').pathname)
  } catch {
    return null
  }
  const root = resolve(distDir)
  const file = resolve(root, `.${path === '/' ? '/index.html' : path}`)
  return file.startsWith(root + sep) ? file : null
}

/** Sends the file if there is one. Returns false to let the caller answer 404. */
export function serveFile(url: string, distDir: string, res: ServerResponse): boolean {
  const file = resolveFile(url, distDir)
  const type = file && TYPES[extname(file)]
  if (!file || !type) return false
  try {
    if (!statSync(file).isFile()) return false
    const body = readFileSync(file)
    // File names under assets/ contain a content hash, so they never change; the page that names them does
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': file.startsWith(join(resolve(distDir), 'assets') + sep) ? 'max-age=31536000, immutable' : 'no-cache' })
    res.end(body)
    return true
  } catch {
    return false // no such file
  }
}
