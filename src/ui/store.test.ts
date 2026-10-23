import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { Utterance } from "../types";
import { toHtml, toMarkdown } from "./ExportButtons";
import { groupUtterancesByTurn, highlightAlertWords } from "./TranscriptList";
import {
  addOrUpdateUtterance,
  applyProfile,
  assignLatestUtteranceSpeaker,
  clampFont,
  clear,
  dismissAlert,
  editText,
  getState,
  loadSettings,
  persist,
  relabel,
  renameSpeaker,
  resetStore,
  resetToAutoSpeaker,
  setActiveManualSpeaker,
  setActiveSpeaker,
  setAlertChime,
  setAlertWords,
  setCustomColors,
  setFinalOnlyMode,
  setFontFamily,
  setFontPx,
  setReadingRuler,
  setRogerDisconnected,
  setShowJumpToLive,
  setShowKeywordAlerts,
  setShowOnGlassControls,
  setShowQuickReply,
  setShowSignalMeter,
  setShowSpeakerLabels,
  setShowStarButtons,
  setTheme,
  setWordSpacing,
  starLatestUtterance,
  toggleStarUtterance,
  updateAudioLevel,
} from "./store";

function utter(id: string, text: string, speakerId: string | null, final: boolean): Utterance {
  return { id, text, startMs: 0, endMs: 1, speakerId, final };
}

beforeEach(() => resetStore());

describe("addOrUpdateUtterance", () => {
  it("adds a new utterance", () => {
    addOrUpdateUtterance(utter("u1", "Hello", "s1", true));
    expect(getState().utterances).toHaveLength(1);
  });

  it("upserts by id without duplicating", () => {
    addOrUpdateUtterance(utter("u1", "Hel", "s1", false));
    addOrUpdateUtterance(utter("u1", "Hello there", "s1", true));
    const all = getState().utterances;
    expect(all).toHaveLength(1);
    expect(all[0]?.text).toBe("Hello there");
    expect(all[0]?.final).toBe(true);
  });

  it("creates a speaker entry for unknown speaker ids", () => {
    addOrUpdateUtterance(utter("u1", "Hi", "sx", true));
    expect(getState().speakers.some((s) => s.id === "sx")).toBe(true);
  });
});

describe("relabel", () => {
  it("moves only the listed ids to the new speaker", () => {
    addOrUpdateUtterance(utter("u1", "One", "s1", true));
    addOrUpdateUtterance(utter("u2", "Two", "s1", true));
    relabel(["u1"], "s2");
    const byId = new Map(getState().utterances.map((u) => [u.id, u.speakerId]));
    expect(byId.get("u1")).toBe("s2");
    expect(byId.get("u2")).toBe("s1");
  });

  it("ignores ids that do not exist", () => {
    addOrUpdateUtterance(utter("u1", "One", "s1", true));
    relabel(["missing"], "s2");
    expect(getState().utterances[0]?.speakerId).toBe("s1");
  });
});

describe("editText", () => {
  it("changes only the matching utterance", () => {
    addOrUpdateUtterance(utter("u1", "One", "s1", true));
    addOrUpdateUtterance(utter("u2", "Two", "s1", true));
    editText("u2", "Two edited");
    expect(getState().utterances[1]?.text).toBe("Two edited");
    expect(getState().utterances[0]?.text).toBe("One");
  });
});

describe("renameSpeaker", () => {
  it("renames the speaker", () => {
    renameSpeaker("s1", "Grandma");
    expect(getState().speakers.find((s) => s.id === "s1")?.name).toBe("Grandma");
  });
});

describe("clear", () => {
  it("removes utterances but keeps speakers", () => {
    addOrUpdateUtterance(utter("u1", "One", "s1", true));
    clear();
    expect(getState().utterances).toHaveLength(0);
    expect(getState().speakers.length).toBeGreaterThan(0);
  });
});

