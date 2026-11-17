import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { ClassroomCuesModal } from "./ClassroomCuesModal";
import {
  addOrUpdateUtterance,
  resetStore,
  setApiKey,
  upsertSpeaker,
} from "./store";

describe("ClassroomCuesModal", () => {
  beforeEach(() => {
    resetStore();
    upsertSpeaker({ id: "teacher", name: "Teacher" });
  });

  it("renders an accessible dialog with extracted cues and copy button", () => {
    addOrUpdateUtterance({
      id: "u1",
      text: "Please open your books to page 42.",
      startMs: 0,
      endMs: 1,
      speakerId: "teacher",
      final: true,
    });
    addOrUpdateUtterance({
      id: "u2",
      text: "The quiz is due Friday.",
      startMs: 0,
      endMs: 1,
      speakerId: "teacher",
      final: true,
    });

    const html = renderToStaticMarkup(<ClassroomCuesModal onClose={() => {}} />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain("cue-badge");
    expect(html).toContain("Page 42");
    expect(html).toContain("Quiz");
    expect(html).toContain("Due Friday");
    expect(html).toContain("Teacher");
    expect(html).toContain("📋 Copy Cues");
  });

  it("shows the last-60s catch-up view with recent finalized speech", () => {
    const now = Date.now();
    addOrUpdateUtterance({
      id: "u-recent",
      text: "Chloroplasts capture sunlight for photosynthesis.",
      startMs: now - 5000,
      endMs: now - 1000,
      speakerId: "teacher",
      final: true,
    });

    const html = renderToStaticMarkup(<ClassroomCuesModal onClose={() => {}} />);

    expect(html).toContain("⏱ Last 60s Catch-Up");
    expect(html).toContain("Chloroplasts capture sunlight for photosynthesis.");
    expect(html).toContain("Teacher");
  });

  it("falls back to the last 5 finalized utterances when none are in the last 60s", () => {
    const texts = [
      "First sentence alpha.",
      "Second sentence bravo.",
      "Third sentence charlie.",
      "Fourth sentence delta.",
      "Fifth sentence echo.",
      "Sixth sentence foxtrot.",
    ];
    texts.forEach((text, i) => {
      addOrUpdateUtterance({
        id: `u-old-${i}`,
        text,
        startMs: 0,
        endMs: 1,
        speakerId: "teacher",
        final: true,
      });
    });

    const html = renderToStaticMarkup(<ClassroomCuesModal onClose={() => {}} />);

    expect(html).toContain("⏱ Last 60s Catch-Up");
    expect(html).not.toContain("First sentence alpha.");
    expect(html).toContain("Sixth sentence foxtrot.");
    expect(html).toContain("Second sentence bravo.");
  });

  it("shows the AI summarize button only when an API key is configured", () => {
    addOrUpdateUtterance({
      id: "u1",
      text: "Chloroplasts capture sunlight for photosynthesis.",
      startMs: 0,
      endMs: 1,
      speakerId: "teacher",
      final: true,
    });

    const withoutKey = renderToStaticMarkup(<ClassroomCuesModal onClose={() => {}} />);
    expect(withoutKey).not.toContain("AI Summarize Last 2 Min");

    setApiKey("test-key-123");
    const withKey = renderToStaticMarkup(<ClassroomCuesModal onClose={() => {}} />);
    expect(withKey).toContain("✨ AI Summarize Last 2 Min");
  });

  it("ignores interim utterances in cues and catch-up", () => {
    addOrUpdateUtterance({
      id: "u-live",
      text: "Turn to page 99 right now",
      startMs: 0,
      endMs: 1,
      speakerId: "teacher",
      final: false,
    });

    const html = renderToStaticMarkup(<ClassroomCuesModal onClose={() => {}} />);

    expect(html).not.toContain("Page 99");
    expect(html).not.toContain("Turn to page 99 right now");
    expect(html).toContain("No cues yet");
  });
});
