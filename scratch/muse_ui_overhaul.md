# Task: Complete UI Overhaul & Robust Speaker Turn Continuity for VoiceBridge

The user provided direct feedback:
1. "First off I hate the UI" — The current UI is cluttered, harsh, ugly, and looks like an engineer's debug dashboard with loud neon borders, jagged boxes, and buttons everywhere. It needs to be transformed into a sleek, calm, gorgeous, modern Apple-caliber assistive app that a young girl and her family will love using at the dinner table.
2. "second its not actually detecting that the speaker is staying the same" — Every recognized sentence was being tagged as "Unknown Speaker" or creating a brand new isolated row with another badge chip, failing to detect that the same person is continuing to speak.

You are running on `muse-wonder-1.0-contributor`. Execute this comprehensive overhaul across the codebase in `/Users/techguyowen/Documents/antigravity/magical-pythagoras`.

---

## 1. Speaker Continuity & Turn Clustering (`src/ui/store.ts` & `src/engines/webSpeechEngine.ts`)

### The Problem
- When using a single microphone (Roger mic, iPad mic, USB-C mic), `u.speakerId` arrives as `null` or alternates between turns.
- Even when one person speaks for 5 minutes, every sentence appears as a separate utterance with an "Unknown Speaker" chip.
- It never carried forward the active speaker, nor grouped sentences from the same person.

### The Solution:
1. **Conversational Speaker Turn Hold**:
   - In `src/ui/store.ts`, maintain an active speaker turn:
     - `currentSpeakerId: SpeakerId` (default to the first speaker in `speakers`, e.g. `s1` "Mom").
     - `lastSpeechTimestamp: number`
     - `SPEAKER_HOLD_WINDOW_MS = 7000` (7 seconds).
   - In `addOrUpdateUtterance(u)`:
     - If `u.speakerId` is null:
       - If `state.activeManualSpeakerId` is set, use `state.activeManualSpeakerId`.
       - Otherwise, if less than `SPEAKER_HOLD_WINDOW_MS` has elapsed since the last speech (or if `state.currentSpeakerId` is valid), assign `u.speakerId = state.currentSpeakerId`!
       - If a long silence (> 10s) occurred and no manual lock is active, allow transition or stay on current speaker.
     - Update `currentSpeakerId = effective.speakerId`.
     - Update `lastSpeechTimestamp = Date.now()`.
   - In `setActiveSpeaker(speakerId: SpeakerId)`:
     - Directly switches the active speaker turn for current and future speech, and relabels any recent utterance (< 15s) so if someone taps "Dad", the words Dad just said immediately reflect Dad!

2. **Turn Clustering in Transcript (`src/ui/TranscriptList.tsx`)**:
   - Group consecutive utterances from the same `speakerId` into a single **Speaker Turn Block**!
   - Instead of 20 lines each with "[Mom] hi", "[Mom] how was your day", "[Mom] pass the salt":
     - Render ONE clean speaker header with Mom's avatar/pill and timestamp/direction.
     - Flow all of Mom's sentences together into a readable, beautiful speech paragraph.
     - Show live interim words smoothly appended at the end of the current speaker's paragraph.
     - When Dad speaks, start a new clean block with Dad's header.
   - Each individual utterance can still be starred (`★`) or clicked to edit text.

---

## 2. Complete UI Overhaul (`src/ui/styles.css`, `src/App.tsx`, `src/ui/*`)

### Visual Design Principles (Transform from Cluttered Dashboard to Apple-Caliber Elegance):
1. **Calm, High-Contrast Obsidian Palette**:
   - Replace harsh, jarring `#000000` + 3px neon yellow lines with deep, premium, soothing dark themes:
     - Background: Deep obsidian/slate (`#0a0b0e` / `#000000`), smooth glass panels (`rgba(255, 255, 255, 0.05)` with `backdrop-filter: blur(16px)`).
     - Text: Crisp, high-contrast, beautiful typography (`#ffffff` for White, `#ffe066` for Warm Yellow, `#ffb74d` for Soft Amber, `#38d9a9` for Mint/Cyan).
     - Borders: Subtle, refined 1px translucent borders (`rgba(255, 255, 255, 0.12)`) instead of thick, loud 3px yellow boxes.
     - Accents: Soft, luminous speaker color glows (soft pill badges, subtle left-border ribbon, no abrasive full-width borders).
2. **Sleek Floating Header ("Dynamic Island" Feel)**:
   - Clean, rounded top bar floating gently at the top of the iPad screen:
     - Left: Subtle VoiceBridge wordmark with status pulse (green dot when listening, amber when connecting).
     - Center: Sleek **Active Speaker Pill** showing who is speaking with directional arrow (e.g. `[← Mom (Left)]` with soft soundwave animation).
     - Right: Clean, minimalist action icons (Theme switcher 🎨, Font scaler A-/A+, Fullscreen ⛶, Settings ⚙).
3. **Clean, Focused Transcript Flow**:
   - The conversation takes center stage, like an elegant book or premium chat experience.
   - Large, clear font (configurable, default ~40px) with comfortable line height (1.6x).
   - Generous margins and rounded dialogue cards.
   - Filter bar and search bar should be sleek and collapsible or tucked into a clean top strip.
4. **Intuitive Bottom Dock**:
   - Floating glass dock at the bottom of the screen:
     - **Big, inviting Microphone Button**: Sleek pill button (e.g. Glowing green "Start" / Calm red "Pause").
     - **Quick Speaker Switcher Bar**: Soft, rounded speaker pills (`[← Mom]`, `[↑ Across]`, `[→ Dad]`) that highlight smoothly when active. Tapping one instantly switches who is speaking with zero friction.
     - **Quick Reply Trigger**: Clean pill button that opens a beautiful modal sheet for quick advocate cards (*"Please speak slower"*, Big 72px banner card, TTS speak aloud) instead of cluttering the main screen permanently.
5. **Zen Fullscreen Mode**:
   - When entering Zen mode, everything fades away except the live conversation and a tiny, floating ✕ in the corner, leaving 100% of the iPad screen for distraction-free reading.

---

## Verification
- Run `npm run typecheck` (must pass with 0 errors).
- Update and run `npm test` (all tests must pass).
- Run `npm run build` (must build cleanly).
