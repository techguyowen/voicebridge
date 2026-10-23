# Task: Build First-Class Cloud AI & API Key Management in VoiceBridge

The user reported:
"I cant put an api key in for the cloud models"

Currently:
1. API keys are buried all the way down in the 5th tab ("Audio") of `SettingsDrawer.tsx`.
2. The inputs are obscured `type="password"` with no show/hide button, no paste button, and no connection test button.
3. On iPads and Chromebooks, pasting into password fields without an explicit paste button or show/hide toggle can cause iOS password suggestion overlays or clipboard friction.
4. There is no top-level indicator or shortcut to access cloud models.

Implement a dedicated, accessible, and foolproof Cloud AI setup in `/Users/techguyowen/Documents/antigravity/magical-pythagoras`.

---

## 1. Topbar Shortcut in `src/App.tsx`
- Add a `☁` button in the topbar island header (next to `📱` and `⚙`):
  - Clicking `☁` opens `SettingsDrawer` directly to the `"cloud"` tab!
- Pass `initialTab?: "presets" | "cloud" | "seating" | "visual" | "alerts" | "audio"` to `<SettingsDrawer initialTab={drawerTab} onClose={...} />`.
- Track `drawerTab` state in `App.tsx` (default `"presets"`, set to `"cloud"` when `☁` is tapped).

## 2. Dedicated Cloud AI Tab & Key Fields in `src/ui/SettingsDrawer.tsx`
- Update `activeTab` to include `"cloud"`: `"presets" | "cloud" | "seating" | "visual" | "alerts" | "audio"`.
- Put `☁ Cloud AI` as the **second tab** in `settings-nav-tabs` so it is immediately visible upon opening settings.
- In `activeTab === "cloud"`:
  - Add an **Engine Selector** card allowing 1-tap switching between:
    - `🌐 Free Native Browser Speech` (no key required, default)
    - `✨ Google Gemini Live Streaming` (requires Gemini key)
    - `⚡ Deepgram Nova-3 Diarization` (requires Deepgram key)
  - Create a reusable `ApiKeyField` component for both Gemini and Deepgram:
    - **Live status badge**: `🟢 Saved Locally` (showing masked snippet `...xxxx`) vs `⚪ No Key Entered`.
    - **Input row**:
      - `type={show ? "text" : "password"}` with `autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck="false"`.
      - `👁 Show` / `🔒 Hide` toggle button.
      - `📋 Paste` button using `navigator.clipboard.readText()`.
      - `✕ Clear` button when a key exists.
    - **Connection test button**:
      - `🧪 Test Gemini Connection`: Fetches `https://generativelanguage.googleapis.com/v1beta/models?key=${key}` and displays `✓ Connected to Google Gemini!` or the exact error.
      - `🧪 Test Deepgram Connection`: Fetches `https://api.deepgram.com/v1/projects` with `Authorization: Token ${key}` and displays `✓ Connected to Deepgram!` or error.
    - **Help links**: Links to Google AI Studio and Deepgram console for getting keys.
    - **Privacy assurance text**: Explains that keys are stored 100% locally in `localStorage` on this device and only sent directly to Google/Deepgram.
- In `activeTab === "audio"`:
  - Keep the engine selector, but under API keys, provide the same `ApiKeyField` or a button jumping to the Cloud AI tab so users can enter keys from either tab.

## 3. Styling in `src/ui/styles.css`
- Add clean, high-contrast styles for:
  - `.key-field-box`: Rounded glass card with subtle border.
  - `.key-input-row`: Flex row with responsive wrapping.
  - `.key-action-btn`: Rounded pill button for Show/Hide, Paste, Clear.
  - `.key-test-btn`: Primary test button with loading state.
  - `.key-status-badge.configured`: Green pill badge.
  - `.key-status-badge.empty`: Muted gray pill badge.
  - `.key-test-result.success`: Green callout box.
  - `.key-test-result.failure`: Red alert callout box.

## 4. Decouple Profiles from Theme in `src/ui/store.ts` (if any remains)
- Ensure `applyProfile` never overrides `theme` or `customColors`.
- Add unit test in `src/ui/store.test.ts` verifying that `applyProfile` preserves the active theme.

## 5. Verification
- Run `npm run typecheck` (0 errors).
- Run `npm test` (all tests passing).
- Run `npm run build` (clean build).