describe("setFontPx and clampFont", () => {
  it("clamps to 20-120", () => {
    setFontPx(10);
    expect(getState().settings.fontPx).toBe(20);
    setFontPx(200);
    expect(getState().settings.fontPx).toBe(120);
    setFontPx(40);
    expect(getState().settings.fontPx).toBe(40);
  });

  it("clampFont(150) returns 120", () => {
    expect(clampFont(150)).toBe(120);
  });
});

describe("activeManualSpeaker", () => {
  it("setActiveManualSpeaker auto-assigns speaker on addOrUpdateUtterance when speakerId is null", () => {
    setActiveManualSpeaker("s2");
    expect(getState().activeManualSpeakerId).toBe("s2");
    addOrUpdateUtterance(utter("u1", "Hello", null, true));
    expect(getState().utterances[0]?.speakerId).toBe("s2");
  });

  it("does not override an explicit speakerId", () => {
    setActiveManualSpeaker("s2");
    addOrUpdateUtterance(utter("u1", "Hello", "s1", true));
    expect(getState().utterances[0]?.speakerId).toBe("s1");
  });

  it("clearing manual lock falls back to the held conversational turn", () => {
    setActiveManualSpeaker("s2");
    setActiveManualSpeaker(null);
    addOrUpdateUtterance(utter("u1", "Hello", null, true));
    // No more "Unknown Speaker" rows: the held turn (default s1) carries on.
    expect(getState().utterances[0]?.speakerId).toBe("s1");
  });

  it("assignLatestUtteranceSpeaker relabels latest and locks speaker", () => {
    addOrUpdateUtterance(utter("u1", "First", "s1", true));
    addOrUpdateUtterance(utter("u2", "Latest", "s1", true));
    assignLatestUtteranceSpeaker("s3");
    expect(getState().activeManualSpeakerId).toBe("s3");
    expect(getState().utterances[1]?.speakerId).toBe("s3");
    expect(getState().utterances[0]?.speakerId).toBe("s1");
  });

  it("assignLatestUtteranceSpeaker does not relabel a stale epoch utterance (>15s old)", () => {
    const old = Date.now() - 20_000;
    addOrUpdateUtterance({ id: "u1", text: "Old", startMs: old, endMs: old, speakerId: "s1", final: true });
    assignLatestUtteranceSpeaker("s2");
    expect(getState().activeManualSpeakerId).toBe("s2");
    expect(getState().utterances[0]?.speakerId).toBe("s1");
  });
});

