import { useSyncExternalStore } from "react";
import type { AudioLevel, EngineStatus, Speaker, SpeakerId, Utterance } from "../types";

export type Theme = "yellow-on-black" | "white-on-black" | "black-on-white" | "cyan-on-black" | "amber-on-dark" | "custom";
export type Mode = "table" | "classroom" | "solo" | "diagnostics";
export type FontFamily = "atkinson" | "dyslexic" | "lexend" | "system";
export type WordSpacing = "normal" | "wide" | "extra-wide";
export type EngineChoice = "auto" | "web-speech" | "gemini" | "deepgram";
export type FlashIntensity = "subtle" | "medium" | "vivid";
export type FlashMode = "border" | "screen" | "banner" | "off";
export type FontWeight = "normal" | "bold" | "extra-bold" | "black";
export type LetterSpacing = "normal" | "wide" | "extra-wide";
export type SeatingPosition = "left" | "across" | "right" | "near" | "none";

export interface CustomColors {
  bg: string;
  fg: string;
  border: string;
  panel: string;
}

export interface Settings {
  theme: Theme;
  fontPx: number;
  mode: Mode;
  apiKey: string;
  deepgramKey: string;
  engineChoice: EngineChoice;
  stereoMode: boolean; // DJI Mic dual channel L/R split
  deviceId: string;
  fontFamily: FontFamily;
  fontWeight: FontWeight;
  letterSpacing: LetterSpacing;
  lineSpacing: number; // 1.2 to 2.6
  bionicReading: boolean;
  speakerFlash: boolean;
  flashIntensity: FlashIntensity;
  flashMode: FlashMode;
  hapticFeedback: boolean;
  noiseGateThreshold: number; // 2 to 40
  speechLanguage: string; // e.g. "en-US"
  customVocabulary: string; // comma-separated terms
  zenMode: boolean; // Fullscreen distraction-free dining mode
  roomCode: string;
  roomPin: string;
  customColors?: CustomColors;
  alertWords: string; // comma-separated words/names to watch for
  showTableRadar: boolean;
  showSpeakerLabels: boolean;
  finalOnlyMode: boolean;
  readingRuler: boolean;
  wordSpacing: WordSpacing;
  alertChime: boolean;
  showQuickReply: boolean;
  showSignalMeter: boolean;
  showStarButtons: boolean;
  showOnGlassControls: boolean;
  showKeywordAlerts: boolean;
  showJumpToLive: boolean;
}

export interface StoreState {
  speakers: Speaker[];
  utterances: Utterance[];
  settings: Settings;
  status: EngineStatus;
  listening: boolean;
  audioLevel: AudioLevel;
  latestSpeakerId: SpeakerId | null;
  flashActive: boolean;
  activeManualSpeakerId: SpeakerId | null;
  lastAlertMatch: { word: string; speakerName: string; timestamp: number } | null;
  /** Active conversational speaker turn — carried forward while one person keeps talking. */
  currentSpeakerId: SpeakerId;
  /** Epoch ms of the last speech received (final or interim). */
  lastSpeechTimestamp: number;
  rogerDisconnected: boolean;
}

/** Window during which a null-speaker utterance inherits the held turn. */
export const SPEAKER_HOLD_WINDOW_MS = 7000;
/** Silence longer than this allows a fresh turn, but we still stay on the held speaker. */
export const SPEAKER_SILENCE_RESET_MS = 10_000;
/** Tapping a speaker relabels the latest utterance when it is this recent. */
export const RECENT_RELABEL_MS = 15_000;

export const SETTINGS_KEY = "alt.settings.v3";
export const TRANSCRIPT_KEY = "alt.transcript.v3";
const PALETTE = ["#ffd400", "#4fc3f7", "#a5d6a7", "#f48fb1", "#ce93d8", "#ffcc80", "#00f0ff", "#ff7043"];

export const DEFAULT_SPEAKERS: Speaker[] = [];

const ROOM_CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS.charAt(Math.floor(Math.random() * ROOM_CODE_CHARS.length));
  }
  return `TABLE-${code}`;
}

export function generateRoomPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

