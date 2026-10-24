import { Peer, type DataConnection } from "peerjs";
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
  private channel: BroadcastChannel | null = null;
  private handlers = new Set<SyncMessageHandler>();
  private statusHandlers = new Set<SyncStatusHandler>();
  private peer: Peer | null = null;
  private hostConnections = new Set<DataConnection>();
  private clientConnection: DataConnection | null = null;
  private isDestroyed = false;

  constructor(room: string, options?: MultiDeviceSyncOptions) {
    this.room = room;
    this.pin = options?.pin || "";
    this.isHost = options?.isHost ?? true;

    // 1. BroadcastChannel (for local tab communication / offline fallback)
    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.channel = new BroadcastChannel(`alt-room-${room}`);
        this.channel.onmessage = (event) => {
          const msg = event.data as SyncMessage;
          if (msg && msg.room === this.room) {
            this.notifyMessage(msg);
          }
        };
      } catch {}
    }

    // 2. PeerJS WebRTC (for real cross-device communication: phones -> tablet)
    if (typeof window !== "undefined" && typeof RTCPeerConnection !== "undefined") {
      this.initPeer();
    }
  }

  private getHostPeerId(): string {
    const cleanRoom = this.room.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
    const cleanPin = (this.pin || "").replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
    return `vb-${cleanRoom}-${cleanPin}`;
  }

  private setStatus(status: string): void {
    this.statusHandlers.forEach((h) => h(status));
  }

  private initPeer(): void {
    try {
      const hostPeerId = this.getHostPeerId();

      if (this.isHost) {
        // iPad / Host: Listen on fixed ID vb-${room}-${pin}
        this.peer = new Peer(hostPeerId);

        this.peer.on("open", () => {
          this.setStatus(`Host peer ready (${hostPeerId})`);
        });

        this.peer.on("connection", (conn) => {
          this.hostConnections.add(conn);
          conn.on("data", (data) => {
            const msg = data as SyncMessage;
            if (msg && msg.room === this.room) {
              this.notifyMessage(msg);
            }
          });
          conn.on("close", () => {
            this.hostConnections.delete(conn);
          });
          conn.on("error", () => {
            this.hostConnections.delete(conn);
          });
        });

        this.peer.on("error", (err) => {
          this.setStatus(`Host peer notice: ${err.type || err.message}`);
        });
      } else {
        // Phone / Client: Connect to host peer ID
        this.peer = new Peer();
        this.setStatus("Connecting to tablet...");

        this.peer.on("open", () => {
          this.connectToHost(hostPeerId);
        });

        this.peer.on("error", (err) => {
          this.setStatus(`Connection error: ${err.type || err.message}`);
        });
      }
    } catch (err) {
      this.setStatus(`Peer init failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private connectToHost(hostPeerId: string): void {
    if (!this.peer || this.isDestroyed) return;
    try {
      const conn = this.peer.connect(hostPeerId, { reliable: true });
      this.clientConnection = conn;

      conn.on("open", () => {
        this.setStatus("Connected to tablet (Peer)");
      });

      conn.on("data", (data) => {
        const msg = data as SyncMessage;
        if (msg && msg.room === this.room) {
          this.notifyMessage(msg);
        }
      });

      conn.on("close", () => {
        this.setStatus("Disconnected from tablet");
        this.clientConnection = null;
        if (!this.isDestroyed) {
          setTimeout(() => {
            if (!this.clientConnection && !this.isDestroyed) {
              this.connectToHost(hostPeerId);
            }
          }, 3000);
        }
      });

      conn.on("error", () => {
        this.setStatus("Error connecting to tablet");
      });
    } catch {
      this.setStatus("Failed to connect to tablet");
    }
  }

  private notifyMessage(msg: SyncMessage): void {
    this.handlers.forEach((h) => h(msg));
  }

  onMessage(handler: SyncMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onStatus(handler: SyncStatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  send(msg: Omit<SyncMessage, "room">): void {
    const fullMsg: SyncMessage = { ...msg, room: this.room, pin: msg.pin || this.pin };
    // Send via BroadcastChannel (local tabs fallback)
    try {
      this.channel?.postMessage(fullMsg);
    } catch {}

    // Send via PeerJS WebRTC
    if (this.isHost) {
      this.hostConnections.forEach((conn) => {
        if (conn.open) {
          try {
            conn.send(fullMsg);
          } catch {}
        }
      });
    } else {
      if (this.clientConnection && this.clientConnection.open) {
        try {
          this.clientConnection.send(fullMsg);
        } catch {}
      }
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    this.handlers.clear();
    this.statusHandlers.clear();
    try {
      this.channel?.close();
    } catch {}
    this.channel = null;

    if (this.clientConnection) {
      try {
        this.clientConnection.close();
      } catch {}
      this.clientConnection = null;
    }

    this.hostConnections.forEach((conn) => {
      try {
        conn.close();
      } catch {}
    });
    this.hostConnections.clear();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
  }
}
