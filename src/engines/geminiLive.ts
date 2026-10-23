import {
  GoogleGenAI,
  type LiveConnectConfig,
  type LiveServerMessage,
  Modality,
} from "@google/genai";
import type { AudioSource, EngineEvents, SpeakerId, TranscriptionEngine, Utterance } from "../types";
import { int16ToBase64 } from "./audioCapture";

export const DEFAULT_ROLLOVER_MS = 9 * 60 * 1000;
export const DEFAULT_LIVE_MODEL = "gemini-3.5-transcribe-live";

export interface LiveSessionLike {
  sendRealtimeInput(input: {
    audio?: { data: string; mimeType: string };
    audioStreamEnd?: boolean;
  }): void;
  close(): void | Promise<void>;
}

export interface LiveConnectParams {
  model: string;
  config?: LiveConnectConfig;
  callbacks: {
    onopen?: (() => void) | null;
    onmessage: (message: LiveServerMessage) => void;
    onerror?: ((error: ErrorEvent) => void) | null;
    onclose?: ((event: CloseEvent) => void) | null;
  };
}

export type LiveConnector = (params: LiveConnectParams) => Promise<LiveSessionLike>;

export interface LiveEngineOptions {
  apiKey?: string;
  model?: string;
  rolloverMs?: number;
  connector?: LiveConnector;
}

export function parseLiveMessage(message: unknown): { interimText?: string; finalText?: string } {
  if (!message || typeof message !== "object") return {};
  const record = message as Record<string, unknown>;
  const content = (record.serverContent ?? record.server_content) as Record<string, unknown> | undefined;
  if (!content || typeof content !== "object") return {};

  let interimText: string | undefined;
  let finalText: string | undefined;

  const interim = (content.interimInputTranscription ?? content.interim_input_transcription) as
    | { text?: string }
    | undefined;
  if (interim && typeof interim.text === "string" && interim.text.trim().length > 0) {
    interimText = interim.text;
  }

  const final = (content.inputTranscription ?? content.input_transcription) as
    | { text?: string }
    | undefined;
  if (final && typeof final.text === "string" && final.text.trim().length > 0) {
    finalText = final.text;
  }

  return { interimText, finalText };
}

export function buildUtterance(
  id: string,
  text: string,
  startMs: number,
  endMs: number,
  speakerId: SpeakerId | null,
  final: boolean
): Utterance {
  return {
    id,
    text,
    startMs: Math.max(0, Math.round(startMs)),
    endMs: Math.max(startMs, Math.round(endMs)),
    speakerId,
    final,
  };
}

export function shouldTriggerRollover(sessionAgeMs: number, rolloverThresholdMs: number): boolean {
  return sessionAgeMs >= rolloverThresholdMs;
}

interface SourceLiveHandler {
  source: AudioSource;
  sourceIndex: number;
  speakerId: SpeakerId | null;
  activeSession: LiveSessionLike | null;
  sessionStartedAt: number;
  turnStartedAt: number;
  turnCounter: number;
  isRollingOver: boolean;
  isClosed: boolean;
  rolloverTimer: ReturnType<typeof setTimeout> | null;
}

export class GeminiLiveEngine implements TranscriptionEngine {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly rolloverMs: number;
  private readonly connector: LiveConnector;

  private events: EngineEvents | null = null;
  private handlers: SourceLiveHandler[] = [];
  private engineStartedAt = 0;
  private isRunning = false;

  constructor(options: LiveEngineOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.model = options.model ?? DEFAULT_LIVE_MODEL;
    this.rolloverMs = options.rolloverMs ?? DEFAULT_ROLLOVER_MS;

    if (options.connector) {
      this.connector = options.connector;
    } else {
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      this.connector = (params) =>
        ai.live.connect({
          model: params.model,
          config: params.config,
          callbacks: params.callbacks,
        }) as unknown as Promise<LiveSessionLike>;
    }
  }

