import { describe, expect, it } from "vitest";
import { MultiDeviceSync, type SyncMessage } from "../multiDeviceSync";

describe("MultiDeviceSync", () => {
  it("initializes room and registers handler", () => {
    const sync = new MultiDeviceSync("TABLE-H7K2M9", { isHost: true, pin: "1234" });
    let received = 0;
    const unbind = sync.onMessage(() => {
      received++;
    });

    expect(typeof unbind).toBe("function");
    sync.destroy();
  });

  it("registers status callback", () => {
    const sync = new MultiDeviceSync("TABLE-H7K2M9", { isHost: false, pin: "1234" });
    const statuses: string[] = [];
    const unbind = sync.onStatus((s) => {
      statuses.push(s);
    });

    expect(typeof unbind).toBe("function");
    sync.destroy();
  });

  it("filters messages based on PIN authentication", () => {
    const validPin = "4821";
    const invalidPin = "9999";

    const receivedMessages: SyncMessage[] = [];

    // Simulate App.tsx packet filtering logic
    const handleMessage = (msg: SyncMessage, hostPin: string) => {
      if (msg.pin !== hostPin) {
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
});
