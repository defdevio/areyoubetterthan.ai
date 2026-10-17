const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Lowercase alphanumeric id from a CSPRNG. 16 chars ≈ 82 bits. */
export function newId(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  // 252 is the largest multiple of 36 below 256; rejection sampling keeps it unbiased.
  for (let i = 0; out.length < length; i++) {
    if (i >= bytes.length) {
      crypto.getRandomValues(bytes);
      i = 0;
    }
    if (bytes[i] < 252) out += ALPHABET[bytes[i] % 36];
  }
  return out;
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] & 0x7fffffff;
}
