import { describe, expect, it, vi } from "vitest";
import type { EngineEvents, Utterance } from "../../types";
import {
  alignDiarizedSegmentsToUtterances,
  type DiarizedSegment,
  GeminiDiarizer,
  parseDiarizationResponse,
  parseOffsetToMs,
  SpeakerLabelTracker,
} from "../geminiDiarize";

describe("geminiDiarize pure helpers", () => {
  it("parses offsets to milliseconds accurately", () => {
    expect(parseOffsetToMs("0.100s")).toBe(100);
    expect(parseOffsetToMs("1.5s")).toBe(1500);
    expect(parseOffsetToMs("2s")).toBe(2000);
    expect(parseOffsetToMs(2.5)).toBe(2500);
    expect(parseOffsetToMs(1500)).toBe(1500);
    expect(parseOffsetToMs(null)).toBe(0);
    expect(parseOffsetToMs("invalid")).toBe(0);
  });

  it("maintains stable speaker IDs across various label formats", () => {
    const tracker = new SpeakerLabelTracker();
    expect(tracker.getSpeakerId("spk_1")).toBe("speaker-1");
    expect(tracker.getSpeakerId("Speaker 1")).toBe("speaker-1");
    expect(tracker.getSpeakerId("spk_2")).toBe("speaker-2");
    expect(tracker.getSpeakerId("Speaker 2")).toBe("speaker-2");
    expect(tracker.getSpeakerId("Host")).toBe("speaker-1"); // first non-numbered
  });

  it("parses diarization response structure into DiarizedSegments", () => {
    const tracker = new SpeakerLabelTracker();
    const fakeResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                audioTranscription: {
                  speakerLabel: "spk_1",
                  words: [
                    { word: "Hello", startOffset: "0.100s", endOffset: "0.400s" },
                    { word: "there", startOffset: "0.450s", endOffset: "0.800s" },
                  ],
                },
              },
              {
                audioTranscription: {
                  speakerLabel: "spk_2",
                  words: [
                    { word: "General", startOffset: "1.000s", endOffset: "1.300s" },
                    { word: "Kenobi", startOffset: "1.350s", endOffset: "1.800s" },
                  ],
                },
              },
            ],
          },
        },
      ],
    };

    const segments = parseDiarizationResponse(fakeResponse, 5000, tracker);
    expect(segments.length).toBe(2);

    expect(segments[0].speakerId).toBe("speaker-1");
    expect(segments[0].startMs).toBe(5100);
    expect(segments[0].endMs).toBe(5800);
    expect(segments[0].text).toBe("Hello there");

    expect(segments[1].speakerId).toBe("speaker-2");
    expect(segments[1].startMs).toBe(6000);
    expect(segments[1].endMs).toBe(6800);
    expect(segments[1].text).toBe("General Kenobi");
  });

  it("purely aligns diarized segments to existing utterances by time overlap", () => {
    const segments: DiarizedSegment[] = [
      {
        speakerLabel: "spk_1",
        speakerId: "speaker-1",
        startMs: 1000,
        endMs: 3000,
      },
      {
        speakerLabel: "spk_2",
        speakerId: "speaker-2",
        startMs: 3500,
        endMs: 6000,
      },
    ];

    const utterances: Utterance[] = [
      {
        id: "utt-1",
        text: "first segment",
        startMs: 1100,
        endMs: 2900,
        speakerId: null,
        final: true,
      },
      {
        id: "utt-2",
        text: "second segment",
        startMs: 3600,
        endMs: 5800,
        speakerId: null,
        final: true,
      },
      {
        id: "utt-3",
        text: "already labeled",
        startMs: 1200,
        endMs: 2000,
        speakerId: "speaker-1",
        final: true,
      },
      {
        id: "utt-4",
        text: "far outside",
        startMs: 10000,
        endMs: 12000,
        speakerId: null,
        final: true,
      },
    ];

    const actions = alignDiarizedSegmentsToUtterances(segments, utterances);

    const relabelTo1 = actions.find((a) => a.speakerId === "speaker-1");
    const relabelTo2 = actions.find((a) => a.speakerId === "speaker-2");

    expect(relabelTo1).toBeDefined();
    expect(relabelTo1?.utteranceIds).toEqual(["utt-1"]);

    expect(relabelTo2).toBeDefined();
    expect(relabelTo2?.utteranceIds).toEqual(["utt-2"]);

    // utt-3 is already speaker-1, utt-4 has 0 overlap
    const allRelabeled = actions.flatMap((a) => a.utteranceIds);
    expect(allRelabeled).not.toContain("utt-3");
    expect(allRelabeled).not.toContain("utt-4");
  });
});

describe("GeminiDiarizer buffer and relabeling", () => {
  it("buffers audio until threshold and triggers unary diarization relabel", async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                audioTranscription: {
                  speakerLabel: "spk_2",
                  words: [{ word: "Hi", startOffset: "0.000s", endOffset: "0.500s" }],
                },
              },
            ],
          },
        },
      ],
    });

    const relabels: Array<{ utteranceIds: string[]; speakerId: string }> = [];
    const events: EngineEvents = {
      onUtterance: () => {},
      onRelabel: (utteranceIds, speakerId) => relabels.push({ utteranceIds, speakerId }),
      onStatus: () => {},
    };

    const utterances: Utterance[] = [
      {
        id: "utt-mix-1",
        text: "Hi",
        startMs: 0,
        endMs: 500,
        speakerId: null,
        final: true,
      },
    ];

    const diarizer = new GeminiDiarizer({
      client: { generateContent: mockGenerateContent },
      windowSamples: 100, // small window for test
    });

    diarizer.start(0);

    // Feed 100 samples
    const chunk = new Int16Array(100);
    diarizer.feedAudioChunk(chunk, () => utterances, events);

    // Allow microtasks to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(relabels.length).toBe(1);
    expect(relabels[0].speakerId).toBe("speaker-2");
    expect(relabels[0].utteranceIds).toEqual(["utt-mix-1"]);

    diarizer.stop();
  });
});