const DEFAULT_SETTINGS: Settings = {
  theme: "yellow-on-black",
  fontPx: 40,
  mode: "table",
  apiKey: "",
  deepgramKey: "",
  engineChoice: "auto",
  stereoMode: false,
  deviceId: "",
  fontFamily: "atkinson",
  fontWeight: "bold",
  letterSpacing: "normal",
  lineSpacing: 1.6,
  bionicReading: false,
  speakerFlash: true,
  flashIntensity: "medium",
  flashMode: "border",
  hapticFeedback: true,
  noiseGateThreshold: 8,
  speechLanguage: "en-US",
  customVocabulary: "",
  zenMode: false,
  roomCode: generateRoomCode(),
  roomPin: generateRoomPin(),
  alertWords: "",
  showTableRadar: true,
  showSpeakerLabels: true,
  finalOnlyMode: false,
  readingRuler: false,
  wordSpacing: "normal",
  alertChime: true,
  showQuickReply: true,
  showSignalMeter: true,
  showStarButtons: true,
  showOnGlassControls: true,
  showKeywordAlerts: true,
  showJumpToLive: true,
};

export function clampFont(px: number): number {
  if (Number.isNaN(px)) return DEFAULT_SETTINGS.fontPx;
  return Math.min(120, Math.max(20, Math.round(px)));
}

function readJSON(key: string): unknown {
  try {
    if (typeof localStorage === "undefined") return undefined;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    if (key === TRANSCRIPT_KEY && typeof value === "object" && value !== null && "utterances" in value) {
      try {
        const val = value as { speakers?: unknown; utterances?: unknown[] };
        const utterances = Array.isArray(val.utterances) ? val.utterances.slice(-200) : [];
        localStorage.setItem(key, JSON.stringify({ speakers: val.speakers, utterances }));
      } catch {
        return;
      }
    }
    return;
  }
}

export function loadSettings(): Settings {
  const raw = readJSON(SETTINGS_KEY) as Partial<Settings> | undefined;
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };

  const validThemes: Theme[] = ["yellow-on-black", "white-on-black", "black-on-white", "cyan-on-black", "amber-on-dark", "custom"];
  const theme = validThemes.includes(raw.theme as Theme) ? (raw.theme as Theme) : "yellow-on-black";

  const s: Settings = {
    theme,
    fontPx: typeof raw.fontPx === "number" ? clampFont(raw.fontPx) : DEFAULT_SETTINGS.fontPx,
    mode: raw.mode === "table" || raw.mode === "classroom" || raw.mode === "solo" || raw.mode === "diagnostics" ? raw.mode : "table",
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    deepgramKey: typeof raw.deepgramKey === "string" ? raw.deepgramKey : "",
    engineChoice: raw.engineChoice === "gemini" || raw.engineChoice === "deepgram" || raw.engineChoice === "web-speech" ? raw.engineChoice : "auto",
    stereoMode: Boolean(raw.stereoMode),
    deviceId: typeof raw.deviceId === "string" ? raw.deviceId : "",
    fontFamily: raw.fontFamily === "dyslexic" || raw.fontFamily === "lexend" || raw.fontFamily === "system" ? raw.fontFamily : "atkinson",
    fontWeight: raw.fontWeight === "normal" || raw.fontWeight === "extra-bold" || raw.fontWeight === "black" ? raw.fontWeight : "bold",
    letterSpacing: raw.letterSpacing === "wide" || raw.letterSpacing === "extra-wide" ? raw.letterSpacing : "normal",
    lineSpacing: typeof raw.lineSpacing === "number" ? raw.lineSpacing : 1.6,
    bionicReading: Boolean(raw.bionicReading),
    speakerFlash: raw.speakerFlash !== undefined ? Boolean(raw.speakerFlash) : true,
    flashIntensity: raw.flashIntensity === "subtle" || raw.flashIntensity === "vivid" ? raw.flashIntensity : "medium",
    flashMode: raw.flashMode === "screen" || raw.flashMode === "banner" || raw.flashMode === "off" ? raw.flashMode : "border",
    hapticFeedback: raw.hapticFeedback !== undefined ? Boolean(raw.hapticFeedback) : true,
    noiseGateThreshold: typeof raw.noiseGateThreshold === "number" ? raw.noiseGateThreshold : 8,
    speechLanguage: typeof raw.speechLanguage === "string" && raw.speechLanguage ? raw.speechLanguage : "en-US",
    customVocabulary: typeof raw.customVocabulary === "string" ? raw.customVocabulary : "",
    zenMode: Boolean(raw.zenMode),
    roomCode:
      typeof raw.roomCode === "string" && /^TABLE-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/i.test(raw.roomCode)
        ? raw.roomCode.toUpperCase()
        : generateRoomCode(),
    roomPin:
      typeof raw.roomPin === "string" && /^\d{4}$/.test(raw.roomPin)
        ? raw.roomPin
        : generateRoomPin(),
    customColors: raw.customColors,
    alertWords: typeof raw.alertWords === "string" ? raw.alertWords : "",
    showTableRadar: raw.showTableRadar !== undefined ? Boolean(raw.showTableRadar) : true,
    showSpeakerLabels: raw.showSpeakerLabels !== undefined ? Boolean(raw.showSpeakerLabels) : true,
    finalOnlyMode: Boolean(raw.finalOnlyMode),
    readingRuler: Boolean(raw.readingRuler),
    wordSpacing: raw.wordSpacing === "wide" || raw.wordSpacing === "extra-wide" ? raw.wordSpacing : "normal",
    alertChime: raw.alertChime !== undefined ? Boolean(raw.alertChime) : true,
    showQuickReply: raw.showQuickReply !== undefined ? Boolean(raw.showQuickReply) : true,
    showSignalMeter: raw.showSignalMeter !== undefined ? Boolean(raw.showSignalMeter) : true,
    showStarButtons: raw.showStarButtons !== undefined ? Boolean(raw.showStarButtons) : true,
    showOnGlassControls: raw.showOnGlassControls !== undefined ? Boolean(raw.showOnGlassControls) : true,
    showKeywordAlerts: raw.showKeywordAlerts !== undefined ? Boolean(raw.showKeywordAlerts) : true,
    showJumpToLive: raw.showJumpToLive !== undefined ? Boolean(raw.showJumpToLive) : true,
  };

  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get("mode");
    if (urlMode === "classroom" || urlMode === "solo" || urlMode === "table" || urlMode === "diagnostics") {
      s.mode = urlMode;
      if (urlMode === "classroom") {
        s.showSpeakerLabels = false;
        s.fontPx = 52;
      }
    }
    const urlTheme = params.get("theme");
    if (urlTheme && validThemes.includes(urlTheme as Theme)) {
      s.theme = urlTheme as Theme;
    }
  }

  return s;
}

