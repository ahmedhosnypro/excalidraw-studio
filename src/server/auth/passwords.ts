/**
 * Password hashing with PBKDF2-SHA256 via Web Crypto — zero native deps,
 * runs identically under Node, Bun and edge-ish runtimes.
 *
 * Stored format: `pbkdf2$<iterations>$<saltB64>$<hashB64>`
 */
const ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const ALGORITHM = "PBKDF2";
const HASH = "SHA-256";

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: ALGORITHM },
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      salt: salt as BufferSource,
      iterations,
      hash: HASH,
    },
    key,
    KEY_LENGTH * 8,
  );
}

/** Timing-safe comparison of two byte sequences. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(hash))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }
  const iterations = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }
  const salt = fromBase64(parts[2] ?? "");
  const expected = fromBase64(parts[3] ?? "");
  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(new Uint8Array(actual), expected);
}
