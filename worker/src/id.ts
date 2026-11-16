const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  const timestamp = Date.now().toString(36).padStart(9, "0");
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let suffix = "";
  for (const byte of bytes) {
    suffix += ALPHABET.charAt(byte % ALPHABET.length);
  }
  return timestamp + suffix;
}

export function randomBase36(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let value = "";
  for (const byte of bytes) {
    value += ALPHABET.charAt(byte % ALPHABET.length);
  }
  return value;
}

export function randomHex(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let value = "";
  for (const byte of data) {
    value += byte.toString(16).padStart(2, "0");
  }
  return value;
}

export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  let hex = "";
  for (const byte of new Uint8Array(digest)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