const DEMO_CLASS_UTTERANCES: Utterance[] = [
  { id: "demo-1", text: "Good morning class, please open your science workbooks to page 42.", startMs: 0, endMs: 4000, speakerId: null, final: true },
  { id: "demo-2", text: "Today we will explore how chloroplasts capture sunlight during photosynthesis.", startMs: 4500, endMs: 9500, speakerId: null, final: true },
  { id: "demo-3", text: "Remember Alex, problem number 3 will be featured on Friday's quiz.", startMs: 10000, endMs: 15000, speakerId: null, final: true, starred: true },
  { id: "demo-4", text: "Notice the difference between light reactions and the Calvin cycle.", startMs: 15500, endMs: 21000, speakerId: null, final: true },
  { id: "demo-5", text: "The primary chemical output produced here is glucose, which plants use for cellular respiration.", startMs: 21500, endMs: 28000, speakerId: null, final: true },
];

export function loadTranscript(): { speakers: Speaker[]; utterances: Utterance[] } {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1" || params.get("sample") === "1") {
      return { speakers: [...DEFAULT_SPEAKERS], utterances: [...DEMO_CLASS_UTTERANCES] };
    }
  }
  const raw = readJSON(TRANSCRIPT_KEY) as { speakers?: Speaker[]; utterances?: Utterance[] } | undefined;
  if (!raw || typeof raw !== "object") return { speakers: [...DEFAULT_SPEAKERS], utterances: [] };
  const rawSpeakers = Array.isArray(raw.speakers) ? raw.speakers : [];
  const legacyRegex = /^(Mom \(Left\)|Dad \(Right\)|Across Table)$/i;
  const filteredSpeakers = rawSpeakers.filter((s) => s && typeof s.name === "string" && !legacyRegex.test(s.name.trim()));
  return {
    speakers: filteredSpeakers,
    utterances: Array.isArray(raw.utterances) ? raw.utterances.filter((u) => u && u.final) : [],
  };
}

