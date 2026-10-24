import type { AudioSource, EngineEvents, SpeakerId, TranscriptionEngine, Utterance } from "../types";

// Extended SpeechRecognition types for cross-browser support
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface WebSpeechEngineOptions {
  lang?: string;
  stereoVad?: boolean;
  deviceId?: string;
  noiseGate?: number;
}

export class WebSpeechEngine implements TranscriptionEngine {
  private recognition: SpeechRecognitionInstance | null = null;
  private isRunning = false;
  private events: EngineEvents | null = null;
  private lang: string;
  private stereoVad: boolean;
  private deviceId?: string;
  private noiseGate: number;

  // AudioContext for VU meter & stereo channel detection
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private meterInterval: ReturnType<typeof setInterval> | null = null;
  private currentActiveSpeakerId: SpeakerId | null = null;
  private sources: AudioSource[] = [];

  private currentTurnId = `ws-${Date.now()}`;
  private turnCounter = 0;
  private turnStartTime = Date.now();

  /** Single stable row for streaming interim words — never spawns extra rows. */
  private static readonly INTERIM_ID = "ws-interim-live";
  /** Ignore speaker flips faster than this (stereo VAD flicker smoothing). */
  private static readonly MIN_TURN_MS = 2000;
  private lastEmittedSpeaker: SpeakerId | null = null;
  private lastSpeakerSwitchAt = 0;
  private interimTimer: ReturnType<typeof setTimeout> | null = null;

  private clearInterim(): void {
    if (this.interimTimer) {
      clearTimeout(this.interimTimer);
      this.interimTimer = null;
    }
    this.events?.onUtterance({
      id: WebSpeechEngine.INTERIM_ID,
      text: "",
      startMs: Date.now(),
      endMs: Date.now(),
      speakerId: null,
      final: false,
    });
  }

  constructor(options: WebSpeechEngineOptions = {}) {
    this.lang = options.lang ?? "en-US";
    this.stereoVad = options.stereoVad ?? false;
    this.deviceId = options.deviceId;
    this.noiseGate = options.noiseGate ?? 8;
  }

  async start(sources: AudioSource[], events: EngineEvents): Promise<void> {
    this.isRunning = true;
    this.sources = sources;
    this.events = events;
    this.turnStartTime = Date.now();
    this.currentTurnId = `ws-${Date.now()}`;

    const RecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!RecognitionClass) {
      events.onStatus({
        state: "error",
        message: "Web Speech Recognition is not supported in this browser. Please use Chrome on Chromebook or Safari on iPad.",
      });
      return;
    }

    events.onStatus({ state: "connecting" });

    // Start AudioContext VU meter & stereo VAD tracking
    await this.startAudioMeters();

