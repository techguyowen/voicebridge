import type { AudioSource, EngineEvents, SpeakerId, TranscriptionEngine, Utterance } from "../types";
import { type AudioCaptureController, startAudioCapture } from "./audioCapture";

export interface DeepgramEngineOptions {
  apiKey: string;
  model?: string;
  language?: string;
}

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}

interface DeepgramMessage {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      confidence?: number;
      words?: DeepgramWord[];
    }>;
  };
}

export class DeepgramEngine implements TranscriptionEngine {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly language: string;

  private ws: WebSocket | null = null;
  private captureController: AudioCaptureController | null = null;
  private events: EngineEvents | null = null;
  private isRunning = false;

  private currentTurnId = `dg-${Date.now()}`;
  private turnCounter = 0;
  private sessionStartedAt = Date.now();

  constructor(options: DeepgramEngineOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "nova-3";
    this.language = options.language ?? "en-US";
  }

  async start(sources: AudioSource[], events: EngineEvents): Promise<void> {
    this.isRunning = true;
    this.events = events;
    this.sessionStartedAt = Date.now();
    this.currentTurnId = `dg-${Date.now()}`;

    events.onStatus({ state: "connecting" });

    try {
      await this.connectWebSocket();
      events.onStatus({ state: "listening" });

      this.captureController = await startAudioCapture(sources, (_sourceIndex, pcm) => {
        if (!this.isRunning || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        // Deepgram accepts raw binary Int16Array PCM buffer
        this.ws.send(pcm.buffer);
      });
    } catch (err) {
      await this.stop();
      events.onStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Failed to connect to Deepgram",
      });
      throw err;
    }
  }

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        model: this.model,
        diarize: "true",
        punctuate: "true",
        interim_results: "true",
        smart_format: "true",
        encoding: "linear16",
        sample_rate: "16000",
        language: this.language,
        // Pass token in query string so browser WebSocket connects reliably without subprotocol rejection
        token: this.apiKey.trim(),
      });

      const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
      const ws = new WebSocket(url);
      this.ws = ws;

      let hasOpened = false;

      ws.onopen = () => {
        hasOpened = true;
        resolve();
      };

      ws.onmessage = (event) => {
        if (!this.isRunning || !this.events) return;
        try {
          const msg = JSON.parse(event.data as string) as DeepgramMessage;
          this.handleDeepgramMessage(msg);
        } catch {}
      };

      ws.onerror = (_err) => {
        if (!hasOpened) {
          reject(new Error("Failed to connect to Deepgram WebSocket. Verify your API key and network."));
        } else if (this.isRunning) {
          this.events?.onStatus({
            state: "error",
            message: "Deepgram WebSocket connection error.",
          });
        }
      };

      ws.onclose = () => {
        if (this.isRunning) {
          this.events?.onStatus({ state: "reconnecting" });
          setTimeout(() => {
            if (this.isRunning) {
              this.connectWebSocket().catch(() => {});
            }
          }, 1500);
        }
      };
    });
  }

  private handleDeepgramMessage(msg: DeepgramMessage): void {
    const alt = msg.channel?.alternatives?.[0];
    if (!alt || !alt.transcript || alt.transcript.trim().length === 0) return;

    const transcript = alt.transcript.trim();
    const isFinal = Boolean(msg.is_final);
    const words = alt.words ?? [];

    // Extract dominant speaker from words array
    let speakerId: SpeakerId | null = null;
    if (words.length > 0) {
      const counts = new Map<number, number>();
      for (const w of words) {
        if (typeof w.speaker === "number") {
          counts.set(w.speaker, (counts.get(w.speaker) ?? 0) + 1);
        }
      }
      let maxCount = 0;
      let dominantSpeakerNum: number | null = null;
      counts.forEach((count, spk) => {
        if (count > maxCount) {
          maxCount = count;
          dominantSpeakerNum = spk;
        }
      });
      if (dominantSpeakerNum !== null) {
        // Map 0 -> s1, 1 -> s2, 2 -> s3, etc.
        speakerId = `s${dominantSpeakerNum + 1}`;
      }
    }

    const now = Date.now();
    const startMs = words[0]?.start ? Math.round(words[0].start * 1000) : now - this.sessionStartedAt;
    const endMs = words[words.length - 1]?.end
      ? Math.round((words[words.length - 1]?.end ?? 0) * 1000)
      : now - this.sessionStartedAt;

    if (!isFinal) {
      const interimUtterance: Utterance = {
        id: "dg-interim-live",
        text: transcript,
        startMs,
        endMs,
        speakerId,
        final: false,
      };
      this.events?.onUtterance(interimUtterance);
    } else {
      const finalId = `final-${this.currentTurnId}-${this.turnCounter++}-${now}`;
      const finalUtterance: Utterance = {
        id: finalId,
        text: transcript,
        startMs,
        endMs,
        speakerId,
        final: true,
      };
      this.events?.onUtterance(finalUtterance);
      // Clear the live interim row so finalized words are not duplicated.
      this.events?.onUtterance({
        id: "dg-interim-live",
        text: "",
        startMs: now - this.sessionStartedAt,
        endMs: now - this.sessionStartedAt,
        speakerId,
        final: false,
      });
      this.currentTurnId = `dg-${Date.now()}`;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.captureController) {
      try {
        await this.captureController.stop();
      } catch {}
      this.captureController = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.events?.onStatus({ state: "idle" });
  }
}
