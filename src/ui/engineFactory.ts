import type { AudioSource, EngineEvents, TranscriptionEngine } from "../types";
import type { Settings } from "./store";
import { WebSpeechEngine } from "../engines/webSpeechEngine";
import { DeepgramEngine } from "../engines/deepgramEngine";

/**
 * Resilient engine wrapper: attempts the primary engine (e.g. Gemini or Deepgram),
 * but if initialization or connection fails (network error, model 404, invalid key),
 * it seamlessly and instantly falls back to the local Web Speech engine so the user's
 * microphone ALWAYS starts and speech is never dropped!
 */
export class ResilientEngine implements TranscriptionEngine {
  private activeEngine: TranscriptionEngine | null = null;

  constructor(
    private primary: TranscriptionEngine,
    private fallback: TranscriptionEngine,
    private engineName: string
  ) {}

  async start(sources: AudioSource[], events: EngineEvents): Promise<void> {
    try {
      this.activeEngine = this.primary;
      await this.primary.start(sources, events);
    } catch (err) {
      console.warn(`Primary cloud engine (${this.engineName}) failed to start. Falling back to local Web Speech:`, err);
      events.onStatus({
        state: "connecting",
      });
      this.activeEngine = this.fallback;
      await this.fallback.start(sources, {
        ...events,
        onStatus: (s) => {
          if (s.state === "listening") {
            events.onStatus({
              state: "listening",
            });
          } else {
            events.onStatus(s);
          }
        },
      });
    }
  }

  async stop(): Promise<void> {
    const engine = this.activeEngine;
    this.activeEngine = null;
    if (engine) {
      await engine.stop();
    } else {
      await Promise.allSettled([this.primary.stop(), this.fallback.stop()]);
    }
  }
}

export async function createEngine(settings: Settings): Promise<TranscriptionEngine> {
  const fallback = new WebSpeechEngine({
    stereoVad: settings.stereoMode,
    deviceId: settings.deviceId || undefined,
    lang: settings.speechLanguage || "en-US",
    noiseGate: settings.noiseGateThreshold,
  });

  // 1. Explicit native speech choice:
  if (settings.engineChoice === "web-speech") {
    return fallback;
  }

  // 2. If Deepgram key is supplied and active:
  if (
    (settings.engineChoice === "deepgram" || settings.engineChoice === "auto") &&
    settings.deepgramKey.trim()
  ) {
    const deepgram = new DeepgramEngine({ apiKey: settings.deepgramKey.trim() });
    return new ResilientEngine(deepgram, fallback, "Deepgram Nova-3");
  }

  // 3. If Gemini key is supplied and active:
  if (
    (settings.engineChoice === "gemini" || settings.engineChoice === "auto") &&
    settings.apiKey.trim()
  ) {
    try {
      const mod = await import("../engines");
      if (typeof mod.createGeminiEngine === "function") {
        const gemini = mod.createGeminiEngine(settings.apiKey.trim());
        return new ResilientEngine(gemini, fallback, "Google Gemini Live");
      }
    } catch (err) {
      console.warn("Could not load Gemini engine module, falling back to Web Speech", err);
    }
  }

  // Default: Browser Web Speech
  return fallback;
}
