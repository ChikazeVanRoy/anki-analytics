// Minimal protobuf reader for the few Anki settings blobs we need (deck presets, deck kind).
// Protobuf stores each field as (field number, wire type, value); we keep the raw values per field.

export interface ProtoField {
  varint?: number
  float?: number
  bytes?: Uint8Array
}

class Truncated extends Error {}

/**
 * Parses a protobuf message. Malformed or truncated input never throws: parsing stops and the fields
 * read so far are returned, so callers fall back to defaults for anything missing.
 */
export function parseProto(buf: Uint8Array): Map<number, ProtoField[]> {
  const fields = new Map<number, ProtoField[]>()
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let i = 0
  const need = (n: number) => {
    if (i + n > buf.length) throw new Truncated()
  }
  const varint = () => {
    let result = 0
    let shift = 1
    for (let k = 0; k < 10; k++) {
      need(1)
      const b = buf[i++]
      result += (b & 0x7f) * shift // multiply instead of << to stay exact beyond 32 bits
      if (!(b & 0x80)) return result
      shift *= 128
    }
    throw new Truncated() // more than 10 bytes is not a valid varint
  }
  const push = (field: number, value: ProtoField) => (fields.get(field) ?? fields.set(field, []).get(field)!).push(value)
  try {
    while (i < buf.length) {
      const key = varint()
      const field = Math.floor(key / 8)
      const wireType = key % 8
      if (wireType === 0) {
        const v = varint()
        push(field, { varint: v })
      } else if (wireType === 5) {
        need(4)
        push(field, { float: view.getFloat32(i, true) })
        i += 4
      } else if (wireType === 1) {
        need(8) // 64-bit: not used by the fields we read
        i += 8
      } else if (wireType === 2) {
        const len = varint()
        need(len)
        push(field, { bytes: buf.subarray(i, i + len) })
        i += len
      } else break // groups (3/4) are not used by Anki
    }
  } catch (err) {
    if (!(err instanceof Truncated)) throw err
  }
  return fields
}

/** A repeated float field: packed (one bytes chunk) or unpacked (several floats). */
export function floats(fields: Map<number, ProtoField[]>, n: number): number[] {
  const out: number[] = []
  for (const f of fields.get(n) ?? []) {
    if (f.float !== undefined) out.push(f.float)
    else if (f.bytes) {
      const v = new DataView(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength)
      for (let j = 0; j + 4 <= f.bytes.length; j += 4) out.push(v.getFloat32(j, true))
    }
  }
  return out
}

export const firstVarint = (fields: Map<number, ProtoField[]>, n: number) => fields.get(n)?.[0]?.varint
export const firstFloat = (fields: Map<number, ProtoField[]>, n: number) => fields.get(n)?.[0]?.float
export const firstBytes = (fields: Map<number, ProtoField[]>, n: number) => fields.get(n)?.[0]?.bytes
