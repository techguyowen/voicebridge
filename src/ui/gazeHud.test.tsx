import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { GazeHud } from "./GazeHud";
import {
  addOrUpdateUtterance,
  resetStore,
  setListening,
  setMode,
  setShowGazeHud,
  upsertSpeaker,
} from "./store";

describe("Peripheral Gaze HUD (GazeHud)", () => {
  beforeEach(() => {
    resetStore();
    setListening(true);
    setShowGazeHud(true);
  });

  it("renders beacon on left screen bezel for speaker seated on the left", () => {
    upsertSpeaker({ id: "sp_alice", name: "Alice", color: "#4fc3f7", position: "left" });
    addOrUpdateUtterance({
      id: "u1",
      speakerId: "sp_alice",
      text: "Can someone pass the butter?",
      startMs: 1000,
      endMs: 2000,
      final: true,
    });

    const html = renderToStaticMarkup(<GazeHud />);
    expect(html).not.toBe("");
    expect(html).toContain("gaze-hud-left");
    expect(html).toContain("◀");
    expect(html).toContain("Alice");
    expect(html).toContain('data-position="left"');
  });

  it("renders beacon on right screen bezel for speaker seated on the right", () => {
    upsertSpeaker({ id: "sp_bob", name: "Bob", color: "#ce93d8", position: "right" });
    addOrUpdateUtterance({
      id: "u1",
      speakerId: "sp_bob",
      text: "I am having potatoes.",
      startMs: 1000,
      endMs: 2000,
      final: true,
    });

    const html = renderToStaticMarkup(<GazeHud />);
    expect(html).toContain("gaze-hud-right");
    expect(html).toContain("▶");
    expect(html).toContain("Bob");
    expect(html).toContain('data-position="right"');
  });

  it("renders beacon on top screen bezel for speaker seated across", () => {
    upsertSpeaker({ id: "sp_mom", name: "Mom", color: "#ffcc80", position: "across" });
    addOrUpdateUtterance({
      id: "u1",
      speakerId: "sp_mom",
      text: "Dinner is served everyone.",
      startMs: 1000,
      endMs: 2000,
      final: true,
    });

    const html = renderToStaticMarkup(<GazeHud />);
    expect(html).toContain("gaze-hud-across");
    expect(html).toContain("▲");
    expect(html).toContain("Mom");
    expect(html).toContain('data-position="across"');
  });

  it("renders beacon on bottom screen bezel for speaker seated near", () => {
    upsertSpeaker({ id: "sp_charlie", name: "Charlie", color: "#a5d6a7", position: "near" });
    addOrUpdateUtterance({
      id: "u1",
      speakerId: "sp_charlie",
      text: "Right next to you here.",
      startMs: 1000,
      endMs: 2000,
      final: true,
    });

    const html = renderToStaticMarkup(<GazeHud />);
    expect(html).toContain("gaze-hud-near");
    expect(html).toContain("▼");
    expect(html).toContain("Charlie");
    expect(html).toContain('data-position="near"');
  });

  it("returns null when showGazeHud setting is false", () => {
    upsertSpeaker({ id: "sp_alice", name: "Alice", position: "left" });
    addOrUpdateUtterance({
      id: "u1",
      speakerId: "sp_alice",
      text: "Hello",
      startMs: 1000,
      endMs: 2000,
      final: true,
    });

    setShowGazeHud(false);
    const html = renderToStaticMarkup(<GazeHud />);
    expect(html).toBe("");
  });

  it("returns null when listening is false", () => {
    upsertSpeaker({ id: "sp_alice", name: "Alice", position: "left" });
    addOrUpdateUtterance({
      id: "u1",
      speakerId: "sp_alice",
      text: "Hello",
      startMs: 1000,
      endMs: 2000,
      final: true,
    });

    setListening(false);
    const html = renderToStaticMarkup(<GazeHud />);
    expect(html).toBe("");
  });

  it("returns null when active speaker position is none or undefined", () => {
    upsertSpeaker({ id: "sp_anon", name: "Anonymous", position: "none" });
    addOrUpdateUtterance({
      id: "u1",
      speakerId: "sp_anon",
      text: "Speaking without position",
      startMs: 1000,
      endMs: 2000,
      final: true,
    });

    const html = renderToStaticMarkup(<GazeHud />);
    expect(html).toBe("");
  });

  it("only renders in table mode and returns null in classroom, solo, and diagnostics modes", () => {
    upsertSpeaker({ id: "sp_alice", name: "Alice", position: "left" });
    addOrUpdateUtterance({
      id: "u1",
      speakerId: "sp_alice",
      text: "Mic check 1 2",
      startMs: 1000,
      endMs: 2000,
      final: true,
    });

    setMode("table");
    expect(renderToStaticMarkup(<GazeHud />)).toContain("gaze-hud-left");

    setMode("classroom");
    expect(renderToStaticMarkup(<GazeHud />)).toBe("");

    setMode("solo");
    expect(renderToStaticMarkup(<GazeHud />)).toBe("");

    setMode("diagnostics");
    expect(renderToStaticMarkup(<GazeHud />)).toBe("");
  });

  it("never uses #ffd400 fallback when speaker color is unset", () => {
    upsertSpeaker({ id: "sp_nocolor", name: "Pat", position: "left" });
    addOrUpdateUtterance({
      id: "u1",
      speakerId: "sp_nocolor",
      text: "Testing fallback accent",
      startMs: 1000,
      endMs: 2000,
      final: true,
    });

    const html = renderToStaticMarkup(<GazeHud />);
    expect(html).not.toBe("");
    expect(html).not.toContain("#ffd400");
    expect(html).toContain("--speaker-accent:");
  });

  it("returns null when speech is stale (> 6000ms ago)", () => {
    upsertSpeaker({ id: "sp_alice", name: "Alice", position: "left" });
    addOrUpdateUtterance({
      id: "u1",
      speakerId: "sp_alice",
      text: "Ancient words from earlier",
      startMs: 1000,
      endMs: 2000,
      final: true,
    });

    // Mock Date.now to 10 seconds into the future
    const realNow = Date.now;
    try {
      const nowPlus10s = realNow() + 10_000;
      Date.now = () => nowPlus10s;

      const html = renderToStaticMarkup(<GazeHud />);
      expect(html).toBe("");
    } finally {
      Date.now = realNow;
    }
  });
});
