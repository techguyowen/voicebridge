import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { VoxStreamDisplay } from "./VoxStreamDisplay";
import { addOrUpdateUtterance, resetStore, setBionicReading } from "./store";

describe("VoxStreamDisplay", () => {
  beforeEach(() => {
    resetStore();
  });

  it("preserves whitespace between head and active-word-highlight when bionicReading is enabled", () => {
    setBionicReading(true);
    addOrUpdateUtterance({
      id: "u1",
      speakerId: null,
      text: "Hello world today is great",
      startMs: 1000,
      endMs: 2000,
      final: true,
    });

    const html = renderToStaticMarkup(<VoxStreamDisplay />);
    expect(html).toContain("active-word-highlight karaoke-active");

    // Strip HTML tags and verify words are not mashed together (specifically "world" and "today")
    const plainText = html.replace(/<[^>]+>/g, "");
    expect(plainText.replace(/\s+/g, " ")).toContain("Hello world today is great");
    expect(plainText).not.toContain("worldtoday");

    // Also verify the space appears right before the active-word-highlight span
    expect(html).toMatch(/ <span class="active-word-highlight karaoke-active">/);
  });
});
