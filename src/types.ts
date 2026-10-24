export type SpeakerId = string;

export interface Speaker {
  id: SpeakerId;
  name: string;
  color: string;
  position?: "left" | "across" | "right" | "near" | "none";
}

export interface Utterance {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  speakerId: SpeakerId | null;
  final: boolean;
  starred?: boolean;
}

export interface SyncMessage {
  type: "utterance" | "join" | "leave" | "status";
  room: string;
  senderName: string;
  senderColor?: string;
  pin?: string;
  utterance?: Utterance;
}

export type AudioSource =
  | { kind: "mix"; deviceId?: string }
  | { kind: "channel"; deviceId?: string; channel: 0 | 1; speakerId: SpeakerId };

export interface AudioLevel {
  left: number;
  right: number;
  activeSpeakerId?: SpeakerId | null;
}

export interface EngineEvents {
  onUtterance(u: Utterance): void;
  onRelabel(utteranceIds: string[], speakerId: SpeakerId): void;
  onStatus(s: EngineStatus): void;
  onAudioLevel?(level: AudioLevel): void;
}

export type EngineStatus =
  | { state: "idle" }
  | { state: "connecting" }
  | { state: "listening" }
  | { state: "reconnecting" }
  | { state: "error"; message: string };

export interface TranscriptionEngine {
  start(sources: AudioSource[], events: EngineEvents): Promise<void>;
  stop(): Promise<void>;
  resumeIfNeeded?(): Promise<void>;
}
