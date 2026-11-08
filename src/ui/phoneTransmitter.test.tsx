import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { PhoneTransmitter } from "./PhoneTransmitter";

describe("PhoneTransmitter UI", () => {
  beforeEach(() => {
    // Reset localStorage mocks if any
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  it("renders 1-tap seating position selector with 4 buttons", () => {
    const html = renderToStaticMarkup(<PhoneTransmitter />);

    expect(html).toContain("Your Seating Position (relative to tablet):");
    expect(html).toContain("seating-picker");
    expect(html).toContain("← Left");
    expect(html).toContain("↑ Across");
    expect(html).toContain("→ Right");
    expect(html).toContain("↓ Near");

    // By default, across is active
    expect(html).toContain("seating-btn active");
    expect(html).toContain("↑ Across");
  });

  it("renders mic mode options and speaker details form", () => {
    const html = renderToStaticMarkup(<PhoneTransmitter />);

    expect(html).toContain("Microphone Control Mode:");
    expect(html).toContain("Mute Latch");
    expect(html).toContain("Push-to-Talk");
    expect(html).toContain("Temp Mute");
    expect(html).toContain("START MICROPHONE");
    expect(html).toContain("Speaker Details");
  });
});
