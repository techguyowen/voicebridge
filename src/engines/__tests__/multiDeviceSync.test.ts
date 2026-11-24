import { describe, expect, it, vi } from "vitest";
import { MultiDeviceSync, type SyncMessage } from "../multiDeviceSync";
import { decryptPayload, E2EE_PREFIX } from "../syncCrypto";

describe("MultiDeviceSync", () => {
  it("initializes room and registers handler", () => {
    const sync = new MultiDeviceSync("TABLE-H7K2M9", { isHost: true, pin: "1234" });
    let received = 0;
    const unbind = sync.onMessage(() => {
      received++;
    });

    expect(typeof unbind).toBe("function");
    expect(received).toBe(0);
    sync.destroy();
  });

  it("registers status callback and immediately notifies current status", () => {
    const sync = new MultiDeviceSync("TABLE-H7K2M9", { isHost: false, pin: "1234" });
    const statuses: string[] = [];
    const unbind = sync.onStatus((s) => {
      statuses.push(s);
    });

    expect(typeof unbind).toBe("function");
    expect(statuses).toContain("Connecting to tablet...");
    sync.destroy();
  });

  it("computes lowercase alphanumeric topic name for ntfy relay", () => {
    const sync1 = new MultiDeviceSync("TABLE-H7K2M9", { isHost: true, pin: "1234" });
    expect(sync1.getTopic()).toBe("vb-tableh7k2m9-1234");
    sync1.destroy();

    const sync2 = new MultiDeviceSync("Family Dinner #42!", { isHost: false, pin: "8899" });
    expect(sync2.getTopic()).toBe("vb-familydinner42-8899");
    sync2.destroy();
  });

  it("filters messages based on PIN authentication", () => {
    const validPin = "4821";
    const invalidPin = "9999";

    const receivedMessages: SyncMessage[] = [];

    // Simulate App.tsx packet filtering logic
    const handleMessage = (msg: SyncMessage, hostPin: string) => {
      const cleanHost = (hostPin || "").trim().toLowerCase();
      const cleanMsg = (msg.pin || "").trim().toLowerCase();
      if (cleanHost && cleanMsg !== cleanHost) {
        return; // Drop packet!
      }
      receivedMessages.push(msg);
    };

    const goodMsg: SyncMessage = {
      type: "utterance",
      room: "TABLE-TEST",
      senderName: "Alice",
      pin: validPin,
      utterance: {
        id: "u1",
        text: "Pass the potatoes please",
        startMs: 1000,
        endMs: 2000,
        speakerId: "alice",
        final: true,
      },
    };

    const badMsg: SyncMessage = {
      type: "utterance",
      room: "TABLE-TEST",
      senderName: "Eve",
      pin: invalidPin,
      utterance: {
        id: "u2",
        text: "I am an unauthorized intruder",
        startMs: 2500,
        endMs: 3500,
        speakerId: "eve",
        final: true,
      },
    };

    handleMessage(goodMsg, validPin);
    handleMessage(badMsg, validPin);

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]?.senderName).toBe("Alice");
    expect(receivedMessages[0]?.utterance?.text).toBe("Pass the potatoes please");
  });

  it("handles join and utterance messages with dynamic speaker registration", () => {
    const registeredSpeakers: Array<{ id: string; name: string; color: string }> = [];

    const onSyncPacket = (msg: SyncMessage, hostPin: string) => {
      if (msg.pin !== hostPin) return;
      if ((msg.type === "join" || msg.type === "utterance") && msg.senderName) {
        const id = msg.utterance?.speakerId || msg.senderName.toLowerCase().replace(/\s+/g, "_");
        registeredSpeakers.push({
          id,
          name: msg.senderName,
          color: msg.senderColor || "#4fc3f7",
        });
      }
    };

    onSyncPacket(
      {
        type: "join",
        room: "TABLE-1",
        senderName: "Uncle Bob",
        senderColor: "#ff9800",
        pin: "5555",
      },
      "5555"
    );

    expect(registeredSpeakers).toHaveLength(1);
    expect(registeredSpeakers[0]?.id).toBe("uncle_bob");
    expect(registeredSpeakers[0]?.name).toBe("Uncle Bob");
    expect(registeredSpeakers[0]?.color).toBe("#ff9800");
  });

  it("queues messages sent before websocket opens and preserves join packet for reconnect", async () => {
    const sync = new MultiDeviceSync("TABLE-Q1", { isHost: false, pin: "1111" });

    // Mock fetch to track remote publications
    const publishedPayloads: string[] = [];
    const publishedHeaders: Array<Record<string, string>> = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.body && typeof init.body === "string") {
        publishedPayloads.push(init.body);
      }
      publishedHeaders.push((init?.headers ?? {}) as Record<string, string>);
      return { ok: true, status: 200 } as Response;
    });

    try {
      // Send join before socket is ready
      sync.send({
        type: "join",
        senderName: "Alice",
        pin: "1111",
      });

      // Send speech turn before socket is ready
      sync.send({
        type: "utterance",
        senderName: "Alice",
        pin: "1111",
        utterance: {
          id: "phone-alice-1",
          text: "Hello everyone",
          startMs: 100,
          endMs: 200,
          speakerId: "alice",
          final: true,
        },
      });

      // Directly trigger WebSocket onopen simulation
      const ws = (sync as any).ws;
      if (ws && typeof ws.onopen === "function") {
        ws.onopen(new Event("open"));
      }

      // Wait for async publishRemote (incl. PBKDF2 key derivation) to fire
      await vi.waitFor(() => {
        expect(publishedPayloads.length).toBeGreaterThanOrEqual(2);
      });
      // Payloads are E2EE-encrypted; decrypt before asserting.
      for (const p of publishedPayloads) {
        expect(p.startsWith(E2EE_PREFIX)).toBe(true);
      }
      const decrypted = await Promise.all(
        publishedPayloads.map((p) => decryptPayload(p, "TABLE-Q1", "1111"))
      );
      const parsed = decrypted.map((p) => JSON.parse(p as string));
      expect(parsed.some((m) => m.type === "join" && m.senderName === "Alice")).toBe(true);
      expect(parsed.some((m) => m.type === "utterance" && m.utterance?.text === "Hello everyone")).toBe(true);
      // ntfy relay must not cache message contents server-side.
      expect(publishedHeaders.length).toBeGreaterThanOrEqual(2);
      for (const h of publishedHeaders) {
        expect(h["Cache"]).toBe("no");
      }

      // Reconnect simulation: trigger onclose then onopen again
      publishedPayloads.length = 0;
      if (ws && typeof ws.onopen === "function") {
        ws.onopen(new Event("open"));
      }
      await vi.waitFor(() => {
        expect(publishedPayloads.length).toBeGreaterThanOrEqual(1);
      });

      // Join packet should be resent upon reconnect
      const reconnected = await Promise.all(
        publishedPayloads.map((p) => decryptPayload(p, "TABLE-Q1", "1111"))
      );
      expect(reconnected.some((p) => JSON.parse(p as string).type === "join")).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
      sync.destroy();
    }
  });

  it("handles incoming WebSocket message events and ignores own echoes", async () => {
    const sync = new MultiDeviceSync("TABLE-ECHO", { isHost: true, pin: "0000" });
    const received: SyncMessage[] = [];
    sync.onMessage((m) => received.push(m));

    const ws = (sync as any).ws;
    const clientId = (sync as any).clientId;

    // Simulate receiving an external message from another device
    const externalMsg: SyncMessage & { _senderId: string } = {
      type: "utterance",
      room: "TABLE-ECHO",
      senderName: "Grandma",
      pin: "0000",
      _senderId: "other-client-999",
      utterance: {
        id: "turn-1",
        text: "Could someone pass the salt?",
        startMs: 1000,
        endMs: 2000,
        speakerId: "grandma",
        final: true,
      },
    };

    if (ws && typeof ws.onmessage === "function") {
      await ws.onmessage(
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "message",
            topic: "vb-tableecho-0000",
            message: JSON.stringify(externalMsg),
          }),
        })
      );
    }

    expect(received).toHaveLength(1);
    expect(received[0]?.utterance?.text).toBe("Could someone pass the salt?");

    // Simulate self-echo from relay with our own clientId
    const selfEchoMsg = {
      ...externalMsg,
      _senderId: clientId,
      utterance: {
        id: "turn-self",
        text: "Self message",
        startMs: 1,
        endMs: 2,
        speakerId: "grandma",
        final: true,
      },
    };

    if (ws && typeof ws.onmessage === "function") {
      await ws.onmessage(
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "message",
            topic: "vb-tableecho-0000",
            message: JSON.stringify(selfEchoMsg),
          }),
        })
      );
    }

    // Length should still be 1 (self echo was ignored!)
    expect(received).toHaveLength(1);

    sync.destroy();
  });

  it("decrypts E2EE relay messages and drops undecryptable payloads", async () => {
    const { encryptPayload } = await import("../syncCrypto");
    const sync = new MultiDeviceSync("TABLE-E2E", { isHost: true, pin: "2468" });
    const received: SyncMessage[] = [];
    sync.onMessage((m) => received.push(m));
    const ws = (sync as any).ws;

    const msg: SyncMessage & { _senderId: string } = {
      type: "utterance",
      room: "TABLE-E2E",
      senderName: "Dad",
      pin: "2468",
      _senderId: "other-client-1",
      utterance: { id: "e2e-1", text: "Encrypted hello", startMs: 1, endMs: 2, speakerId: "dad", final: true },
    };
    const encrypted = await encryptPayload(JSON.stringify(msg), "TABLE-E2E", "2468");
    await ws.onmessage(
      new MessageEvent("message", {
        data: JSON.stringify({ event: "message", topic: "vb-tablee2e-2468", message: encrypted }),
      })
    );
    expect(received).toHaveLength(1);
    expect(received[0]?.utterance?.text).toBe("Encrypted hello");

    // Tampered ciphertext must be dropped silently.
    const tampered = encrypted.slice(0, -2) + (encrypted.endsWith("AA") ? "BB" : "AA");
    await ws.onmessage(
      new MessageEvent("message", {
        data: JSON.stringify({ event: "message", topic: "vb-tablee2e-2468", message: tampered }),
      })
    );
    expect(received).toHaveLength(1);
    sync.destroy();
  });

  it("cleans up resources and closes connections on destroy", () => {
    const sync = new MultiDeviceSync("TABLE-CLEANUP", { isHost: false, pin: "7777" });
    expect((sync as any).isDestroyed).toBe(false);

    sync.destroy();

    expect((sync as any).isDestroyed).toBe(true);
    expect((sync as any).ws).toBeNull();
    expect((sync as any).channel).toBeNull();
    expect((sync as any).handlers.size).toBe(0);
    expect((sync as any).statusHandlers.size).toBe(0);
    expect((sync as any).messageQueue).toHaveLength(0);
  });

  it("sends table signals with signalKind, signalText, and room pin", () => {
    const sync = new MultiDeviceSync("TABLE-SIGNAL", { isHost: true, pin: "4321" });
    const sentMessages: any[] = [];
    (sync as any).channel = {
      postMessage: (msg: any) => sentMessages.push(msg),
      close: () => {},
    };

    sync.sendSignal("repeat", "Please repeat that");

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]?.type).toBe("signal");
    expect(sentMessages[0]?.senderName).toBe("Tablet");
    expect(sentMessages[0]?.signalKind).toBe("repeat");
    expect(sentMessages[0]?.signalText).toBe("Please repeat that");
    expect(sentMessages[0]?.pin).toBe("4321");

    sync.destroy();
  });

  it("sends each supported signal kind from the tablet", () => {
    const sync = new MultiDeviceSync("TABLE-SIGNAL", { isHost: true, pin: "4321" });
    const sentMessages: any[] = [];
    (sync as any).channel = {
      postMessage: (msg: any) => sentMessages.push(msg),
      close: () => {},
    };

    const signals = [
      ["repeat", "Please repeat that"],
      ["slow-down", "Slower please"],
      ["hold-on", "Hold on, I'm reading"],
      ["chime-in", "I want to chime in"],
    ] as const;
    for (const [kind, text] of signals) {
      sync.sendSignal(kind, text);
    }

    expect(sentMessages).toHaveLength(4);
    expect(sentMessages.map((m) => m.signalKind)).toEqual([
      "repeat",
      "slow-down",
      "hold-on",
      "chime-in",
    ]);
    expect(sentMessages.every((m) => m.type === "signal" && m.senderName === "Tablet")).toBe(true);

    sync.destroy();
  });

  it("sends kick and mute messages with correct targetId and sender", () => {
    const sync = new MultiDeviceSync("TABLE-KICK", { isHost: true, pin: "4321" });
    const sentMessages: any[] = [];
    (sync as any).channel = {
      postMessage: (msg: any) => sentMessages.push(msg),
      close: () => {},
    };

    sync.sendKick("phone_device_1");
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]?.type).toBe("kick");
    expect(sentMessages[0]?.targetId).toBe("phone_device_1");
    expect(sentMessages[0]?.senderName).toBe("Host");

    sync.sendMute("phone_device_2", true);
    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[1]?.type).toBe("mute");
    expect(sentMessages[1]?.targetId).toBe("phone_device_2");

    sync.sendMute("phone_device_2", false);
    expect(sentMessages).toHaveLength(3);
    expect(sentMessages[2]?.type).toBe("unmute");
    expect(sentMessages[2]?.targetId).toBe("phone_device_2");

    sync.destroy();
  });
});