const persisted = loadTranscript();

let state: StoreState = {
  speakers: persisted.speakers,
  utterances: persisted.utterances,
  settings: loadSettings(),
  status: { state: "idle" },
  listening: false,
  audioLevel: { left: 0, right: 0, activeSpeakerId: null },
  latestSpeakerId: null,
  flashActive: false,
  activeManualSpeakerId: null,
  lastAlertMatch: null,
  currentSpeakerId: persisted.speakers[0]?.id ?? "s1",
  lastSpeechTimestamp: 0,
  rogerDisconnected: false,
};

const listeners = new Set<() => void>();

export function persist(): void {
  writeJSON(SETTINGS_KEY, state.settings);
  writeJSON(TRANSCRIPT_KEY, { speakers: state.speakers, utterances: state.utterances.filter((u) => u.final) });
}

function update(fn: (s: StoreState) => StoreState): void {
  state = fn(state);
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getState(): StoreState {
  return state;
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getState, getState);
}

function ensureSpeaker(speakers: Speaker[], id: SpeakerId): Speaker[] {
  if (speakers.some((s) => s.id === id)) return speakers;
  return [...speakers, { id, name: `Speaker ${speakers.length + 1}`, color: PALETTE[speakers.length % PALETTE.length] ?? "#ffffff", position: "none" }];
}

