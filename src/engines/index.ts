import type { AudioSource, EngineEvents, TranscriptionEngine, Utterance } from "../types";
import { type AudioCaptureController, startAudioCapture } from "./audioCapture";
import { GeminiDiarizer } from "./geminiDiarize";
import { GeminiLiveEngine } from "./geminiLive";

export * from "./audioCapture";
export * from "./geminiLive";
export * from "./geminiDiarize";

export class ComposedGeminiEngine implements TranscriptionEngine {
  private readonly apiKey: string;
  private liveEngine: GeminiLiveEngine | null = null;
  private diarizer: GeminiDiarizer | null = null;
  private captureController: AudioCaptureController | null = null;
  private utterances: Utterance[] = [];
  private isRunning = false;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async start(sources: AudioSource[], events: EngineEvents): Promise<void> {
    this.isRunning = true;
    this.utterances = [];

    const wrappedEvents: EngineEvents = {
      onUtterance: (u) => {
        const existingIdx = this.utterances.findIndex((existing) => existing.id === u.id);
        if (existingIdx >= 0) {
          this.utterances[existingIdx] = u;
        } else {
          this.utterances.push(u);
          if (this.utterances.length > 500) {
            this.utterances.splice(0, this.utterances.length - 500);
          }
        }
        events.onUtterance(u);
      },
      onRelabel: (utteranceIds, speakerId) => {
        const idSet = new Set(utteranceIds);
        for (const u of this.utterances) {
          if (idSet.has(u.id)) {
            u.speakerId = speakerId;
          }
        }
        events.onRelabel(utteranceIds, speakerId);
      },
      onStatus: (s) => events.onStatus(s),
    };

    this.liveEngine = new GeminiLiveEngine({ apiKey: this.apiKey });
    await this.liveEngine.start(sources, wrappedEvents);

    const hasMixSource = sources.some((s) => s.kind === "mix");
    if (hasMixSource) {
      this.diarizer = new GeminiDiarizer({ apiKey: this.apiKey });
      this.diarizer.start(Date.now());
    }

    try {
      this.captureController = await startAudioCapture(sources, (sourceIndex, pcm) => {
        if (!this.isRunning) return;

        this.liveEngine?.feedAudioChunk(sourceIndex, pcm);

        if (this.diarizer && sources[sourceIndex]?.kind === "mix") {
          this.diarizer.feedAudioChunk(
            pcm,
            () => this.utterances,
            wrappedEvents
          );
        }
      });
    } catch (err) {
      await this.stop();
      throw err;
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
    if (this.liveEngine) {
      try {
        await this.liveEngine.stop();
      } catch {}
      this.liveEngine = null;
    }
    if (this.diarizer) {
      this.diarizer.stop();
      this.diarizer = null;
    }
    this.utterances = [];
  }
}

export function createGeminiEngine(apiKey: string): TranscriptionEngine {
  return new ComposedGeminiEngine(apiKey);
}
