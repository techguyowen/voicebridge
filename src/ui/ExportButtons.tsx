import { useState } from "react";
import { formatTranscript, toHtml, toMarkdown } from "./export";
import { getState } from "./store";

export { toHtml, toMarkdown };

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
      return true;
    } catch {
      return false;
    }
  }
}

function download(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportButtons(): React.JSX.Element {
  const [note, setNote] = useState("");

  const current = (): string => {
    const { utterances, speakers } = getState();
    return formatTranscript(utterances, speakers);
  };

  const currentMarkdown = (): string => {
    const { utterances, speakers } = getState();
    return toMarkdown(utterances, speakers);
  };

  const currentHtml = (): string => {
    const { utterances, speakers } = getState();
    const body = toHtml(utterances, speakers);
    return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Transcript</title></head><body>\n${body}\n</body></html>`;
  };

  const onCopy = async (): Promise<void> => {
    setNote((await copyText(current())) ? "Copied to clipboard." : "Copy failed.");
  };

  const onDownload = (): void => {
    download(current(), `transcript-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`, "text/plain");
    setNote("Downloaded transcript.");
  };

  const onDownloadMarkdown = (): void => {
    download(currentMarkdown(), `transcript-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.md`, "text/markdown");
    setNote("Downloaded Markdown transcript.");
  };

  const onDownloadHtml = (): void => {
    download(currentHtml(), `transcript-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.html`, "text/html");
    setNote("Downloaded HTML transcript.");
  };

  return (
    <div className="export-row">
      <button type="button" onClick={() => void onCopy()}>
        Copy transcript
      </button>
      <button type="button" onClick={onDownload}>
        Download .txt
      </button>
      <button type="button" onClick={onDownloadMarkdown}>
        Download .md
      </button>
      <button type="button" onClick={onDownloadHtml}>
        Download .html
      </button>
      <span className="export-note" role="status">
        {note}
      </span>
    </div>
  );
}
