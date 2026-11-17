import { describe, expect, it } from "vitest";
import { extractClassroomCues } from "../cueDetector";

describe("extractClassroomCues page references", () => {
  it("detects page numbers", () => {
    expect(extractClassroomCues("Please open your books to page 42.")).toEqual([
      { kind: "page", icon: "📌", label: "Page 42" },
    ]);
  });

  it("detects chapter numbers", () => {
    expect(extractClassroomCues("Read chapter 5 for tonight.")).toEqual([
      { kind: "page", icon: "📌", label: "Chapter 5" },
    ]);
  });

  it("detects problem numbers with a hash", () => {
    expect(extractClassroomCues("Do problem #3 for warm-up.")).toEqual([
      { kind: "page", icon: "📌", label: "Problem 3" },
    ]);
  });

  it("detects problem numbers written as 'problem number 3'", () => {
    expect(extractClassroomCues("Remember, problem number 3 will be on the board.")).toEqual([
      { kind: "page", icon: "📌", label: "Problem 3" },
    ]);
  });

  it("detects slide and section numbers", () => {
    expect(extractClassroomCues("Next slide 12 shows the diagram.")).toEqual([
      { kind: "page", icon: "📌", label: "Slide 12" },
    ]);
    expect(extractClassroomCues("Review section 4 before lunch.")).toEqual([
      { kind: "page", icon: "📌", label: "Section 4" },
    ]);
  });
});

describe("extractClassroomCues deadlines", () => {
  it("detects quiz mentions", () => {
    expect(extractClassroomCues("There will be a quiz on Friday.")).toEqual([
      { kind: "deadline", icon: "📝", label: "Quiz" },
    ]);
  });

  it("detects homework mentions", () => {
    expect(extractClassroomCues("Your homework is on the desk.")).toEqual([
      { kind: "deadline", icon: "📝", label: "Homework" },
    ]);
  });

  it("detects exam, midterm, final, and assignment keywords", () => {
    expect(extractClassroomCues("The exam covers two units.")).toContainEqual({
      kind: "deadline",
      icon: "📝",
      label: "Exam",
    });
    expect(extractClassroomCues("The midterm is next week.")).toContainEqual({
      kind: "deadline",
      icon: "📝",
      label: "Midterm",
    });
    expect(extractClassroomCues("The final is cumulative.")).toContainEqual({
      kind: "deadline",
      icon: "📝",
      label: "Final",
    });
    expect(extractClassroomCues("Turn in the assignment please.")).toContainEqual({
      kind: "deadline",
      icon: "📝",
      label: "Assignment",
    });
  });

  it("detects due dates with the due day capitalized", () => {
    expect(extractClassroomCues("It is due Friday.")).toEqual([
      { kind: "deadline", icon: "📝", label: "Due Friday" },
    ]);
    expect(extractClassroomCues("The report is due tomorrow.")).toEqual([
      { kind: "deadline", icon: "📝", label: "Due Tomorrow" },
    ]);
  });
});

describe("extractClassroomCues questions", () => {
  it("detects utterances ending with a question mark", () => {
    expect(extractClassroomCues("What time is lunch?")).toEqual([
      { kind: "question", icon: "❓", label: "Question" },
    ]);
  });

  it("detects 'any questions' without a question mark", () => {
    expect(extractClassroomCues("Are there any questions about the lesson")).toEqual([
      { kind: "question", icon: "❓", label: "Question" },
    ]);
  });

  it("detects 'does anyone' and 'who knows' prompts", () => {
    expect(extractClassroomCues("Does anyone remember the answer")).toEqual([
      { kind: "question", icon: "❓", label: "Question" },
    ]);
    expect(extractClassroomCues("Who knows the capital of France")).toEqual([
      { kind: "question", icon: "❓", label: "Question" },
    ]);
  });
});

describe("extractClassroomCues dedup, cap, and empty text", () => {
  it("deduplicates repeated cues", () => {
    expect(extractClassroomCues("Page 5, I said page 5.")).toEqual([
      { kind: "page", icon: "📌", label: "Page 5" },
    ]);
    expect(extractClassroomCues("Quiz quiz quiz.")).toEqual([
      { kind: "deadline", icon: "📝", label: "Quiz" },
    ]);
  });

  it("caps output at 3 cues per utterance", () => {
    const cues = extractClassroomCues("Open page 1, chapter 2, slide 3, section 4, problem 5.");
    expect(cues).toHaveLength(3);
  });

  it("combines page, deadline, and question cues in one utterance", () => {
    expect(extractClassroomCues("Do problem #3 for the quiz tomorrow?")).toEqual([
      { kind: "page", icon: "📌", label: "Problem 3" },
      { kind: "deadline", icon: "📝", label: "Quiz" },
      { kind: "question", icon: "❓", label: "Question" },
    ]);
  });

  it("returns no cues for empty or ordinary text", () => {
    expect(extractClassroomCues("")).toEqual([]);
    expect(extractClassroomCues("   ")).toEqual([]);
    expect(extractClassroomCues("Photosynthesis converts sunlight into glucose.")).toEqual([]);
    expect(extractClassroomCues("The weather is pleasant today.")).toEqual([]);
  });
});