describe("speaker turn hold", () => {
  it("assigns null-speaker utterances to the default first speaker", () => {
    addOrUpdateUtterance(utter("u1", "Hello", null, true));
    expect(getState().utterances[0]?.speakerId).toBe("s1");
    expect(getState().currentSpeakerId).toBe("s1");
    expect(getState().lastSpeechTimestamp).toBeGreaterThan(0);
  });

  it("keeps one person talking across many sentences on the same speaker", () => {
    addOrUpdateUtterance(utter("u1", "hi", null, true));
    addOrUpdateUtterance(utter("u2", "how was your day", null, true));
    addOrUpdateUtterance(utter("u3", "pass the salt", null, true));
    const ids = getState().utterances.map((u) => u.speakerId);
    expect(ids).toEqual(["s1", "s1", "s1"]);
  });

  it("an explicit speaker switches the turn and later nulls follow it", () => {
    addOrUpdateUtterance(utter("u1", "hi mom", null, true));
    addOrUpdateUtterance(utter("u2", "hey there", "s2", true));
    expect(getState().currentSpeakerId).toBe("s2");
    addOrUpdateUtterance(utter("u3", "still dad talking", null, true));
    expect(getState().utterances[2]?.speakerId).toBe("s2");
  });

  it("manual lock still wins over the held turn", () => {
    addOrUpdateUtterance(utter("u1", "hi", "s1", true));
    setActiveManualSpeaker("s3");
    addOrUpdateUtterance(utter("u2", "hello", null, true));
    expect(getState().utterances[1]?.speakerId).toBe("s3");
  });

  it("setActiveSpeaker switches the turn, locks, and relabels recent speech", () => {
    addOrUpdateUtterance(utter("u1", "First", "s1", true));
    addOrUpdateUtterance(utter("u2", "Latest", "s1", true));
    setActiveSpeaker("s2");
    expect(getState().currentSpeakerId).toBe("s2");
    expect(getState().activeManualSpeakerId).toBe("s2");
    expect(getState().utterances[1]?.speakerId).toBe("s2");
    expect(getState().utterances[0]?.speakerId).toBe("s1");
    // Future null speech follows the new turn.
    addOrUpdateUtterance(utter("u3", "More from dad", null, true));
    expect(getState().utterances[2]?.speakerId).toBe("s2");
  });

  it("setActiveSpeaker does not relabel a stale epoch utterance (>15s old)", () => {
    const old = Date.now() - 20_000;
    addOrUpdateUtterance({ id: "u1", text: "Old", startMs: old, endMs: old, speakerId: "s1", final: true });
    setActiveSpeaker("s2");
    expect(getState().currentSpeakerId).toBe("s2");
    expect(getState().utterances[0]?.speakerId).toBe("s1");
  });

  it("live interim updates move to the end so words append to the current turn", () => {
    addOrUpdateUtterance(utter("live", "Hel", "s1", false));
    addOrUpdateUtterance(utter("f1", "Done sentence", "s1", true));
    addOrUpdateUtterance({ id: "live", text: "Hello there", startMs: 0, endMs: 1, speakerId: "s1", final: false });
    const ids = getState().utterances.map((u) => u.id);
    expect(ids).toEqual(["f1", "live"]);
  });
});

