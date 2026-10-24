import { describe, expect, it, vi } from "vitest";
import { MultiDeviceSync, type SyncMessage } from "../multiDeviceSync";

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
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.body && typeof init.body === "string") {
        publishedPayloads.push(init.body);
      }
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

      // Wait a tick for async publishRemote to fire
      await new Promise((r) => setTimeout(r, 10));

      expect(publishedPayloads.length).toBeGreaterThanOrEqual(2);
      const parsed = publishedPayloads.map((p) => JSON.parse(p));
      expect(parsed.some((m) => m.type === "join" && m.senderName === "Alice")).toBe(true);
      expect(parsed.some((m) => m.type === "utterance" && m.utterance?.text === "Hello everyone")).toBe(true);

      // Reconnect simulation: trigger onclose then onopen again
      publishedPayloads.length = 0;
      if (ws && typeof ws.onopen === "function") {
        ws.onopen(new Event("open"));
      }
      await new Promise((r) => setTimeout(r, 10));

      // Join packet should be resent upon reconnect
      expect(publishedPayloads.some((p) => JSON.parse(p).type === "join")).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
      sync.destroy();
    }
  });

  it("handles incoming WebSocket message events and ignores own echoes", () => {
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
      ws.onmessage(
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
      ws.onmessage(
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
});