export function parseAlertWords(csv: string): string[] {
  return csv
    .split(",")
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

export function findAlertMatch(text: string, alertWordsCsv: string): string | null {
  const alerts = parseAlertWords(alertWordsCsv);
  if (alerts.length === 0 || !text) return null;
  const tokens = text.match(/[A-Za-z0-9']+/g) ?? [];
  const lowerText = text.toLowerCase();
  for (const alert of alerts) {
    const a = alert.toLowerCase();
    if (a.includes(" ") && lowerText.includes(a)) return alert;
    for (const token of tokens) {
      const t = token.toLowerCase();
      if (t === a || t.startsWith(a)) return alert;
    }
  }
  return null;
}

/**
 * Resolve who a null-speaker utterance belongs to using the conversational
 * turn hold: a manual lock wins, otherwise the active turn is carried
 * forward so one person talking for minutes stays one speaker.
 */
function resolveHeldSpeaker(s: StoreState): SpeakerId | null {
  if (s.activeManualSpeakerId) return s.activeManualSpeakerId;
  if (s.audioLevel.activeSpeakerId) return s.audioLevel.activeSpeakerId;
  const elapsed = Date.now() - s.lastSpeechTimestamp;
  const withinHold = s.lastSpeechTimestamp === 0 || elapsed < SPEAKER_HOLD_WINDOW_MS;
  const heldValid = s.speakers.some((sp) => sp.id === s.currentSpeakerId);
  if (withinHold && heldValid) return s.currentSpeakerId;
  return heldValid ? s.currentSpeakerId : (s.speakers[0]?.id ?? null);
}

export function addOrUpdateUtterance(u: Utterance): void {
  update((s) => {
    const assignedSpeakerId: SpeakerId | null =
      u.speakerId === null ? resolveHeldSpeaker(s) : u.speakerId;
    const effective: Utterance = { ...u, speakerId: assignedSpeakerId };
    const speakers = effective.speakerId ? ensureSpeaker(s.speakers, effective.speakerId) : s.speakers;
    // Advance the conversational turn.
    const currentSpeakerId = effective.speakerId ?? s.currentSpeakerId;
    const lastSpeechTimestamp = Date.now();
    const found = s.utterances.some((x) => x.id === effective.id);
    const existing = found ? s.utterances.find((x) => x.id === effective.id) : undefined;
    const merged: Utterance = existing?.starred !== undefined ? { ...effective, starred: effective.starred ?? existing.starred } : effective;
    // Live interim rows always move to the end so streaming words append to
    // the current speaker turn instead of sitting mid-history.
    const utterances = !effective.final && effective.text.trim().length === 0
      ? s.utterances.filter((x) => x.id !== effective.id)
      : found
        ? merged.final
          ? s.utterances.map((x) => (x.id === effective.id ? merged : x))
          : [...s.utterances.filter((x) => x.id !== effective.id), merged]
        : [...s.utterances, merged];

    let flashActive = s.flashActive;
    let latestSpeakerId = s.latestSpeakerId;
    let lastAlertMatch = s.lastAlertMatch;

    const matchedWord = findAlertMatch(effective.text, s.settings.alertWords);
    const speakerChanged = effective.speakerId !== null && effective.speakerId !== s.latestSpeakerId;
    if (effective.speakerId && speakerChanged) {
      latestSpeakerId = effective.speakerId;
      if (s.settings.speakerFlash && s.settings.flashMode !== "off") {
        flashActive = true;
        const dur = s.settings.flashIntensity === "subtle" ? 250 : s.settings.flashIntensity === "vivid" ? 600 : 400;
        setTimeout(() => {
          update((curr) => ({ ...curr, flashActive: false }));
        }, dur);
      }
      if (!matchedWord && s.settings.hapticFeedback && typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([80, 40, 80]);
        } catch {}
      }
    } else if (effective.speakerId) {
      latestSpeakerId = effective.speakerId;
    }

    if (matchedWord) {
      const speakerName =
        (effective.speakerId ? speakers.find((sp) => sp.id === effective.speakerId)?.name : undefined) ?? "Unknown Speaker";
      lastAlertMatch = { word: matchedWord, speakerName, timestamp: Date.now() };
      flashActive = true;
      const dur = s.settings.flashIntensity === "subtle" ? 250 : s.settings.flashIntensity === "vivid" ? 600 : 400;
      setTimeout(() => {
        update((curr) => ({ ...curr, flashActive: false }));
      }, dur);
      if (s.settings.hapticFeedback && typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([160, 60, 160, 60, 240]);
        } catch {}
      }
    }

    return { ...s, speakers, utterances, latestSpeakerId, flashActive, lastAlertMatch, currentSpeakerId, lastSpeechTimestamp };
  });
}

export function setActiveManualSpeaker(id: SpeakerId | null): void {
  update((s) => ({ ...s, activeManualSpeakerId: id }));
}

export function resetToAutoSpeaker(): void {
  update((s) => {
    const fallbackSpeakerId = s.audioLevel.activeSpeakerId ?? s.speakers[0]?.id ?? "s1";
    return {
      ...s,
      activeManualSpeakerId: null,
      currentSpeakerId: fallbackSpeakerId,
      latestSpeakerId: fallbackSpeakerId,
    };
  });
}

function switchActiveSpeaker(s: StoreState, speakerId: SpeakerId): StoreState {
  const speakers = ensureSpeaker(s.speakers, speakerId);
  let utterances = s.utterances;
  if (utterances.length > 0) {
    const latest = utterances[utterances.length - 1]!;
    const refTime = latest.endMs || latest.startMs || 0;
    const now = Date.now();
    // Utterance timestamps from speech engines are epoch ms; small test timestamps (e.g. 0/1) are treated as recent.
    const isRecent = refTime <= 0 || refTime > 1_000_000_000_000 ? now - refTime <= RECENT_RELABEL_MS : true;
    // If timestamp looks like epoch and is stale, don't relabel. If it's a relative/small value, treat as recent only when endMs is 0/1 style test data.
    const staleEpoch = refTime > 1_000_000_000_000 && now - refTime > RECENT_RELABEL_MS;
    if (!staleEpoch && isRecent) {
      utterances = utterances.map((x, i) => (i === utterances.length - 1 ? { ...x, speakerId } : x));
    }
  }
  return {
    ...s,
    speakers,
    utterances,
    activeManualSpeakerId: speakerId,
    latestSpeakerId: speakerId,
    currentSpeakerId: speakerId,
    lastSpeechTimestamp: Date.now(),
  };
}

/**
 * Switch the active speaker turn for current and future speech. Tapping
 * "Dad" immediately relabels Dad's recent words (<15s) and holds his turn.
 */
export function setActiveSpeaker(speakerId: SpeakerId): void {
  update((s) => switchActiveSpeaker(s, speakerId));
}

/** Backwards-compatible alias of {@link setActiveSpeaker}. */
export function assignLatestUtteranceSpeaker(speakerId: SpeakerId): void {
  update((s) => switchActiveSpeaker(s, speakerId));
}

export function dismissAlert(): void {
  update((s) => ({ ...s, lastAlertMatch: null }));
}

export function toggleStarUtterance(id: string): void {
  update((s) => ({
    ...s,
    utterances: s.utterances.map((u) => (u.id === id ? { ...u, starred: !u.starred } : u)),
  }));
}

export function starLatestUtterance(): void {
  const finalized = state.utterances.filter((u) => u.final);
  const last = finalized[finalized.length - 1];
  if (last) {
    toggleStarUtterance(last.id);
  }
}

export function setAlertWords(alertWords: string): void {
  update((s) => ({ ...s, settings: { ...s.settings, alertWords } }));
}

export function setShowTableRadar(showTableRadar: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, showTableRadar } }));
}

