/** What a result pane is showing, decided once from the ROOT value (never per leaf). */
export type DetectedResult =
  | { format: "json"; data: unknown }
  | { format: "xml" | "html" | "markdown" | "text"; text: string };

/** Above this many characters html/markdown are shown as source only, never rendered. */
export const RESULT_RENDER_MAX_CHARS = 262144;

const MD_HEADING = /^#{1,6}\s+\S/;
const MD_FENCE = /^```/;
const MD_LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+\S/;
const MD_LINK = /\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/;

export function detectResultFormat(value: unknown): DetectedResult {
  if (value === undefined) return { format: "text", text: "" };
  if (typeof value !== "string") return { format: "json", data: value };
  const t = value.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(t);
      if (parsed !== null && typeof parsed === "object") return { format: "json", data: parsed };
    } catch {
      // not JSON — fall through to the text sniffers
    }
  }
  if (/^<!doctype html/i.test(t) || /^<html[\s>]/i.test(t)) return { format: "html", text: value };
  if (t.startsWith("<") && t.endsWith(">")) return { format: "xml", text: value };
  const lines = t.split("\n");
  if (
    lines.some((l) => MD_HEADING.test(l) || MD_FENCE.test(l)) ||
    lines.filter((l) => MD_LIST_ITEM.test(l)).length >= 2 ||
    MD_LINK.test(t)
  ) {
    return { format: "markdown", text: value };
  }
  return { format: "text", text: value };
}

/** The exact text the copy button writes: pretty JSON for a tree, else the raw string. */
export function resultCopyText(d: DetectedResult): string {
  return d.format === "json" ? (JSON.stringify(d.data, null, 2) ?? "") : d.text;
}
