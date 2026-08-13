/**
 * Id generation. `nanoid` is not usable in the Figma sandbox (no `crypto`), so
 * ids are generated locally — see docs/DECISIONS.md, D-006.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZabcdefghijkmnpqrstvwxyz'

let counter = 0

/** Collision-resistant enough for per-document ids: time + counter + random. */
export function createId(size = 12): string {
  counter = (counter + 1) % 0xffff
  const seed = `${Date.now().toString(36)}${counter.toString(36)}`
  let out = ''
  for (let i = 0; i < size; i++) {
    const index = Math.floor(Math.random() * ALPHABET.length)
    out += ALPHABET.charAt(index)
  }
  return `${seed}${out}`.slice(0, Math.max(size, seed.length + 4))
}
