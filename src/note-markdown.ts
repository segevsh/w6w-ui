/**
 * The note editor's Markdown round-trip. A note is edited in place as a `contentEditable` block
 * (no textarea); these two functions convert between its stored Markdown and that editable DOM.
 *
 * The editable model is line-based and covers exactly what the note toolbar writes: a heading
 * level per line (`#`…`######`) and `**bold**` runs. Everything else (links, lists, `code`, …) is
 * kept as literal text while editing and rendered by `Markdown` when not, so a line the toolbar
 * never touched round-trips byte-for-byte.
 *
 * The DOM is built with `createElement` + text nodes only — note content is imported,
 * attacker-controllable text and must never reach `innerHTML`.
 */

interface Run {
  text: string;
  bold: boolean;
}
interface Line {
  level: number;
  runs: Run[];
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BOLD = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g;

/** Build the editable DOM for `content` into `root` (its children are replaced). */
export function renderEditable(root: HTMLElement, content: string): void {
  const doc = root.ownerDocument;
  root.replaceChildren();
  for (const raw of content.split("\n")) {
    const m = HEADING.exec(raw);
    const block = doc.createElement(m ? `h${m[1].length}` : "div");
    const text = m ? m[2] : raw;
    let at = 0;
    for (const b of text.matchAll(BOLD)) {
      if (b.index > at) block.append(doc.createTextNode(text.slice(at, b.index)));
      const strong = doc.createElement("strong");
      strong.textContent = b[1];
      block.append(strong);
      at = b.index + b[0].length;
    }
    if (at < text.length) block.append(doc.createTextNode(text.slice(at)));
    if (!block.firstChild) block.append(doc.createElement("br"));
    root.append(block);
  }
}

function weight(el: HTMLElement): boolean | undefined {
  const w = el.style?.fontWeight;
  if (!w) return undefined;
  if (w === "bold" || w === "bolder") return true;
  const n = Number(w);
  return Number.isFinite(n) ? n >= 600 : false;
}

function runText(runs: Run[]): string {
  const merged: Run[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.bold === r.bold) last.text += r.text;
    else merged.push({ ...r });
  }
  return merged
    .map(({ text, bold }) => {
      const core = text.trim();
      if (!bold || !core) return text;
      const lead = text.slice(0, text.indexOf(core));
      const trail = text.slice(lead.length + core.length);
      return `${lead}**${core}**${trail}`;
    })
    .join("");
}

/** Serialize the editable DOM under `root` back to Markdown. */
export function editableToMarkdown(root: HTMLElement): string {
  const lines: Line[] = [];
  let cur: Line | null = null;
  const open = (level: number) => {
    cur = { level, runs: [] };
    lines.push(cur);
    return cur;
  };
  const walk = (node: Node, level: number, bold: boolean) => {
    if (node.nodeType === 3) {
      const t = (node.textContent ?? "").replace(/ /g, " ").replace(/\n/g, "");
      if (t) (cur ?? open(level)).runs.push({ text: t, bold });
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") {
      if (!cur) open(level);
      cur = null;
      return;
    }
    const heading = /^h([1-6])$/.exec(tag);
    const block = heading || ["div", "p", "li", "ul", "ol", "blockquote", "pre"].includes(tag);
    if (block) cur = null;
    const lvl = heading ? Number(heading[1]) : level;
    const b = tag === "b" || tag === "strong" ? true : (weight(el) ?? bold);
    for (const child of el.childNodes) walk(child, lvl, b);
    if (block) cur = null;
  };
  for (const child of root.childNodes) walk(child, 0, false);
  const out = lines.map((l) => {
    const text = runText(l.runs);
    return l.level > 0 ? `${"#".repeat(l.level)} ${text.trimStart()}` : text;
  });
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out.join("\n");
}

/**
 * The content handed to `Markdown` for display. A note is typed line by line, so a single
 * newline must show as a line break — Markdown would fold it into a space. A soft break between
 * two non-empty lines becomes a hard break (two trailing spaces); the stored content is untouched.
 */
export function noteDisplayMarkdown(content: string): string {
  return content.replace(/([^\n])\n(?=[^\n])/g, "$1  \n");
}
