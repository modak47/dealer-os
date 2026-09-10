import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function createToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, hash: string) {
  const a = Buffer.from(tokenHash(token));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