    try {
      this.initRecognition(RecognitionClass);
      this.recognition?.start();
      events.onStatus({ state: "listening" });
    } catch (err) {
      events.onStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Failed to start speech recognition",
      });
    }
  }

  private initRecognition(RecognitionClass: SpeechRecognitionConstructor): void {
    const rec = new RecognitionClass();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      if (this.isRunning) {
        this.events?.onStatus({ state: "listening" });
      }
    };

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      if (!this.isRunning || !this.events) return;

      let interim = "";
      let finalSegment = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (!res) continue;
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) {
          finalSegment += text;
        } else {
          interim += text;
        }
      }

      const now = Date.now();
      const speakerId = this.resolveActiveSpeaker();

      // Emit interim utterance if there is unfinalized speech. A single
      // stable id keeps live words appended to the current speaker turn
      // instead of spawning a new row on every recognition chunk.
      if (interim.trim().length > 0) {
        if (this.interimTimer) {
          clearTimeout(this.interimTimer);
        }
        this.interimTimer = setTimeout(() => this.clearInterim(), 3000);

        const interimUtterance: Utterance = {
          id: WebSpeechEngine.INTERIM_ID,
          text: interim.trim(),
          startMs: this.turnStartTime,
          endMs: now,
          speakerId,
          final: false,
        };
        this.events.onUtterance(interimUtterance);
      }

      // Emit final utterance when a sentence completes
      if (finalSegment.trim().length > 0) {
        const finalUtterance: Utterance = {
          id: `final-${this.currentTurnId}-${this.turnCounter++}`,
          text: finalSegment.trim(),
          startMs: this.turnStartTime,
          endMs: now,
          speakerId,
          final: true,
        };
        this.events.onUtterance(finalUtterance);

        this.clearInterim();

        // Advance to next turn
        this.turnStartTime = now;
        this.currentTurnId = `ws-${Date.now()}`;
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEventLike) => {
      this.clearInterim();
      if (!this.isRunning) return;
      // 'no-speech' is routine silence; ignore and allow continuous listening
      if (event.error === "no-speech") return;

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.events?.onStatus({
          state: "error",
          message: "Microphone permission was denied. Please allow microphone access in your browser settings.",
        });
        return;
      }

      this.events?.onStatus({
        state: "error",
        message: `Speech recognition notice: ${event.error}`,
      });
    };

    rec.onend = () => {
      this.clearInterim();
      // Browsers stop recognition after silence pauses. Auto-restart if we are still active!
      if (this.isRunning) {
        try {
          this.recognition?.start();
        } catch {
          setTimeout(() => {
            if (this.isRunning) {
              try {
                this.recognition?.start();
              } catch {}
            }
          }, 200);
        }
      }
    };

    this.recognition = rec;
  }

  private resolveActiveSpeaker(): SpeakerId | null {
    // If stereo VAD detected a specific channel, return it
    let candidate: SpeakerId | null = null;
    if (this.currentActiveSpeakerId) {
      candidate = this.currentActiveSpeakerId;
    } else {
      // If channel source is explicitly specified
      const firstChannel = this.sources.find((s) => s.kind === "channel");
      if (firstChannel && firstChannel.kind === "channel") {
        candidate = firstChannel.speakerId;
      }
    }

    if (candidate === null) return null;

    // Smooth rapid stereo VAD flicker: hold the previous speaker when a
    // flip arrives faster than a real conversational turn could change.
    const now = Date.now();
    if (
      this.lastEmittedSpeaker !== null &&
      candidate !== this.lastEmittedSpeaker &&
      now - this.lastSpeakerSwitchAt < WebSpeechEngine.MIN_TURN_MS
    ) {
      return this.lastEmittedSpeaker;
    }
    if (candidate !== this.lastEmittedSpeaker) {
      this.lastEmittedSpeaker = candidate;
      this.lastSpeakerSwitchAt = now;
    }
    return candidate;
  }

  private async startAudioMeters(): Promise<void> {
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return;

      this.audioCtx = new AudioCtxClass();
      const constraints: MediaStreamConstraints = {
        audio: {
          channelCount: { ideal: 2, min: 1 },
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
          ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {}),
        },
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      const sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);

      // Stereo splitter for VU and DJI channel separation
      const splitter = this.audioCtx.createChannelSplitter(2);
      const analyserL = this.audioCtx.createAnalyser();
      const analyserR = this.audioCtx.createAnalyser();

      analyserL.fftSize = 256;
      analyserR.fftSize = 256;

      sourceNode.connect(splitter);
      splitter.connect(analyserL, 0);
      splitter.connect(analyserR, 1);

      const bufferL = new Uint8Array(analyserL.frequencyBinCount);
      const bufferR = new Uint8Array(analyserR.frequencyBinCount);

      // Channel mapping for DJI Mic (Left = s1, Right = s2)
      const channelSources = this.sources.filter((s) => s.kind === "channel") as Array<{
        kind: "channel";
        channel: 0 | 1;
        speakerId: SpeakerId;
      }>;
      const leftSpeaker = channelSources.find((s) => s.channel === 0)?.speakerId ?? "s1";
      const rightSpeaker = channelSources.find((s) => s.channel === 1)?.speakerId ?? "s2";

      this.meterInterval = setInterval(() => {
        if (!this.isRunning) return;

        analyserL.getByteTimeDomainData(bufferL);
        analyserR.getByteTimeDomainData(bufferR);

        let sumL = 0;
        let sumR = 0;
        for (let i = 0; i < bufferL.length; i++) {
          const valL = (bufferL[i] - 128) / 128;
          const valR = (bufferR[i] - 128) / 128;
          sumL += valL * valL;
          sumR += valR * valR;
        }

        const rmsL = Math.sqrt(sumL / bufferL.length);
        const rmsR = Math.sqrt(sumR / bufferR.length);

        const levelL = Math.min(100, Math.round(rmsL * 250));
        const levelR = Math.min(100, Math.round(rmsR * 250));

        // Stereo VAD speaker attribution if stereo mode is active or auto-detected
        const threshold = this.noiseGate;
        const hasStereoSignal = levelL > threshold || levelR > threshold;
        const isStereoActive = this.stereoVad || (hasStereoSignal && (levelL > levelR * 1.25 || levelR > levelL * 1.25));
        if (isStereoActive && hasStereoSignal) {
          if (levelL > levelR * 1.25) this.currentActiveSpeakerId = leftSpeaker;
          else if (levelR > levelL * 1.25) this.currentActiveSpeakerId = rightSpeaker;
        }

        if (this.events?.onAudioLevel) {
          this.events.onAudioLevel({
            left: levelL,
            right: levelR,
            activeSpeakerId: this.currentActiveSpeakerId,
          });
        }
      }, 60);
    } catch {
      // Audio metering is non-fatal; speech recognition continues regardless
    }
  }

  async resumeIfNeeded(): Promise<void> {
    if (!this.isRunning) return;

    if (this.audioCtx && this.audioCtx.state === "suspended") {
      try {
        await this.audioCtx.resume();
      } catch {}
    }

    if (this.mediaStream) {
      const tracks = this.mediaStream.getAudioTracks();
      if (tracks.some((t) => t.readyState === "ended")) {
        await this.startAudioMeters();
      }
    }

    const RecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (RecognitionClass) {
      try {
        if (!this.recognition) {
          this.initRecognition(RecognitionClass);
          (this.recognition as SpeechRecognitionInstance | null)?.start();
        } else {
          try {
            this.recognition.start();
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.toLowerCase().includes("already started")) {
              try {
                this.recognition.abort();
              } catch {}
              this.initRecognition(RecognitionClass);
              (this.recognition as SpeechRecognitionInstance | null)?.start();
            }
          }
        }
        this.events?.onStatus({ state: "listening" });
      } catch (err) {
        this.events?.onStatus({
          state: "error",
          message: err instanceof Error ? err.message : "Failed to restart speech recognition",
        });
      }
    }
  }

  async stop(): Promise<void> {
    this.clearInterim();
    this.isRunning = false;

    if (this.meterInterval) {
      clearInterval(this.meterInterval);
      this.meterInterval = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioCtx && this.audioCtx.state !== "closed") {
      try {
        await this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }

    this.events?.onStatus({ state: "idle" });
  }
}