describe("groupUtterancesByTurn", () => {
  it("groups consecutive utterances from the same speaker into one block", () => {
    const blocks = groupUtterancesByTurn([
      utter("u1", "hi", "s1", true),
      utter("u2", "how was your day", "s1", true),
      utter("u3", "pass the salt", "s1", true),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.speakerId).toBe("s1");
    expect(blocks[0]?.utterances).toHaveLength(3);
  });

  it("starts a new block when the speaker changes", () => {
    const blocks = groupUtterancesByTurn([
      utter("u1", "hi", "s1", true),
      utter("u2", "hey", "s2", true),
      utter("u3", "how are you", "s1", true),
    ]);
    expect(blocks.map((b) => b.speakerId)).toEqual(["s1", "s2", "s1"]);
  });

  it("appends live interim words to the current speaker block", () => {
    const blocks = groupUtterancesByTurn([
      utter("u1", "hi", "s1", true),
      utter("live", "and another", "s1", false),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.utterances.map((u) => u.id)).toEqual(["u1", "live"]);
  });

  it("hides empty cleared-interim rows", () => {
    const blocks = groupUtterancesByTurn([
      utter("u1", "hi", "s1", true),
      { id: "live", text: "   ", startMs: 0, endMs: 1, speakerId: "s1", final: false },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.utterances).toHaveLength(1);
  });
});

describe("alertWords", () => {
  it("detects alert word and populates lastAlertMatch with flash", () => {
    setAlertWords("Alex, dinner");
    addOrUpdateUtterance(utter("u1", "Hey Alex come here", "s1", true));
    const m = getState().lastAlertMatch;
    expect(m).not.toBeNull();
    expect(m?.word.toLowerCase()).toBe("alex");
    expect(m?.speakerName).toBe(getState().speakers.find((s) => s.id === "s1")?.name);
    expect(typeof m?.timestamp).toBe("number");
    expect(getState().flashActive).toBe(true);
  });

  it("matches case-insensitively and by prefix", () => {
    setAlertWords("ann");
    addOrUpdateUtterance(utter("u1", "Anna is speaking", "s1", true));
    expect(getState().lastAlertMatch?.word).toBe("ann");
  });

  it("does not match unrelated text and dismissAlert clears", () => {
    setAlertWords("Alex");
    addOrUpdateUtterance(utter("u1", "Nothing here", "s1", true));
    expect(getState().lastAlertMatch).toBeNull();
    addOrUpdateUtterance(utter("u2", "Alex!", "s1", true));
    expect(getState().lastAlertMatch).not.toBeNull();
    dismissAlert();
    expect(getState().lastAlertMatch).toBeNull();
  });

  it("defaults are empty alertWords, showTableRadar true, and showSpeakerLabels true", () => {
    expect(getState().settings.alertWords).toBe("");
    expect(getState().settings.showTableRadar).toBe(true);
    expect(getState().settings.showSpeakerLabels).toBe(true);
  });
});

describe("setShowSpeakerLabels", () => {
  it("updates showSpeakerLabels setting", () => {
    expect(getState().settings.showSpeakerLabels).toBe(true);
    setShowSpeakerLabels(false);
    expect(getState().settings.showSpeakerLabels).toBe(false);
    setShowSpeakerLabels(true);
    expect(getState().settings.showSpeakerLabels).toBe(true);
  });
});

describe("toggleStarUtterance", () => {
  it("toggles starred on and off", () => {
    addOrUpdateUtterance(utter("u1", "Important", "s1", true));
    expect(getState().utterances[0]?.starred).toBeFalsy();
    toggleStarUtterance("u1");
    expect(getState().utterances[0]?.starred).toBe(true);
    toggleStarUtterance("u1");
    expect(getState().utterances[0]?.starred).toBe(false);
  });

  it("only stars the matching utterance", () => {
    addOrUpdateUtterance(utter("u1", "One", "s1", true));
    addOrUpdateUtterance(utter("u2", "Two", "s1", true));
    toggleStarUtterance("u2");
    expect(getState().utterances[0]?.starred).toBeFalsy();
    expect(getState().utterances[1]?.starred).toBe(true);
  });
});

describe("starred highlights in exports", () => {
  it("toMarkdown puts Starred Highlights before full transcript", () => {
    addOrUpdateUtterance(utter("u1", "Hello", "s1", true));
    addOrUpdateUtterance(utter("u2", "Key moment", "s2", true));
    toggleStarUtterance("u2");
    const md = toMarkdown(getState().utterances, getState().speakers);
    expect(md).toContain("★ Starred Highlights");
    expect(md).toContain("Key moment");
    expect(md.indexOf("★ Starred Highlights")).toBeLessThan(md.indexOf("Hello"));
  });

  it("toHtml puts Starred Highlights before full transcript", () => {
    addOrUpdateUtterance(utter("u1", "Hello", "s1", true));
    addOrUpdateUtterance(utter("u2", "Key moment", "s2", true));
    toggleStarUtterance("u2");
    const html = toHtml(getState().utterances, getState().speakers);
    expect(html).toContain("★ Starred Highlights");
    expect(html).toContain("Key moment");
    expect(html.indexOf("★ Starred Highlights")).toBeLessThan(html.lastIndexOf("Key moment"));
  });

  it("exports omit highlights section when nothing is starred", () => {
    addOrUpdateUtterance(utter("u1", "Hello", "s1", true));
    expect(toMarkdown(getState().utterances, getState().speakers)).not.toContain("Starred Highlights");
    expect(toHtml(getState().utterances, getState().speakers)).not.toContain("Starred Highlights");
  });
});

describe("applyProfile theme preservation", () => {
  it.each(["dinner", "classroom", "lecture", "evening", "high-visibility"] as const)(
    "profile %s preserves the active theme",
    (profile) => {
      setTheme("cyan-on-black");
      const before = getState().settings.customColors;
      applyProfile(profile);
      expect(getState().settings.theme).toBe("cyan-on-black");
      expect(getState().settings.customColors).toEqual(before);
    }
  );

  it("preserves custom palette colors", () => {
    setCustomColors({ bg: "#101010", fg: "#f0f0f0", border: "#f0f0f0", panel: "#181818" });
    applyProfile("high-visibility");
    expect(getState().settings.theme).toBe("custom");
    expect(getState().settings.customColors).toEqual({
      bg: "#101010",
      fg: "#f0f0f0",
      border: "#f0f0f0",
      panel: "#181818",
    });
  });
});

describe("applyProfile classroom", () => {
  it("configures mode: classroom, showSpeakerLabels: false, speakerFlash: false, and preserves the existing theme", () => {
    setTheme("amber-on-dark");
    applyProfile("classroom");
    const s = getState().settings;
    expect(s.mode).toBe("classroom");
    expect(s.showSpeakerLabels).toBe(false);
    expect(s.speakerFlash).toBe(false);
    expect(s.fontPx).toBe(52);
    expect(s.fontWeight).toBe("bold");
    expect(s.lineSpacing).toBe(1.8);
    expect(s.stereoMode).toBe(false);
    expect(s.showTableRadar).toBe(false);
    expect(s.theme).toBe("amber-on-dark");
  });
});

describe("highlightAlertWords", () => {
  it("wraps matched words in mark.alert-word-mark", () => {
    const html = renderToStaticMarkup(highlightAlertWords("Hey Alex come", "Alex", false));
    expect(html).toContain('class="alert-word-mark"');
    expect(html).toContain("Alex");
  });

  it("preserves bionic markup inside and outside marks", () => {
    const html = renderToStaticMarkup(highlightAlertWords("Hello Alex", "Alex", true));
    expect(html).toContain('class="alert-word-mark"');
    expect(html).toContain("bionic-word");
    expect(html).toContain("<strong");
  });

  it("renders plain text when no alert words configured", () => {
    const html = renderToStaticMarkup(highlightAlertWords("Hello world", "", false));
    expect(html).toContain("Hello world");
    expect(html).not.toContain("alert-word-mark");
  });
});

describe("resetToAutoSpeaker and Auto speaker tracking", () => {
  it("resetToAutoSpeaker clears activeManualSpeakerId and resets to fallback speaker", () => {
    setActiveSpeaker("s3");
    expect(getState().activeManualSpeakerId).toBe("s3");
    expect(getState().currentSpeakerId).toBe("s3");

    resetToAutoSpeaker();
    expect(getState().activeManualSpeakerId).toBeNull();
    expect(getState().currentSpeakerId).toBe("s1");
    expect(getState().latestSpeakerId).toBe("s1");
  });

  it("resetToAutoSpeaker resets to audioLevel.activeSpeakerId if present", () => {
    setActiveSpeaker("s3");
    updateAudioLevel({ left: 75, right: 20, activeSpeakerId: "s2" });

    // With manual lock on s3, updateAudioLevel didn't change currentSpeakerId
    expect(getState().currentSpeakerId).toBe("s3");

    resetToAutoSpeaker();
    expect(getState().activeManualSpeakerId).toBeNull();
    expect(getState().currentSpeakerId).toBe("s2");
    expect(getState().latestSpeakerId).toBe("s2");
  });

  it("updateAudioLevel switches currentSpeakerId and latestSpeakerId in auto mode", () => {
    expect(getState().activeManualSpeakerId).toBeNull();
    expect(getState().currentSpeakerId).toBe("s1");

    updateAudioLevel({ left: 20, right: 80, activeSpeakerId: "s2" });
    expect(getState().currentSpeakerId).toBe("s2");
    expect(getState().latestSpeakerId).toBe("s2");

    // Null-speaker utterances now inherit the auto-detected speaker
    addOrUpdateUtterance(utter("u1", "Auto speaker words", null, true));
    expect(getState().utterances[0]?.speakerId).toBe("s2");
  });

  it("updateAudioLevel does not override activeManualSpeakerId when locked", () => {
    setActiveSpeaker("s1");
    expect(getState().activeManualSpeakerId).toBe("s1");

    updateAudioLevel({ left: 10, right: 90, activeSpeakerId: "s2" });
    expect(getState().activeManualSpeakerId).toBe("s1");
    expect(getState().currentSpeakerId).toBe("s1");
  });

  it("relabel updates currentSpeakerId in auto mode when latest utterance is relabeled", () => {
    expect(getState().activeManualSpeakerId).toBeNull();
    addOrUpdateUtterance(utter("u1", "First utterance", "s1", true));
    expect(getState().currentSpeakerId).toBe("s1");

    relabel(["u1"], "s3");
    expect(getState().currentSpeakerId).toBe("s3");
    expect(getState().utterances[0]?.speakerId).toBe("s3");
  });

  it("relabel does not override currentSpeakerId when manual lock is active", () => {
    setActiveSpeaker("s2");
    addOrUpdateUtterance(utter("u1", "First utterance", "s2", true));
    expect(getState().currentSpeakerId).toBe("s2");

    relabel(["u1"], "s3");
    // Utterance is relabeled to s3, but current speaker lock remains on s2
    expect(getState().utterances[0]?.speakerId).toBe("s3");
    expect(getState().currentSpeakerId).toBe("s2");
    expect(getState().activeManualSpeakerId).toBe("s2");
  });
});

describe("finalOnlyMode and readingRuler settings", () => {
  it("setFinalOnlyMode and setReadingRuler update settings", () => {
    expect(getState().settings.finalOnlyMode).toBe(false);
    expect(getState().settings.readingRuler).toBe(false);

    setFinalOnlyMode(true);
    expect(getState().settings.finalOnlyMode).toBe(true);

    setReadingRuler(true);
    expect(getState().settings.readingRuler).toBe(true);

    setFinalOnlyMode(false);
    expect(getState().settings.finalOnlyMode).toBe(false);

    setReadingRuler(false);
    expect(getState().settings.readingRuler).toBe(false);
  });
});

describe("rogerDisconnected state", () => {
  it("setRogerDisconnected updates store", () => {
    expect(getState().rogerDisconnected).toBe(false);
    setRogerDisconnected(true);
    expect(getState().rogerDisconnected).toBe(true);
    setRogerDisconnected(false);
    expect(getState().rogerDisconnected).toBe(false);
  });
});

describe("persist QuotaExceededError recovery", () => {
  it("persist recovers from QuotaExceededError", () => {
    // Add 250 utterances
    for (let i = 0; i < 250; i++) {
      addOrUpdateUtterance(utter(`u${i}`, `Text ${i}`, "s1", true));
    }
    expect(getState().utterances.length).toBe(250);

    const storage = new Map<string, string>();
    let quotaCallCount = 0;
    const mockLocalStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (k === "alt.transcript.v3") {
          quotaCallCount++;
          if (quotaCallCount === 1) {
            const err = new Error("QuotaExceededError");
            err.name = "QuotaExceededError";
            throw err;
          }
        }
        storage.set(k, v);
      },
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
      key: (i: number) => Array.from(storage.keys())[i] ?? null,
      get length() {
        return storage.size;
      },
    };

    const prevStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    (globalThis as unknown as { localStorage: Storage }).localStorage = mockLocalStorage as unknown as Storage;

    try {
      expect(() => persist()).not.toThrow();

      // Verify that after recovery, localStorage contains rolling window of 200 utterances
      const saved = JSON.parse(mockLocalStorage.getItem("alt.transcript.v3") || "{}");
      expect(saved.utterances).toHaveLength(200);
      expect(saved.utterances[199]?.id).toBe("u249");
      expect(saved.utterances[0]?.id).toBe("u50");

      // Verify that runtime memory is intact with all 250 utterances
      expect(getState().utterances).toHaveLength(250);
    } finally {
      if (prevStorage !== undefined) {
        (globalThis as unknown as { localStorage: Storage }).localStorage = prevStorage;
      } else {
        delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
      }
    }
  });
});

describe("wordSpacing and alertChime settings", () => {
  it("setWordSpacing updates settings", () => {
    expect(getState().settings.wordSpacing).toBe("normal");
    setWordSpacing("wide");
    expect(getState().settings.wordSpacing).toBe("wide");
    setWordSpacing("extra-wide");
    expect(getState().settings.wordSpacing).toBe("extra-wide");
    setWordSpacing("normal");
    expect(getState().settings.wordSpacing).toBe("normal");
  });

  it("setAlertChime updates settings", () => {
    expect(getState().settings.alertChime).toBe(true);
    setAlertChime(false);
    expect(getState().settings.alertChime).toBe(false);
    setAlertChime(true);
    expect(getState().settings.alertChime).toBe(true);
  });
});

describe("starLatestUtterance", () => {
  it("does not throw when utterances are empty", () => {
    expect(() => starLatestUtterance()).not.toThrow();
  });

  it("stars the last finalized utterance", () => {
    addOrUpdateUtterance(utter("u1", "First utterance", "s1", true));
    addOrUpdateUtterance(utter("u2", "Second utterance", "s2", true));
    addOrUpdateUtterance(utter("u3-live", "Interim utterance", "s1", false));

    starLatestUtterance();

    const u2 = getState().utterances.find((u) => u.id === "u2");
    expect(u2?.starred).toBe(true);

    const u1 = getState().utterances.find((u) => u.id === "u1");
    expect(u1?.starred).toBeUndefined();

    // Calling again unstars it
    starLatestUtterance();
    const u2After = getState().utterances.find((u) => u.id === "u2");
    expect(u2After?.starred).toBe(false);
  });

  it("ignores unfinalized utterances and stars the prior finalized utterance", () => {
    addOrUpdateUtterance(utter("u1", "Only finalized", "s1", true));
    addOrUpdateUtterance(utter("u2-live", "Streaming speech", "s1", false));

    starLatestUtterance();
    expect(getState().utterances.find((u) => u.id === "u1")?.starred).toBe(true);
    expect(getState().utterances.find((u) => u.id === "u2-live")?.starred).toBeUndefined();
  });
});

describe("lexend font loading and settings parsing", () => {
  it("setFontFamily sets lexend", () => {
    setFontFamily("lexend");
    expect(getState().settings.fontFamily).toBe("lexend");
  });

  it("loadSettings parses lexend, wordSpacing, and alertChime from storage", () => {
    const storage = new Map<string, string>();
    storage.set(
      "alt.settings.v3",
      JSON.stringify({
        fontFamily: "lexend",
        wordSpacing: "wide",
        alertChime: false,
      })
    );

    const mockLocalStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
      key: (i: number) => Array.from(storage.keys())[i] ?? null,
      get length() {
        return storage.size;
      },
    };

    const prevStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    (globalThis as unknown as { localStorage: Storage }).localStorage = mockLocalStorage as unknown as Storage;

    try {
      const loaded = loadSettings();
      expect(loaded.fontFamily).toBe("lexend");
      expect(loaded.wordSpacing).toBe("wide");
      expect(loaded.alertChime).toBe(false);
    } finally {
      if (prevStorage !== undefined) {
        (globalThis as unknown as { localStorage: Storage }).localStorage = prevStorage;
      } else {
        delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
      }
    }
  });

  it("loadSettings falls back to atkinson, normal, and true for invalid or missing values", () => {
    const storage = new Map<string, string>();
    storage.set(
      "alt.settings.v3",
      JSON.stringify({
        fontFamily: "unknown-font",
        wordSpacing: "invalid-spacing",
      })
    );

    const mockLocalStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
      key: (i: number) => Array.from(storage.keys())[i] ?? null,
      get length() {
        return storage.size;
      },
    };

    const prevStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    (globalThis as unknown as { localStorage: Storage }).localStorage = mockLocalStorage as unknown as Storage;

    try {
      const loaded = loadSettings();
      expect(loaded.fontFamily).toBe("atkinson");
      expect(loaded.wordSpacing).toBe("normal");
      expect(loaded.alertChime).toBe(true);
    } finally {
      if (prevStorage !== undefined) {
        (globalThis as unknown as { localStorage: Storage }).localStorage = prevStorage;
      } else {
        delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
      }
    }
  });
});

