import { GoogleGenAI } from "@google/genai";
import type { EngineEvents, SpeakerId, Utterance } from "../types";
import { int16ToBase64, pcmToWav } from "./audioCapture";

export const DIARIZE_WINDOW_SAMPLES = 15 * 16000; // 15 seconds at 16kHz
export const DEFAULT_DIARIZE_MODEL = "gemini-3.5-transcribe";

export interface DiarizedSegment {
  speakerLabel: string;
  speakerId: SpeakerId;
  startMs: number;
  endMs: number;
  text?: string;
}

export interface DiarizeContentClient {
  generateContent(params: {
    model: string;
    contents: unknown[];
    config?: unknown;
  }): Promise<unknown>;
}

export function parseOffsetToMs(offset: unknown): number {
  if (typeof offset === "number") {
    return offset < 100 ? Math.round(offset * 1000) : Math.round(offset);
  }
  if (typeof offset === "string") {
    const trimmed = offset.trim().replace(/s$/, "");
    const parsed = parseFloat(trimmed);
    if (!isNaN(parsed)) {
      return Math.round(parsed * 1000);
    }
  }
  return 0;
}

export class SpeakerLabelTracker {
  private labelToId = new Map<string, SpeakerId>();
  private nextSpeakerIndex = 1;

  getSpeakerId(rawLabel: string): SpeakerId {
    const cleaned = rawLabel.trim();
    if (this.labelToId.has(cleaned)) {
      return this.labelToId.get(cleaned)!;
    }

    const match = cleaned.match(/\d+/);
    let assignedId: SpeakerId;
    if (match) {
      assignedId = `speaker-${parseInt(match[0], 10)}`;
    } else {
      assignedId = `speaker-${this.nextSpeakerIndex++}`;
    }

    this.labelToId.set(cleaned, assignedId);
    return assignedId;
  }
}

export function parseDiarizationResponse(
  response: unknown,
  windowStartMs: number,
  labelTracker: SpeakerLabelTracker
): DiarizedSegment[] {
  if (!response || typeof response !== "object") return [];
  const rec = response as Record<string, unknown>;
  const candidates = Array.isArray(rec.candidates) ? rec.candidates : [];
  const segments: DiarizedSegment[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as Record<string, unknown>).content as
      | Record<string, unknown>
      | undefined;
    const parts = Array.isArray(content?.parts) ? content!.parts : [];

    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const partObj = part as Record<string, unknown>;
      const transcription = partObj.audioTranscription as
        | Record<string, unknown>
        | undefined;

      const rawLabel =
        (typeof transcription?.speakerLabel === "string" && transcription.speakerLabel) ||
        (typeof transcription?.speaker_label === "string" && transcription.speaker_label) ||
        "spk_1";
      const speakerId = labelTracker.getSpeakerId(rawLabel);

      const words = Array.isArray(transcription?.words) ? transcription!.words : [];
      if (words.length > 0) {
        let segStartMs = Infinity;
        let segEndMs = -Infinity;
        const textParts: string[] = [];

        for (const w of words) {
          if (!w || typeof w !== "object") continue;
          const wordObj = w as Record<string, unknown>;
          const start = parseOffsetToMs(wordObj.startOffset ?? wordObj.start_offset);
          const end = parseOffsetToMs(wordObj.endOffset ?? wordObj.end_offset);
          const wordText = typeof wordObj.word === "string" ? wordObj.word : "";

          if (start < segStartMs) segStartMs = start;
          if (end > segEndMs) segEndMs = end;
          if (wordText) textParts.push(wordText);
        }

        if (segStartMs !== Infinity && segEndMs !== -Infinity) {
          segments.push({
            speakerLabel: rawLabel,
            speakerId,
            startMs: windowStartMs + segStartMs,
            endMs: windowStartMs + segEndMs,
            text: textParts.join(" "),
          });
          continue;
        }
      }

      const partText = typeof partObj.text === "string" ? partObj.text : "";
      if (partText) {
        segments.push({
          speakerLabel: rawLabel,
          speakerId,
          startMs: windowStartMs,
          endMs: windowStartMs + 15000,
          text: partText,
        });
      }
    }
  }

  return segments;
}

