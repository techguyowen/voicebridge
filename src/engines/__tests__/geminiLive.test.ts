import { describe, expect, it, vi } from "vitest";
import type { AudioSource, EngineEvents, EngineStatus, Utterance } from "../../types";
import {
  buildUtterance,
  GeminiLiveEngine,
  type LiveConnectParams,
  type LiveSessionLike,
  parseLiveMessage,
  shouldTriggerRollover,
} from "../geminiLive";

describe("geminiLive pure helpers", () => {
  it("parses live message with interim text in camelCase", () => {
    const msg = {
      serverContent: {
        interimInputTranscription: {
          text: "hello wor",
        },
      },
    };
    const parsed = parseLiveMessage(msg);
    expect(parsed.interimText).toBe("hello wor");
    expect(parsed.finalText).toBeUndefined();
  });

  it("parses live message with final text in snake_case", () => {
    const msg = {
      server_content: {
        input_transcription: {
          text: "hello world.",
        },
      },
    };
    const parsed = parseLiveMessage(msg);
    expect(parsed.finalText).toBe("hello world.");
    expect(parsed.interimText).toBeUndefined();
  });

  it("handles null or empty payloads safely", () => {
    expect(parseLiveMessage(null)).toEqual({});
    expect(parseLiveMessage({})).toEqual({});
    expect(parseLiveMessage({ serverContent: {} })).toEqual({});
    expect(parseLiveMessage({ serverContent: { interimInputTranscription: { text: "   " } } })).toEqual({});
  });

  it("builds utterance with valid non-negative bounded timestamps", () => {
    const u = buildUtterance("utt-1", "test", -10, 1500, "spk-1", true);
    expect(u.id).toBe("utt-1");
    expect(u.text).toBe("test");
    expect(u.startMs).toBe(0);
    expect(u.endMs).toBe(1500);
    expect(u.speakerId).toBe("spk-1");
    expect(u.final).toBe(true);
  });

  it("evaluates rollover condition correctly", () => {
    expect(shouldTriggerRollover(540000, 540000)).toBe(true);
    expect(shouldTriggerRollover(539999, 540000)).toBe(false);
  });
});

describe("GeminiLiveEngine lifecycle and rollover", () => {
  it("streams utterances and triggers seamless rollover without dropping state", async () => {
    const sessions: Array<{
      params: LiveConnectParams;
      sendRealtimeInput: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }> = [];

    const mockConnector = vi.fn(async (params: LiveConnectParams): Promise<LiveSessionLike> => {
      const session = {
        params,
        sendRealtimeInput: vi.fn(),
        close: vi.fn(),
      };
      sessions.push(session);
      return session;
    });

    const utterances: Utterance[] = [];
    const statuses: EngineStatus[] = [];

    const events: EngineEvents = {
      onUtterance: (u) => utterances.push(u),
      onRelabel: () => {},
      onStatus: (s) => statuses.push(s),
    };

    const sources: AudioSource[] = [
      { kind: "channel", channel: 0, speakerId: "spk-lead" },
    ];

    const engine = new GeminiLiveEngine({
      connector: mockConnector,
      rolloverMs: 150,
    });

    await engine.start(sources, events);

    expect(statuses.map((s) => s.state)).toContain("connecting");
    expect(statuses.map((s) => s.state)).toContain("listening");
    expect(sessions.length).toBe(1);

    // Feed audio chunk
    engine.feedAudioChunk(0, new Int16Array([10, 20, 30]));
    expect(sessions[0].sendRealtimeInput).toHaveBeenCalled();

    // Emit interim transcript from server
    sessions[0].params.callbacks.onmessage?.({
      serverContent: {
        interimInputTranscription: { text: "We are gathered" },
      },
    } as unknown as Parameters<NonNullable<typeof sessions[0]["params"]["callbacks"]["onmessage"]>>[0]);

    expect(utterances.length).toBe(1);
    expect(utterances[0].text).toBe("We are gathered");
    expect(utterances[0].final).toBe(false);
    expect(utterances[0].speakerId).toBe("spk-lead");

    // Emit final transcript
    sessions[0].params.callbacks.onmessage?.({
      serverContent: {
        inputTranscription: { text: "We are gathered today." },
      },
    } as unknown as Parameters<NonNullable<typeof sessions[0]["params"]["callbacks"]["onmessage"]>>[0]);

    // Final + a cleared interim (same live row id, empty text) so the UI
    // never shows finalized words twice.
    expect(utterances.length).toBe(3);
    expect(utterances[1].text).toBe("We are gathered today.");
    expect(utterances[1].final).toBe(true);
    expect(utterances[1].speakerId).toBe("spk-lead");
    expect(utterances[2].id).toBe(utterances[0].id);
    expect(utterances[2].text).toBe("");
    expect(utterances[2].final).toBe(false);

    // Wait for rollover timer (150ms)
    await new Promise((resolve) => setTimeout(resolve, 180));

    expect(sessions.length).toBe(2);
    expect(statuses.map((s) => s.state)).toContain("reconnecting");
    expect(statuses[statuses.length - 1].state).toBe("listening");

    // Feed another chunk - should go to session 2
    engine.feedAudioChunk(0, new Int16Array([40, 50]));
    expect(sessions[1].sendRealtimeInput).toHaveBeenCalled();

    await engine.stop();
    expect(statuses[statuses.length - 1].state).toBe("idle");
    expect(sessions[1].close).toHaveBeenCalled();
  });
});
