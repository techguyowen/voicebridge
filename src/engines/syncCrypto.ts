export const E2EE_PREFIX = "vb-e2ee-v1:";

const keyCache = new Map<string, CryptoKey>();

function hasSubtle(): boolean {
  return typeof globalThis.crypto?.subtle !== "undefined";
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(room: string, pin: string): Promise<CryptoKey> {
  const cacheKey = `${room}:${pin}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;
  const enc = new TextEncoder();
  const baseKey = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(`${room}:${pin}`),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const derived = await globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("voicebridge-e2ee-v1:" + room),
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  keyCache.set(cacheKey, derived);
  return derived;
}

export async function encryptPayload(plaintext: string, room: string, pin: string): Promise<string> {
  if (!hasSubtle()) return plaintext;
  const key = await deriveKey(room, pin);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, enc.encode(plaintext))
  );
  const combined = new Uint8Array(12 + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, 12);
  return E2EE_PREFIX + toBase64(combined);
}

export async function decryptPayload(payload: string, room: string, pin: string): Promise<string | null> {
  if (!payload.startsWith(E2EE_PREFIX)) return payload;
  if (!hasSubtle()) return null;
  try {
    const combined = fromBase64(payload.slice(E2EE_PREFIX.length));
    if (combined.length < 12) return null;
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const key = await deriveKey(room, pin);
    const plainBuf = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}
