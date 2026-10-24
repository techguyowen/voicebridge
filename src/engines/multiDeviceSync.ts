import type { SyncMessage } from "../types";

export type { SyncMessage };
export type SyncMessageHandler = (msg: SyncMessage) => void;
export type SyncStatusHandler = (status: string) => void;

export interface MultiDeviceSyncOptions {
  isHost?: boolean;
  pin?: string;
}

export class MultiDeviceSync {
  private room: string;
  private pin: string;
  private isHost: boolean;

  public getIsHost(): boolean {
    return this.isHost;
  }
  private clientId: string;
  private channel: BroadcastChannel | null = null;
  private ws: WebSocket | null = null;
  private handlers = new Set<SyncMessageHandler>();
  private statusHandlers = new Set<SyncStatusHandler>();
  private messageQueue: SyncMessage[] = [];
  private lastJoinMessage: SyncMessage | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isDestroyed = false;
  private currentStatus = "Connecting to tablet...";
  private seenMessages = new Map<string, number>();

  constructor(room: string, options?: MultiDeviceSyncOptions) {
    this.room = room;
    this.pin = options?.pin || "";
    this.isHost = options?.isHost ?? true;
    this.clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const cleanRoom = (this.room || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "default";
    const cleanPin = (this.pin || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

    // 1. BroadcastChannel (for local tab communication / same device / offline fallback)
    if (typeof BroadcastChannel !== "undefined") {
      try {
        const channelName = cleanPin ? `alt-room-${cleanRoom}-${cleanPin}` : `alt-room-${cleanRoom}`;
        this.channel = new BroadcastChannel(channelName);
        this.channel.onmessage = (event) => {
          if (this.isDestroyed) return;
          const msg = event.data as SyncMessage & { _senderId?: string };
          if (msg && msg.room === this.room && (!msg._senderId || msg._senderId !== this.clientId)) {
            this.notifyMessage(msg);
          }
        };
      } catch {}
    }

    // 2. WebSocket relay via ntfy.sh (for zero-NAT, cross-network communication)
    if (typeof WebSocket !== "undefined") {
      this.initWebSocket();
    }
  }

  public getTopic(): string {
    const cleanRoom = (this.room || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "default";
    const cleanPin = (this.pin || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    return `vb-${cleanRoom}-${cleanPin}`;
  }

  private setStatus(status: string): void {
    this.currentStatus = status;
    this.statusHandlers.forEach((h) => h(status));
  }

  private initWebSocket(): void {
    if (this.isDestroyed) return;
    const topic = this.getTopic();
    const wsUrl = `wss://ntfy.sh/${topic}/ws`;

    try {
      this.setStatus(this.reconnectAttempts > 0 ? "Reconnecting..." : "Connecting to tablet...");
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.isDestroyed) {
          ws.close();
          return;
        }
        this.reconnectAttempts = 0;
        this.setStatus("Connected to tablet");

        // Automatically resend the join packet on socket connect/reconnect so the host ALWAYS registers the connected phone
        if (this.lastJoinMessage) {
          void this.publishRemote(this.lastJoinMessage);
        }

        // Flush any messages queued before socket opened
        while (this.messageQueue.length > 0) {
          const queuedMsg = this.messageQueue.shift();
          if (queuedMsg) {
            if (this.lastJoinMessage && queuedMsg === this.lastJoinMessage) {
              continue;
            }
            void this.publishRemote(queuedMsg);
          }
        }
      };

      ws.onmessage = (event) => {
        if (this.isDestroyed) return;
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : null;
          if (data && data.event === "message" && data.message) {
            const msg = JSON.parse(data.message) as SyncMessage & { _senderId?: string };
            if (msg && msg.room === this.room && (!msg._senderId || msg._senderId !== this.clientId)) {
              this.notifyMessage(msg);
            }
          }
        } catch {}
      };

      ws.onerror = () => {
        // onclose will trigger reconnect
      };

      ws.onclose = () => {
        if (this.isDestroyed) return;
        this.setStatus("Reconnecting...");
        this.scheduleReconnect();
      };
    } catch {
      if (!this.isDestroyed) {
        this.setStatus("Reconnecting...");
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.isDestroyed) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, Math.min(this.reconnectAttempts, 5)), 10000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isDestroyed) {
        this.initWebSocket();
      }
    }, delay);
  }

  private isDuplicate(msg: SyncMessage): boolean {
    const now = Date.now();
    for (const [k, timestamp] of this.seenMessages.entries()) {
      if (now - timestamp > 10000) {
        this.seenMessages.delete(k);
      }
    }

    let key: string;
    if (msg.type === "utterance" && msg.utterance) {
      key = `u:${msg.utterance.id}:${msg.utterance.text}:${msg.utterance.final}`;
    } else {
      key = `${msg.type}:${msg.senderName}:${msg.room}:${msg.pin || ""}`;
    }

    if (this.seenMessages.has(key)) {
      return true;
    }
    this.seenMessages.set(key, now);
    return false;
  }

  private notifyMessage(msg: SyncMessage): void {
    if (this.isDuplicate(msg)) return;
    this.handlers.forEach((h) => h(msg));
  }

  onMessage(handler: SyncMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onStatus(handler: SyncStatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.currentStatus);
    return () => this.statusHandlers.delete(handler);
  }

  private async publishRemote(msg: SyncMessage & { _senderId?: string }): Promise<void> {
    try {
      const topic = this.getTopic();
      if (typeof fetch !== "undefined") {
        await fetch(`https://ntfy.sh/${topic}`, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(msg),
        });
      }
    } catch {}
  }

  send(msg: Omit<SyncMessage, "room">): void {
    const fullMsg: SyncMessage & { _senderId: string } = {
      ...msg,
      room: this.room,
      pin: msg.pin || this.pin,
      _senderId: this.clientId,
    };

    // If join packet, remember it so connect/reconnect automatically resends it
    if (fullMsg.type === "join") {
      this.lastJoinMessage = fullMsg;
    }

    // 1. Immediate BroadcastChannel delivery for local tabs / offline fallback
    try {
      this.channel?.postMessage(fullMsg);
    } catch {}

    // 2. ntfy.sh relay delivery: if socket is open, publish remotely; otherwise queue it
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      void this.publishRemote(fullMsg);
    } else {
      this.messageQueue.push(fullMsg);
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    this.handlers.clear();
    this.statusHandlers.clear();
    this.messageQueue = [];
    this.lastJoinMessage = null;
    this.seenMessages.clear();

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      this.channel?.close();
    } catch {}
    this.channel = null;

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}
