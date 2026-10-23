import type { Utterance } from "../types";

export interface SyncMessage {
  type: "utterance" | "join" | "leave" | "status";
  room: string;
  senderName: string;
  senderColor?: string;
  utterance?: Utterance;
}

export type SyncMessageHandler = (msg: SyncMessage) => void;

export class MultiDeviceSync {
  private room: string;
  private channel: BroadcastChannel | null = null;
  private handlers = new Set<SyncMessageHandler>();

  constructor(room: string) {
    this.room = room;
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(`alt-room-${room}`);
      this.channel.onmessage = (event) => {
        const msg = event.data as SyncMessage;
        if (msg && msg.room === this.room) {
          this.handlers.forEach((h) => h(msg));
        }
      };
    }
  }

  onMessage(handler: SyncMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(msg: Omit<SyncMessage, "room">): void {
    const fullMsg: SyncMessage = { ...msg, room: this.room };
    this.channel?.postMessage(fullMsg);
  }

  destroy(): void {
    this.handlers.clear();
    this.channel?.close();
    this.channel = null;
  }
}