  async start(sources: AudioSource[], events: EngineEvents): Promise<void> {
    this.events = events;
    this.isRunning = true;
    this.engineStartedAt = Date.now();

    events.onStatus({ state: "connecting" });

    try {
      this.handlers = await Promise.all(
        sources.map((source, index) => this.initSourceHandler(source, index))
      );
      events.onStatus({ state: "listening" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      events.onStatus({ state: "error", message });
      throw err;
    }
  }

  feedAudioChunk(sourceIndex: number, pcmData: Int16Array): void {
    if (!this.isRunning || sourceIndex >= this.handlers.length) return;
    const handler = this.handlers[sourceIndex];
    if (!handler || handler.isClosed || !handler.activeSession) return;

    const base64Audio = int16ToBase64(pcmData);
    try {
      handler.activeSession.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType: "audio/pcm;rate=16000",
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.events?.onStatus({ state: "error", message });
    }
  }

  private async initSourceHandler(
    source: AudioSource,
    sourceIndex: number
  ): Promise<SourceLiveHandler> {
    const speakerId: SpeakerId | null =
      source.kind === "channel" ? source.speakerId : null;

    const handler: SourceLiveHandler = {
      source,
      sourceIndex,
      speakerId,
      activeSession: null,
      sessionStartedAt: Date.now(),
      turnStartedAt: Date.now(),
      turnCounter: 0,
      isRollingOver: false,
      isClosed: false,
      rolloverTimer: null,
    };

    const session = await this.connectSession(handler);
    handler.activeSession = session;
    handler.sessionStartedAt = Date.now();
    this.scheduleRollover(handler);
    return handler;
  }

  private async connectSession(handler: SourceLiveHandler): Promise<LiveSessionLike> {
    const config: LiveConnectConfig = {
      responseModalities: [Modality.TEXT],
      inputAudioTranscription: {
        mode: "smart",
      } as LiveConnectConfig["inputAudioTranscription"],
    };

    return this.connector({
      model: this.model,
      config,
      callbacks: {
        onmessage: (msg: LiveServerMessage) => {
          if (!this.isRunning || handler.isClosed) return;
          const { interimText, finalText } = parseLiveMessage(msg);
          const now = Date.now();

          if (interimText && this.events) {
            const startMs = handler.turnStartedAt - this.engineStartedAt;
            const endMs = now - this.engineStartedAt;
            const utterance = buildUtterance(
              `${handler.sourceIndex}-interim-live`,
              interimText,
              startMs,
              endMs,
              handler.speakerId,
              false
            );
            this.events.onUtterance(utterance);
          }

          if (finalText && this.events) {
            const startMs = handler.turnStartedAt - this.engineStartedAt;
            const endMs = now - this.engineStartedAt;
            const finalId = `${handler.sourceIndex}-final-${handler.turnCounter++}-${now}`;
            const utterance = buildUtterance(
              finalId,
              finalText,
              startMs,
              endMs,
              handler.speakerId,
              true
            );
            this.events.onUtterance(utterance);
            // Clear the live interim row so finalized words are not duplicated.
            this.events.onUtterance(
              buildUtterance(
                `${handler.sourceIndex}-interim-live`,
                "",
                endMs,
                endMs,
                handler.speakerId,
                false
              )
            );
            handler.turnStartedAt = now;
          }
        },
        onerror: (err: ErrorEvent) => {
          if (!this.isRunning || handler.isClosed) return;
          this.events?.onStatus({ state: "error", message: err.message ?? "Live connection error" });
        },
        onclose: () => {},
      },
    });
  }

  private scheduleRollover(handler: SourceLiveHandler): void {
    if (handler.rolloverTimer) {
      clearTimeout(handler.rolloverTimer);
      handler.rolloverTimer = null;
    }
    if (this.rolloverMs <= 0 || !this.isRunning) return;

    handler.rolloverTimer = setTimeout(async () => {
      if (!this.isRunning || handler.isClosed) return;
      await this.performRollover(handler);
    }, this.rolloverMs);
  }

  private async performRollover(handler: SourceLiveHandler): Promise<void> {
    if (handler.isRollingOver || !this.isRunning) return;
    handler.isRollingOver = true;
    this.events?.onStatus({ state: "reconnecting" });

    const previousSession = handler.activeSession;
    try {
      const nextSession = await this.connectSession(handler);
      handler.activeSession = nextSession;
      handler.sessionStartedAt = Date.now();
      handler.isRollingOver = false;

      this.events?.onStatus({ state: "listening" });
      this.scheduleRollover(handler);

      if (previousSession) {
        try {
          previousSession.sendRealtimeInput({ audioStreamEnd: true });
        } catch {}
        setTimeout(() => {
          try {
            previousSession.close();
          } catch {}
        }, 1000);
      }
    } catch (err: unknown) {
      handler.isRollingOver = false;
      const message = err instanceof Error ? err.message : String(err);
      this.events?.onStatus({ state: "error", message });
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    for (const handler of this.handlers) {
      handler.isClosed = true;
      if (handler.rolloverTimer) {
        clearTimeout(handler.rolloverTimer);
        handler.rolloverTimer = null;
      }
      if (handler.activeSession) {
        try {
          handler.activeSession.sendRealtimeInput({ audioStreamEnd: true });
          handler.activeSession.close();
        } catch {}
      }
    }
    this.handlers = [];
    this.events?.onStatus({ state: "idle" });
  }
}
