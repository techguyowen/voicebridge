import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSpeechEngine } from "../webSpeechEngine";
import type { EngineEvents, Utterance } from "../../types";

describe("WebSpeechEngine interim clearing and watchdog", () => {
  let mockRecInstance: {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onerror: ((e: unknown) => void) | null;
    onresult: ((e: unknown) => void) | null;
  };

  const origWindowDesc = Object.getOwnPropertyDescriptor(globalThis, "window");
  const origNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");

  beforeEach(() => {
    vi.useFakeTimers();

    mockRecInstance = {
      continuous: true,
      interimResults: true,
      lang: "en-US",
      maxAlternatives: 1,
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      onstart: null,
      onend: null,
      onerror: null,
      onresult: null,
    };

    function MockSpeechRecognition(): typeof mockRecInstance {
      return mockRecInstance;
    }

    class MockAudioContext {
      state = "running";
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      createChannelSplitter() {
        return { connect: vi.fn() };
      }
      createAnalyser() {
        return {
          frequencyBinCount: 128,
          getByteTimeDomainData: vi.fn(),
        };
      }
      close() {
        return Promise.resolve();
      }
    }

    const mockNav = {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
          getAudioTracks: () => [],
        }),
      },
    };

    const mockWin = {
      SpeechRecognition: MockSpeechRecognition,
      webkitSpeechRecognition: MockSpeechRecognition,
      AudioContext: MockAudioContext,
      navigator: mockNav,
    };

    Object.defineProperty(globalThis, "window", {
      value: mockWin,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: mockNav,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (origWindowDesc) {
      Object.defineProperty(globalThis, "window", origWindowDesc);
    } else {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
    if (origNavigatorDesc) {
      Object.defineProperty(globalThis, "navigator", origNavigatorDesc);
    }
  });

  it("sets a 3000ms watchdog timer on interim speech that clears interim text when expired", async () => {
    const emitted: Utterance[] = [];
    const events: EngineEvents = {
      onUtterance: (u) => emitted.push(u),
      onRelabel: vi.fn(),
      onStatus: vi.fn(),
    };

    const engine = new WebSpeechEngine();
    await engine.start([], events);

    // Simulate interim result
    mockRecInstance.onresult?.({
      resultIndex: 0,
      results: [
        {
          isFinal: false,
          length: 1,
          0: { transcript: "I'm not", confidence: 0.9 },
        },
      ],
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.id).toBe("ws-interim-live");
    expect(emitted[0]?.text).toBe("I'm not");
    expect(emitted[0]?.final).toBe(false);

    // Advance 2900ms - watchdog should not have fired yet
    vi.advanceTimersByTime(2900);
    expect(emitted).toHaveLength(1);

    // Advance remaining 100ms (total 3000ms) - watchdog fires clearInterim()
    vi.advanceTimersByTime(100);
    expect(emitted).toHaveLength(2);
    expect(emitted[1]?.id).toBe("ws-interim-live");
    expect(emitted[1]?.text).toBe("");
    expect(emitted[1]?.final).toBe(false);

    await engine.stop();
  });

  it("clears interim when final utterance arrives", async () => {
    const emitted: Utterance[] = [];
    const events: EngineEvents = {
      onUtterance: (u) => emitted.push(u),
      onRelabel: vi.fn(),
      onStatus: vi.fn(),
    };

    const engine = new WebSpeechEngine();
    await engine.start([], events);

    // Interim speech first
    mockRecInstance.onresult?.({
      resultIndex: 0,
      results: [
        {
          isFinal: false,
          length: 1,
          0: { transcript: "Hello wo", confidence: 0.9 },
        },
      ],
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.text).toBe("Hello wo");

    // Final speech completes sentence
    mockRecInstance.onresult?.({
      resultIndex: 0,
      results: [
        {
          isFinal: true,
          length: 1,
          0: { transcript: "Hello world.", confidence: 0.99 },
        },
      ],
    });

    // Emitted: interim "Hello wo", then final "Hello world.", then clearInterim ""
    expect(emitted).toHaveLength(3);
    expect(emitted[1]?.final).toBe(true);
    expect(emitted[1]?.text).toBe("Hello world.");
    expect(emitted[2]?.id).toBe("ws-interim-live");
    expect(emitted[2]?.text).toBe("");
    expect(emitted[2]?.final).toBe(false);

    await engine.stop();
  });

  it("clears interim on onend, onerror, and stop()", async () => {
    const emitted: Utterance[] = [];
    const events: EngineEvents = {
      onUtterance: (u) => emitted.push(u),
      onRelabel: vi.fn(),
      onStatus: vi.fn(),
    };

    const engine = new WebSpeechEngine();
    await engine.start([], events);

    // 1. Interim then onend
    mockRecInstance.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: false, length: 1, 0: { transcript: "Test one", confidence: 0.9 } }],
    });
    expect(emitted[emitted.length - 1]?.text).toBe("Test one");

    mockRecInstance.onend?.();
    expect(emitted[emitted.length - 1]?.text).toBe("");

    // 2. Interim then onerror
    mockRecInstance.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: false, length: 1, 0: { transcript: "Test two", confidence: 0.9 } }],
    });
    expect(emitted[emitted.length - 1]?.text).toBe("Test two");

    mockRecInstance.onerror?.({ error: "no-speech" });
    expect(emitted[emitted.length - 1]?.text).toBe("");

    // 3. Interim then stop()
    mockRecInstance.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: false, length: 1, 0: { transcript: "Test three", confidence: 0.9 } }],
    });
    expect(emitted[emitted.length - 1]?.text).toBe("Test three");

    await engine.stop();
    expect(emitted[emitted.length - 1]?.text).toBe("");
  });
});