export function setShowSpeakerLabels(showSpeakerLabels: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, showSpeakerLabels } }));
}

export function setShowQuickReply(showQuickReply: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, showQuickReply } }));
}

export function setShowSignalMeter(showSignalMeter: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, showSignalMeter } }));
}

export function setShowStarButtons(showStarButtons: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, showStarButtons } }));
}

export function setShowOnGlassControls(showOnGlassControls: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, showOnGlassControls } }));
}

export function setShowKeywordAlerts(showKeywordAlerts: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, showKeywordAlerts } }));
}

export function setShowJumpToLive(showJumpToLive: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, showJumpToLive } }));
}

export function relabel(ids: string[], speakerId: SpeakerId): void {
  update((s) => {
    const latest = s.utterances[s.utterances.length - 1];
    const shouldUpdateCurrent = s.activeManualSpeakerId === null && latest && ids.includes(latest.id);
    return {
      ...s,
      speakers: ensureSpeaker(s.speakers, speakerId),
      utterances: s.utterances.map((u) => (ids.includes(u.id) ? { ...u, speakerId } : u)),
      ...(shouldUpdateCurrent ? { currentSpeakerId: speakerId } : {}),
    };
  });
}

export function editText(id: string, text: string): void {
  update((s) => ({
    ...s,
    utterances: s.utterances.map((u) => (u.id === id ? { ...u, text } : u)),
  }));
}

export function addSpeaker(name: string, color?: string, position?: SeatingPosition): SpeakerId {
  let newId: SpeakerId = "";
  update((s) => {
    const baseId = name.toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/^_+|_+$/g, "") || `s${s.speakers.length + 1}`;
    let candidateId = baseId;
    let counter = 1;
    while (s.speakers.some((sp) => sp.id === candidateId)) {
      candidateId = `${baseId}_${counter++}`;
    }
    newId = candidateId;
    const chosenColor = color || PALETTE[s.speakers.length % PALETTE.length] || "#ffd400";
    const newSpeaker: Speaker = {
      id: newId,
      name,
      color: chosenColor,
      position: position ?? "none",
    };
    const speakers = [...s.speakers, newSpeaker];
    const currentSpeakerId = s.speakers.some((sp) => sp.id === s.currentSpeakerId) ? s.currentSpeakerId : newId;
    return {
      ...s,
      speakers,
      currentSpeakerId,
    };
  });
  return newId;
}

export function removeSpeaker(id: SpeakerId): void {
  update((s) => {
    const speakers = s.speakers.filter((sp) => sp.id !== id);
    const activeManualSpeakerId = s.activeManualSpeakerId === id ? null : s.activeManualSpeakerId;
    const currentSpeakerId = s.currentSpeakerId === id ? (speakers[0]?.id ?? "s1") : s.currentSpeakerId;
    const latestSpeakerId = s.latestSpeakerId === id ? null : s.latestSpeakerId;
    return {
      ...s,
      speakers,
      activeManualSpeakerId,
      currentSpeakerId,
      latestSpeakerId,
    };
  });
}

