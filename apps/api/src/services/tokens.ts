import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Zufälliges Base62-Token; 22 Zeichen ≈ 131 Bit. Gleichverteilt durch Verwerfen zu großer Bytes. */
export function randomToken(length = 22): string {
  let out = '';
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < 248) out += ALPHABET[b % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export const randomSecret = () => randomBytes(32);
