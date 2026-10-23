import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TutorialModal } from "./TutorialModal";

describe("TutorialModal", () => {
  it("renders the first tutorial step (Classroom Teleprompter) by default", () => {
    const html = renderToStaticMarkup(<TutorialModal onClose={() => {}} />);

    expect(html).toContain("VoiceBridge Student Walkthrough");
    expect(html).toContain("Step 1 of 7");
    expect(html).toContain("Classroom Teleprompter");
    expect(html).toContain("Effortless, continuous lecture captions");
    expect(html).toContain("Speech from your teacher flows smoothly upward line-by-line");
    expect(html).toContain("Next →");
  });

  it("renders step dots for all 7 steps", () => {
    const html = renderToStaticMarkup(<TutorialModal onClose={() => {}} />);

    expect(html).toContain('title="Step 1: Classroom Teleprompter"');
    expect(html).toContain('title="Step 2: Touch-to-Hold Scrolling"');
    expect(html).toContain('title="Step 3: Contrast &amp; Font Scaling"');
    expect(html).toContain('title="Step 4: Bookmarking Key Notes"');
    expect(html).toContain('title="Step 5: 1-Tap Copy Notes"');
    expect(html).toContain('title="Step 6: Classroom Quick Replies"');
    expect(html).toContain('title="Step 7: Phonak Roger Loop Audio"');
  });

  it("renders pro tip and back navigation button", () => {
    const html = renderToStaticMarkup(<TutorialModal onClose={() => {}} />);

    expect(html).toContain("Pro Tip:");
    expect(html).toContain("← Back");
  });
});
