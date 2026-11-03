import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsDrawer, type SettingsTab } from "./SettingsDrawer";
import { getState, resetStore, setShowExportShelf } from "./store";

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

describe("SettingsDrawer Features Tab", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders the Features navigation tab and Bottom Export Shelf toggle", () => {
    const html = renderToStaticMarkup(
      <SettingsDrawer initialTab="features" onClose={() => {}} onOpenQr={() => {}} />
    );

    expect(html).toContain("🎛 Features");
    expect(html).toContain("Feature Toggles &amp; Distraction-Free Mode");
    expect(html).toContain("Bottom Export Shelf:");
    expect(html).toContain("Show quick export and copy buttons docked below the screen");
  });

  it("clicking the Bottom Export Shelf toggle calls setShowExportShelf and updates store", () => {
    expect(getState().settings.showExportShelf).toBe(false);

    let capturedTree: any = null;
    function Spy() {
      capturedTree = SettingsDrawer({
        initialTab: "features",
        onClose: () => {},
        onOpenQr: () => {},
      });
      return null;
    }
    renderToStaticMarkup(<Spy />);

    function findElement(node: any, predicate: (n: any) => boolean): any {
      if (!node) return null;
      if (predicate(node)) return node;
      if (Array.isArray(node)) {
        for (const child of node) {
          const found = findElement(child, predicate);
          if (found) return found;
        }
      } else if (node.props?.children) {
        return findElement(node.props.children, predicate);
      }
      return null;
    }

    const shelfLabel = findElement(capturedTree, (n: any) => {
      return (
        n?.type === "label" &&
        JSON.stringify(n?.props?.children ?? "").includes("Bottom Export Shelf:")
      );
    });
    expect(shelfLabel).not.toBeNull();

    const checkbox = findElement(shelfLabel, (n: any) => n?.type === "input" && n?.props?.type === "checkbox");
    expect(checkbox).not.toBeNull();
    expect(checkbox.props.checked).toBe(false);

    // Simulate clicking / checking the input
    checkbox.props.onChange({ target: { checked: true } });
    expect(getState().settings.showExportShelf).toBe(true);

    // Re-render and verify checked prop
    renderToStaticMarkup(<Spy />);
    const updatedShelfLabel = findElement(capturedTree, (n: any) => {
      return (
        n?.type === "label" &&
        JSON.stringify(n?.props?.children ?? "").includes("Bottom Export Shelf:")
      );
    });
    const updatedCheckbox = findElement(updatedShelfLabel, (n: any) => n?.type === "input" && n?.props?.type === "checkbox");
    expect(updatedCheckbox.props.checked).toBe(true);

    // Simulate unchecking
    updatedCheckbox.props.onChange({ target: { checked: false } });
    expect(getState().settings.showExportShelf).toBe(false);
  });

  it("reflects changes when setShowExportShelf is invoked", () => {
    setShowExportShelf(true);
    const html = renderToStaticMarkup(
      <SettingsDrawer initialTab="features" onClose={() => {}} onOpenQr={() => {}} />
    );
    expect(html).toContain("Bottom Export Shelf:");
    expect(getState().settings.showExportShelf).toBe(true);
  });
});

