import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsDrawer, type SettingsTab } from "./SettingsDrawer";
import { resetStore } from "./store";

describe("SettingsDrawer Themes Tab", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders Themes navigation tab button", () => {
    const html = renderToStaticMarkup(
      <SettingsDrawer initialTab="themes" onClose={() => {}} onOpenQr={() => {}} />
    );

    expect(html).toContain("🎨 Themes");
    expect(html).toContain("settings-nav-tab active");
  });

  it("renders dedicated themes tab with theme cards and WCAG tags", () => {
    const html = renderToStaticMarkup(
      <SettingsDrawer initialTab="themes" onClose={() => {}} onOpenQr={() => {}} />
    );

    expect(html).toContain("🎨 High-Contrast Themes &amp; Color Palettes");
    expect(html).toContain("Engineered for low vision, macular degeneration, and photophobia");
    expect(html).toContain("theme-grid");

    // All theme options
    expect(html).toContain("Yellow on Black");
    expect(html).toContain("White on Black");
    expect(html).toContain("Black on White");
    expect(html).toContain("Cyan on Black");
    expect(html).toContain("Amber on Dark Brown");
    expect(html).toContain("Custom Palette");

    // Contrast tags
    expect(html).toContain("21:1 Contrast • WCAG AAA");
    expect(html).toContain("18:1 Contrast • WCAG AAA");
    expect(html).toContain("Custom Contrast");

    // Active pill for default theme
    expect(html).toContain("theme-active-pill");
    expect(html).toContain("✓ Active");

    // Live display preview box
    expect(html).toContain("theme-preview-box");
    expect(html).toContain("Live Display Preview");
    expect(html).toContain("Photosynthesis converts water and carbon dioxide into glucose and oxygen.");

    // Quick 1-tap presets
    expect(html).toContain("🌿 OLED Matrix Green");
    expect(html).toContain("🍦 Soft Charcoal &amp; Cream");
    expect(html).toContain("🍋 Navy &amp; Lemon");
    expect(html).toContain("⚡ Electric Magenta");
  });

  it("renders link card to themes tab inside visual tab", () => {
    const html = renderToStaticMarkup(
      <SettingsDrawer initialTab="visual" onClose={() => {}} onOpenQr={() => {}} />
    );

    expect(html).toContain("🎨 Contrast Themes &amp; Custom Colors");
    expect(html).toContain("Open Themes &amp; Color Palettes Tab →");
    // Duplicate feature toggles must not exist in visual tab
    expect(html).not.toContain("Feature Toggles &amp; Distraction-Free Mode");
  });

  it("validates SettingsTab type includes themes", () => {
    const validTabs: SettingsTab[] = [
      "presets",
      "themes",
      "features",
      "cloud",
      "seating",
      "visual",
      "alerts",
      "audio",
    ];
    expect(validTabs).toContain("themes");
    expect(validTabs).toHaveLength(8);
  });

  it("renders tutorial button, TOD quick guide, and iPad full-screen setup card in presets tab", () => {
    const html = renderToStaticMarkup(
      <SettingsDrawer initialTab="presets" onClose={() => {}} onOpenQr={() => {}} />
    );

    // Tutorial button
    expect(html).toContain("📖 VoiceBridge Interactive Walkthrough");
    expect(html).toContain("📖 Open Interactive Tutorial");

    // TOD guide button
    expect(html).toContain("👩‍🏫 TOD &amp; Paraprofessional Checklist");
    expect(html).toContain("👩‍🏫 Open TOD Quick Reference Card");

    // Full-Screen iPad Setup Card
    expect(html).toContain("📱 Full-Screen iPad Setup (Add to Home Screen)");
    expect(html).toContain("Tap the Safari <strong>Share</strong> icon");
    expect(html).toContain("Add to Home Screen");
    expect(html).toContain("Launch from home screen to hide Safari navigation bars");
  });
});
