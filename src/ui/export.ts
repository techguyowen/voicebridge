import type { Speaker, Utterance } from "../types";

export function formatTranscript(utterances: Utterance[], speakers: Speaker[]): string {
  const names = new Map(speakers.map((s) => [s.id, s.name]));
  const lines: string[] = [];
  let started = false;
  let prev: string | null = null;
  for (const u of utterances) {
    const name = (u.speakerId && names.get(u.speakerId)) || "Unknown";
    if (started && prev !== u.speakerId) lines.push("");
    lines.push(`${name}: ${u.text}`);
    started = true;
    prev = u.speakerId;
  }
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function toMarkdown(utterances: Utterance[], speakers: Speaker[]): string {
  const names = new Map(speakers.map((s) => [s.id, s.name]));
  const nameFor = (u: Utterance): string => (u.speakerId && names.get(u.speakerId)) || "Unknown";
  const starred = utterances.filter((u) => u.starred);
  const full = formatTranscript(utterances, speakers);
  if (starred.length === 0) return full;
  const highlights = starred.map((u) => `- **${nameFor(u)}:** ${u.text}`).join("\n");
  const sections = [`## ★ Starred Highlights`, "", highlights, "", `## Full Transcript`, "", full];
  return sections.join("\n");
}

export function toHtml(utterances: Utterance[], speakers: Speaker[]): string {
  const names = new Map(speakers.map((s) => [s.id, s.name]));
  const nameFor = (u: Utterance): string => (u.speakerId && names.get(u.speakerId)) || "Unknown";
  const starred = utterances.filter((u) => u.starred);
  const parts: string[] = [];
  if (starred.length > 0) {
    parts.push(`<h2>★ Starred Highlights</h2>`);
    parts.push(`<ul>`);
    for (const u of starred) {
      parts.push(`<li><strong>${escapeHtml(nameFor(u))}:</strong> ${escapeHtml(u.text)}</li>`);
    }
    parts.push(`</ul>`);
    parts.push(`<h2>Full Transcript</h2>`);
  }
  for (const u of utterances) {
    parts.push(`<p><strong>${escapeHtml(nameFor(u))}:</strong> ${escapeHtml(u.text)}</p>`);
  }
  return parts.join("\n");
}

export function downloadTranscript(
  utterances: Utterance[],
  speakers: Speaker[],
  format: "txt" | "md" | "html" = "txt"
): void {
  if (typeof document === "undefined") return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  let content = "";
  let mime = "text/plain";
  let ext = "txt";

  if (format === "md") {
    content = toMarkdown(utterances, speakers);
    mime = "text/markdown";
    ext = "md";
  } else if (format === "html") {
    content = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Transcript</title></head><body>\n${toHtml(utterances, speakers)}\n</body></html>`;
    mime = "text/html";
    ext = "html";
  } else {
    content = formatTranscript(utterances, speakers);
    mime = "text/plain";
    ext = "txt";
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `notes-${stamp}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand
    }
  }

  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }

  return false;
}

export async function copyNotesToClipboard(
  utterances: Utterance[],
  speakers: Speaker[],
  starredOnly?: boolean
): Promise<{ ok: boolean; count: number }> {
  const target = starredOnly ? utterances.filter((u) => u.starred) : utterances;
  const text = formatTranscript(target, speakers);
  const ok = await copyToClipboard(text);
  return { ok, count: target.length };
}