describe("feature toggle settings", () => {
  it("setShowQuickReply updates settings", () => {
    expect(getState().settings.showQuickReply).toBe(true);
    setShowQuickReply(false);
    expect(getState().settings.showQuickReply).toBe(false);
    setShowQuickReply(true);
    expect(getState().settings.showQuickReply).toBe(true);
  });

  it("setShowSignalMeter updates settings", () => {
    expect(getState().settings.showSignalMeter).toBe(true);
    setShowSignalMeter(false);
    expect(getState().settings.showSignalMeter).toBe(false);
    setShowSignalMeter(true);
    expect(getState().settings.showSignalMeter).toBe(true);
  });

  it("setShowStarButtons updates settings", () => {
    expect(getState().settings.showStarButtons).toBe(true);
    setShowStarButtons(false);
    expect(getState().settings.showStarButtons).toBe(false);
    setShowStarButtons(true);
    expect(getState().settings.showStarButtons).toBe(true);
  });

  it("setShowOnGlassControls updates settings", () => {
    expect(getState().settings.showOnGlassControls).toBe(true);
    setShowOnGlassControls(false);
    expect(getState().settings.showOnGlassControls).toBe(false);
    setShowOnGlassControls(true);
    expect(getState().settings.showOnGlassControls).toBe(true);
  });

  it("setShowKeywordAlerts updates settings", () => {
    expect(getState().settings.showKeywordAlerts).toBe(true);
    setShowKeywordAlerts(false);
    expect(getState().settings.showKeywordAlerts).toBe(false);
    setShowKeywordAlerts(true);
    expect(getState().settings.showKeywordAlerts).toBe(true);
  });

  it("setShowJumpToLive updates settings", () => {
    expect(getState().settings.showJumpToLive).toBe(true);
    setShowJumpToLive(false);
    expect(getState().settings.showJumpToLive).toBe(false);
    setShowJumpToLive(true);
    expect(getState().settings.showJumpToLive).toBe(true);
  });

  it("loadSettings parses feature toggles and defaults missing values to true", () => {
    const storage = new Map<string, string>();
    storage.set(
      "alt.settings.v3",
      JSON.stringify({
        showQuickReply: false,
        showSignalMeter: false,
        showStarButtons: false,
        showOnGlassControls: false,
        showKeywordAlerts: false,
        showJumpToLive: false,
      })
    );

    const mockLocalStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
      key: (i: number) => Array.from(storage.keys())[i] ?? null,
      get length() {
        return storage.size;
      },
    };

    const prevStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    (globalThis as unknown as { localStorage: Storage }).localStorage = mockLocalStorage as unknown as Storage;

    try {
      const loaded = loadSettings();
      expect(loaded.showQuickReply).toBe(false);
      expect(loaded.showSignalMeter).toBe(false);
      expect(loaded.showStarButtons).toBe(false);
      expect(loaded.showOnGlassControls).toBe(false);
      expect(loaded.showKeywordAlerts).toBe(false);
      expect(loaded.showJumpToLive).toBe(false);
    } finally {
      if (prevStorage !== undefined) {
        (globalThis as unknown as { localStorage: Storage }).localStorage = prevStorage;
      } else {
        delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
      }
    }
  });
});