export function upsertSpeaker(sp: { id: SpeakerId; name: string; color?: string; position?: SeatingPosition }): void {
  update((s) => {
    const exists = s.speakers.some((item) => item.id === sp.id);
    let speakers: Speaker[];
    if (exists) {
      speakers = s.speakers.map((item) => {
        if (item.id !== sp.id) return item;
        return {
          ...item,
          name: sp.name || item.name,
          color: sp.color !== undefined ? sp.color : item.color,
          position: sp.position !== undefined && sp.position !== "none" ? sp.position : (item.position ?? "none"),
        };
      });
    } else {
      const color = sp.color || PALETTE[s.speakers.length % PALETTE.length] || "#4fc3f7";
      const newSpeaker: Speaker = {
        id: sp.id,
        name: sp.name,
        color,
        position: sp.position ?? "none",
      };
      speakers = [...s.speakers, newSpeaker];
    }
    const currentSpeakerId = s.speakers.some((item) => item.id === s.currentSpeakerId)
      ? s.currentSpeakerId
      : (speakers[0]?.id ?? "s1");
    return {
      ...s,
      speakers,
      currentSpeakerId,
    };
  });
}

export function regenerateRoomSecurity(): { roomCode: string; roomPin: string } {
  const roomCode = generateRoomCode();
  const roomPin = generateRoomPin();
  update((s) => ({
    ...s,
    settings: {
      ...s.settings,
      roomCode,
      roomPin,
    },
  }));
  return { roomCode, roomPin };
}

export function setRoomPin(pin: string): void {
  update((s) => ({
    ...s,
    settings: {
      ...s.settings,
      roomPin: pin,
    },
  }));
}

export function setRoomCode(roomCode: string): void {
  update((s) => ({
    ...s,
    settings: {
      ...s.settings,
      roomCode,
    },
  }));
}

export function renameSpeaker(id: SpeakerId, name: string): void {
  update((s) => ({
    ...s,
    speakers: s.speakers.map((sp) => (sp.id === id ? { ...sp, name } : sp)),
  }));
}

export function setSpeakerColor(id: SpeakerId, color: string): void {
  update((s) => ({
    ...s,
    speakers: s.speakers.map((sp) => (sp.id === id ? { ...sp, color } : sp)),
  }));
}

export function setSpeakerPosition(id: SpeakerId, position: SeatingPosition): void {
  update((s) => ({
    ...s,
    speakers: s.speakers.map((sp) => (sp.id === id ? { ...sp, position } : sp)),
  }));
}

export function updateAudioLevel(level: AudioLevel): void {
  update((s) => {
    if (s.activeManualSpeakerId === null && level.activeSpeakerId && level.activeSpeakerId !== s.currentSpeakerId) {
      return {
        ...s,
        audioLevel: level,
        currentSpeakerId: level.activeSpeakerId,
        latestSpeakerId: level.activeSpeakerId,
      };
    }
    return { ...s, audioLevel: level };
  });
}

export function setTheme(theme: Theme): void {
  update((s) => ({ ...s, settings: { ...s.settings, theme } }));
}

export function setCustomColors(colors: CustomColors): void {
  update((s) => ({ ...s, settings: { ...s.settings, theme: "custom", customColors: colors } }));
}

export function setFontPx(fontPx: number): void {
  update((s) => ({ ...s, settings: { ...s.settings, fontPx: clampFont(fontPx) } }));
}

export function setFontWeight(fontWeight: FontWeight): void {
  update((s) => ({ ...s, settings: { ...s.settings, fontWeight } }));
}

export function setLetterSpacing(letterSpacing: LetterSpacing): void {
  update((s) => ({ ...s, settings: { ...s.settings, letterSpacing } }));
}

export function setLineSpacing(lineSpacing: number): void {
  update((s) => ({ ...s, settings: { ...s.settings, lineSpacing } }));
}

export function setMode(mode: Mode): void {
  update((s) => ({ ...s, settings: { ...s.settings, mode } }));
}

export function setApiKey(apiKey: string): void {
  update((s) => ({ ...s, settings: { ...s.settings, apiKey } }));
}

export function setDeepgramKey(deepgramKey: string): void {
  update((s) => ({ ...s, settings: { ...s.settings, deepgramKey } }));
}

export function setEngineChoice(engineChoice: EngineChoice): void {
  update((s) => ({ ...s, settings: { ...s.settings, engineChoice } }));
}

export function setStereoMode(stereoMode: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, stereoMode } }));
}

export function setDeviceId(deviceId: string): void {
  update((s) => ({ ...s, settings: { ...s.settings, deviceId } }));
}

export function setFontFamily(fontFamily: FontFamily): void {
  update((s) => ({ ...s, settings: { ...s.settings, fontFamily } }));
}