export function alignDiarizedSegmentsToUtterances(
  segments: DiarizedSegment[],
  utterances: Utterance[]
): Array<{ utteranceIds: string[]; speakerId: SpeakerId }> {
  if (segments.length === 0 || utterances.length === 0) return [];

  const relabelGroups = new Map<SpeakerId, string[]>();

  for (const u of utterances) {
    let bestSegment: DiarizedSegment | null = null;
    let maxOverlap = 0;

    for (const seg of segments) {
      const overlapStart = Math.max(u.startMs, seg.startMs);
      const overlapEnd = Math.min(u.endMs, seg.endMs);
      const overlap = Math.max(0, overlapEnd - overlapStart);

      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestSegment = seg;
      }
    }

    if (bestSegment && maxOverlap > 0 && u.speakerId !== bestSegment.speakerId) {
      const targetSpeaker = bestSegment.speakerId;
      if (!relabelGroups.has(targetSpeaker)) {
        relabelGroups.set(targetSpeaker, []);
      }
      relabelGroups.get(targetSpeaker)!.push(u.id);
    }
  }

  const result: Array<{ utteranceIds: string[]; speakerId: SpeakerId }> = [];
  for (const [speakerId, utteranceIds] of relabelGroups.entries()) {
    if (utteranceIds.length > 0) {
      result.push({ speakerId, utteranceIds });
    }
  }
  return result;
}

export interface DiarizerOptions {
  apiKey?: string;
  model?: string;
  windowSamples?: number;
  client?: DiarizeContentClient;
}

export class GeminiDiarizer {
  private readonly model: string;
  private readonly windowSamples: number;
  private readonly client: DiarizeContentClient;
  private readonly labelTracker = new SpeakerLabelTracker();

  private buffer: Int16Array[] = [];
  private totalBufferedSamples = 0;
  private windowStartMs = 0;
  private isProcessing = false;
  private isRunning = false;

  constructor(options: DiarizerOptions = {}) {
    this.model = options.model ?? DEFAULT_DIARIZE_MODEL;
    this.windowSamples = options.windowSamples ?? DIARIZE_WINDOW_SAMPLES;

    if (options.client) {
      this.client = options.client;
    } else {
      const ai = new GoogleGenAI({ apiKey: options.apiKey ?? "" });
      this.client = {
        generateContent: (params) =>
          ai.models.generateContent(params as Parameters<typeof ai.models.generateContent>[0]),
      };
    }
  }

  start(engineStartTimeMs: number): void {
    this.isRunning = true;
    this.windowStartMs = engineStartTimeMs;
    this.buffer = [];
    this.totalBufferedSamples = 0;
  }

  feedAudioChunk(
    pcmChunk: Int16Array,
    utterancesProvider: () => Utterance[],
    events: EngineEvents
  ): void {
    if (!this.isRunning) return;

    this.buffer.push(pcmChunk);
    this.totalBufferedSamples += pcmChunk.length;

    if (this.totalBufferedSamples >= this.windowSamples && !this.isProcessing) {
      void this.processCurrentWindow(utterancesProvider, events);
    }
  }

  private async processCurrentWindow(
    utterancesProvider: () => Utterance[],
    events: EngineEvents
  ): Promise<void> {
    if (this.isProcessing || this.totalBufferedSamples === 0) return;
    this.isProcessing = true;

    const merged = new Int16Array(this.totalBufferedSamples);
    let offset = 0;
    for (const chunk of this.buffer) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const currentWindowStartMs = this.windowStartMs;
    this.buffer = [];
    this.totalBufferedSamples = 0;
    this.windowStartMs = currentWindowStartMs + Math.round((merged.length / 16000) * 1000);

    try {
      const wavBytes = pcmToWav(merged, 16000);
      const base64Audio = int16ToBase64(new Int16Array(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength / 2));

      const response = await this.client.generateContent({
        model: this.model,
        contents: [
          {
            inlineData: {
              mimeType: "audio/wav",
              data: base64Audio,
            },
          },
        ],
        config: {
          audioTranscriptionConfig: {
            diarization: true,
          },
        },
      });

      const segments = parseDiarizationResponse(
        response,
        currentWindowStartMs,
        this.labelTracker
      );

      const currentUtterances = utterancesProvider();
      const relabelActions = alignDiarizedSegmentsToUtterances(segments, currentUtterances);

      for (const action of relabelActions) {
        events.onRelabel(action.utteranceIds, action.speakerId);
      }
    } catch {
      // Unary diarization failure in a chunk does not stop live transcription
    } finally {
      this.isProcessing = false;
    }
  }

  stop(): void {
    this.isRunning = false;
    this.buffer = [];
    this.totalBufferedSamples = 0;
  }
}
