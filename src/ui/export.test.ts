import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Speaker, Utterance } from "../types";
import { formatTranscript, copyToClipboard, copyNotesToClipboard } from "./export";

const SPEAKERS: Speaker[] = [
  { id: "s1", name: "Alex", color: "#ffd400" },
  { id: "s2", name: "Sam", color: "#4fc3f7" },
];

function utter(id: string, text: string, speakerId: string | null, starred = false): Utterance {
  return { id, text, startMs: 0, endMs: 1, speakerId, final: true, starred };
}

describe("formatTranscript", () => {
  it("returns empty string for no utterances", () => {
    expect(formatTranscript([], SPEAKERS)).toBe("");
  });

  it("formats lines as Name: text", () => {
    const out = formatTranscript([utter("u1", "Hello", "s1")], SPEAKERS);
    expect(out).toBe("Alex: Hello");
  });

  it("adds a blank line between speaker changes only", () => {
    const out = formatTranscript(
      [utter("u1", "One", "s1"), utter("u2", "Two", "s1"), utter("u3", "Three", "s2")],
      SPEAKERS
    );
    expect(out).toBe("Alex: One\nAlex: Two\n\nSam: Three");
  });

  it("labels missing or unknown speakers as Unknown", () => {
    const out = formatTranscript(
      [utter("u1", "Mystery", null), utter("u2", "Stranger", "sx")],
      SPEAKERS
    );
    expect(out).toBe("Unknown: Mystery\n\nUnknown: Stranger");
  });
});

describe("copyToClipboard and copyNotesToClipboard", () => {
  const originalNavigator = typeof globalThis.navigator !== "undefined" ? globalThis.navigator : undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof globalThis.navigator === "undefined") {
      Object.defineProperty(globalThis, "navigator", {
        value: {},
        configurable: true,
        writable: true,
      });
    }
  });

  afterEach(() => {
    if (typeof originalNavigator === "undefined") {
      try {
        delete (globalThis as unknown as { navigator?: unknown }).navigator;
      } catch {}
    } else {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    }
  });

  it("copies using navigator.clipboard when available", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const success = await copyToClipboard("test content");
    expect(success).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("test content");
  });

  it("falls back to document.execCommand when navigator.clipboard fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("Permission denied")) },
      configurable: true,
      writable: true,
    });

    const execMock = vi.fn().mockReturnValue(true);
    const mockTextarea = {
      value: "",
      setAttribute: vi.fn(),
      style: {},
      focus: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(),
    };
    const origDoc = globalThis.document;
    (globalThis as any).document = {
      createElement: vi.fn().mockReturnValue(mockTextarea),
      body: {
        appendChild: vi.fn(),
      },
      execCommand: execMock,
    };

    try {
      const success = await copyToClipboard("fallback content");
      expect(success).toBe(true);
      expect(execMock).toHaveBeenCalledWith("copy");
    } finally {
      (globalThis as any).document = origDoc;
    }
  });

  it("copyNotesToClipboard copies all utterances by default", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const utts = [
      utter("u1", "First note", "s1", false),
      utter("u2", "Second note", "s2", true),
    ];

    const result = await copyNotesToClipboard(utts, SPEAKERS);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(writeTextMock).toHaveBeenCalledWith("Alex: First note\n\nSam: Second note");
  });

  it("copyNotesToClipboard copies only starred utterances when starredOnly is true", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const utts = [
      utter("u1", "Normal speech", "s1", false),
      utter("u2", "Key equation: a^2 + b^2 = c^2", "s1", true),
      utter("u3", "Exam on Friday", "s2", true),
    ];

    const result = await copyNotesToClipboard(utts, SPEAKERS, true);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(writeTextMock).toHaveBeenCalledWith(
      "Alex: Key equation: a^2 + b^2 = c^2\n\nSam: Exam on Friday"
    );
  });
});