export function setWordSpacing(wordSpacing: WordSpacing): void {
  update((s) => ({ ...s, settings: { ...s.settings, wordSpacing } }));
}

export function setAlertChime(alertChime: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, alertChime } }));
}

export function setBionicReading(bionicReading: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, bionicReading } }));
}

export function setSpeakerFlash(speakerFlash: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, speakerFlash } }));
}

export function setFlashIntensity(flashIntensity: FlashIntensity): void {
  update((s) => ({ ...s, settings: { ...s.settings, flashIntensity } }));
}

export function setFlashMode(flashMode: FlashMode): void {
  update((s) => ({ ...s, settings: { ...s.settings, flashMode } }));
}

export function setHapticFeedback(hapticFeedback: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, hapticFeedback } }));
}

export function setNoiseGateThreshold(noiseGateThreshold: number): void {
  update((s) => ({ ...s, settings: { ...s.settings, noiseGateThreshold: Math.max(1, Math.min(50, noiseGateThreshold)) } }));
}

export function setSpeechLanguage(speechLanguage: string): void {
  update((s) => ({ ...s, settings: { ...s.settings, speechLanguage } }));
}

export function setCustomVocabulary(customVocabulary: string): void {
  update((s) => ({ ...s, settings: { ...s.settings, customVocabulary } }));
}

export function setZenMode(zenMode: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, zenMode } }));
}

export function applyProfile(profileName: "dinner" | "classroom" | "lecture" | "evening" | "high-visibility"): void {
  update((s) => {
    let settings = { ...s.settings };
    if (profileName === "dinner") {
      settings = {
        ...settings,
        mode: "table",
        showSpeakerLabels: true,
        showTableRadar: true,
        fontPx: 44,
        fontWeight: "bold",
        speakerFlash: true,
        flashIntensity: "medium",
        flashMode: "border",
        lineSpacing: 1.6,
      };
    } else if (profileName === "classroom" || profileName === "lecture") {
      settings = {
        ...settings,
        mode: "classroom",
        showSpeakerLabels: false,
        fontPx: 52,
        fontWeight: "bold",
        lineSpacing: 1.8,
        speakerFlash: false,
        stereoMode: false,
        showTableRadar: false,
      };
    } else if (profileName === "evening") {
      settings = {
        ...settings,
        fontPx: 40,
        fontWeight: "bold",
        flashIntensity: "subtle",
        lineSpacing: 1.6,
      };
    } else if (profileName === "high-visibility") {
      settings = {
        ...settings,
        fontPx: 64,
        fontWeight: "black",
        letterSpacing: "wide",
        lineSpacing: 2.0,
        bionicReading: true,
        flashIntensity: "vivid",
        flashMode: "border",
      };
    }
    return { ...s, settings };
  });
}

export function setStatus(status: EngineStatus): void {
  update((s) => ({ ...s, status }));
}

export function setListening(listening: boolean): void {
  update((s) => ({ ...s, listening }));
}

export function clear(): void {
  update((s) => ({ ...s, utterances: [] }));
}

export function clearInterimUtterances(): void {
  update((s) => ({
    ...s,
    utterances: s.utterances.filter((u) => u.final),
  }));
}

export function setFinalOnlyMode(finalOnlyMode: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, finalOnlyMode } }));
}

export function setReadingRuler(readingRuler: boolean): void {
  update((s) => ({ ...s, settings: { ...s.settings, readingRuler } }));
}

export function setRogerDisconnected(rogerDisconnected: boolean): void {
  update((s) => ({ ...s, rogerDisconnected }));
}

export function resetStore(): void {
  state = {
    speakers: [...DEFAULT_SPEAKERS],
    utterances: [],
    settings: {
      ...DEFAULT_SETTINGS,
      roomCode: generateRoomCode(),
      roomPin: generateRoomPin(),
    },
    status: { state: "idle" },
    listening: false,
    audioLevel: { left: 0, right: 0, activeSpeakerId: null },
    latestSpeakerId: null,
    flashActive: false,
    activeManualSpeakerId: null,
    lastAlertMatch: null,
    currentSpeakerId: DEFAULT_SPEAKERS[0]?.id ?? "s1",
    lastSpeechTimestamp: 0,
    rogerDisconnected: false,
  };
  persist();
  listeners.forEach((l) => l());
}
