import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TodGuideModal } from "./TodGuideModal";

describe("TodGuideModal", () => {
  it("renders the 6 checklist items for Teacher of the Deaf & Aides", () => {
    const html = renderToStaticMarkup(<TodGuideModal onClose={() => {}} />);

    expect(html).toContain("TOD &amp; Paraprofessional Quick Guide");
    expect(html).toContain("Phonak Roger Neckloop Receiver Setup");
    expect(html).toContain("Receiver Power &amp; Link Status");
    expect(html).toContain("Select Classroom Mode");
    expect(html).toContain("Check Teacher Transmitter &amp; Mute Alert");
    expect(html).toContain("Student Note Taking &amp; Bookmarking");
    expect(html).toContain("1-Tap Copy Notes at End of Class");
  });

  it("renders Roger Neckloop 3.5mm connection and silence alert details", () => {
    const html = renderToStaticMarkup(<TodGuideModal onClose={() => {}} />);

    expect(html).toContain("3.5mm audio cable from the Phonak Roger Neckloop");
    expect(html).toContain("iPad USB-C or Lightning headphone adapter");
    expect(html).toContain("green status LED is illuminated");
    expect(html).toContain("if no audio is received for 45s, a silence banner alerts the student");
    expect(html).toContain("📋 Copy Notes");
  });

  it("renders full-screen iPad tip and close button", () => {
    const html = renderToStaticMarkup(<TodGuideModal onClose={() => {}} />);

    expect(html).toContain("iPad Full-Screen Tip:");
    expect(html).toContain("Safari Share → Add to Home Screen");
    expect(html).toContain("Close Guide");
  });
});
