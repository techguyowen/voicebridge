import { describe, expect, it } from "vitest";
import { decryptPayload, E2EE_PREFIX, encryptPayload } from "../syncCrypto";

const ROOM = "TABLE-TEST1";
const PIN = "1234";

describe("syncCrypto", () => {
  it("round-trips plaintext through AES-256-GCM", async () => {
    const plaintext = JSON.stringify({ type: "utterance", text: "Hello everyone" });
    const encrypted = await encryptPayload(plaintext, ROOM, PIN);
    expect(encrypted.startsWith(E2EE_PREFIX)).toBe(true);
    expect(encrypted).not.toContain("Hello everyone");
    const decrypted = await decryptPayload(encrypted, ROOM, PIN);
    expect(decrypted).toBe(plaintext);
  });

  it("uses a unique IV per encryption", async () => {
    const a = await encryptPayload("same message", ROOM, PIN);
    const b = await encryptPayload("same message", ROOM, PIN);
    expect(a).not.toBe(b);
    expect(await decryptPayload(a, ROOM, PIN)).toBe("same message");
    expect(await decryptPayload(b, ROOM, PIN)).toBe("same message");
  });

  it("rejects decryption with a wrong PIN", async () => {
    const encrypted = await encryptPayload("secret speech", ROOM, PIN);
    expect(await decryptPayload(encrypted, ROOM, "9999")).toBeNull();
  });

  it("rejects tampered ciphertext", async () => {
    const encrypted = await encryptPayload("secret speech", ROOM, PIN);
    const b64 = encrypted.slice(E2EE_PREFIX.length);
    const tamperedChar = b64.endsWith("A") ? "B" : "A";
    const tampered = E2EE_PREFIX + b64.slice(0, -1) + tamperedChar;
    expect(await decryptPayload(tampered, ROOM, PIN)).toBeNull();
  });

  it("passes through legacy plaintext payloads without the prefix", async () => {
    const legacy = JSON.stringify({ type: "join", senderName: "Alice" });
    expect(await decryptPayload(legacy, ROOM, PIN)).toBe(legacy);
  });

  it("falls back to plaintext when Web Crypto subtle is unavailable", async () => {
    const origCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true, writable: true });
    try {
      expect(await encryptPayload("plain fallback", ROOM, PIN)).toBe("plain fallback");
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: origCrypto, configurable: true, writable: true });
    }
  });
});
