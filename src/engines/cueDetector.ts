export type ClassroomCueKind = "page" | "deadline" | "question";

export interface ClassroomCue {
  kind: ClassroomCueKind;
  label: string;
  icon: string;
}

const UNIT_PATTERN = /\b(pages?|chapters?|problems?|slides?|sections?)\s*(?:number|no\.?)?\s*#?\s*(\d{1,4})\b/gi;

const DEADLINE_KEYWORDS = [
  "quiz",
  "quizzes",
  "exam",
  "exams",
  "test",
  "tests",
  "midterm",
  "midterms",
  "final",
  "finals",
  "homework",
  "assignment",
  "assignments",
];

const DUE_PATTERN = /\bdue(?:\s+on)?\s+([a-z]+(?:\s+\d{1,2})?)/gi;

const QUESTION_PHRASES = ["any questions", "does anyone", "who knows"];

function capitalize(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function singularize(unit: string): string {
  const lower = unit.toLowerCase();
  if (lower.endsWith("ses")) return lower.slice(0, -2); // classes -> class (defensive)
  if (lower.endsWith("s") && lower.length > 4) return lower.slice(0, -1);
  if (lower === "pages" || lower === "slides") return lower.slice(0, -1);
  return lower;
}

/**
 * Extract up to 3 deduplicated classroom cues (page references, deadlines,
 * questions) from a single utterance of transcript text.
 */
export function extractClassroomCues(text: string): ClassroomCue[] {
  const cues: ClassroomCue[] = [];
  const seen = new Set<string>();
  const push = (cue: ClassroomCue): void => {
    const key = `${cue.kind}:${cue.label.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (cues.length < 3) cues.push(cue);
  };

  if (!text || !text.trim()) return cues;

  // 1. Page / chapter / problem / slide / section numbers.
  UNIT_PATTERN.lastIndex = 0;
  let unitMatch: RegExpExecArray | null;
  while ((unitMatch = UNIT_PATTERN.exec(text)) !== null) {
    const unit = singularize(unitMatch[1] ?? "");
    const num = unitMatch[2] ?? "";
    if (!unit || !num) continue;
    push({ kind: "page", icon: "📌", label: `${capitalize(unit)} ${num}` });
  }

  // 2. Quizzes / exams / homework / deadlines.
  DUE_PATTERN.lastIndex = 0;
  let dueMatch: RegExpExecArray | null;
  while ((dueMatch = DUE_PATTERN.exec(text)) !== null) {
    const when = (dueMatch[1] ?? "").trim();
    if (!when) continue;
    const label = `Due ${when
      .split(/\s+/)
      .map((w) => (/^\d+$/.test(w) ? w : capitalize(w)))
      .join(" ")}`;
    push({ kind: "deadline", icon: "📝", label });
  }

  const lower = text.toLowerCase();
  for (const keyword of DEADLINE_KEYWORDS) {
    const re = new RegExp(`\\b${keyword}\\b`, "i");
    if (re.test(lower)) {
      push({ kind: "deadline", icon: "📝", label: capitalize(keyword) });
    }
  }

  // 3. Questions.
  const trimmed = text.trim();
  const isQuestion =
    trimmed.endsWith("?") || QUESTION_PHRASES.some((phrase) => lower.includes(phrase));
  if (isQuestion) {
    push({ kind: "question", icon: "❓", label: "Question" });
  }

  return cues;
}
