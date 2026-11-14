// base64 → Uint8Array (без atob: его в рантайме часов может не быть)
const T = new Uint8Array(128).fill(255)
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').forEach((c, i) => {
  T[c.charCodeAt(0)] = i
})

export function b64decode(s) {
  let n = s.length
  while (n > 0 && s.charCodeAt(n - 1) === 61) n--
  const out = new Uint8Array(Math.floor((n * 3) / 4))
  let o = 0
  let acc = 0
  let bits = 0
  for (let i = 0; i < n; i++) {
    const v = T[s.charCodeAt(i) & 127]
    if (v === 255) continue
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (acc >> bits) & 255
    }
  }
  return o === out.length ? out : out.slice(0, o)
}
