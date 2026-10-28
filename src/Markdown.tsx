import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";

export interface MarkdownProps {
  content: string;
  className?: string;
}

/** The only link protocols a note may carry. An allowlist — never a blocklist. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Pass a URL through only when its *parsed* protocol is allowlisted; relative,
 * unparseable and every other scheme (javascript:, data:, vbscript:, any casing
 * or whitespace trick the URL parser normalises) collapse to "".
 */
export function safeUrl(url: string): string {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol) ? url : "";
  } catch {
    return "";
  }
}

const DISALLOWED_ELEMENTS = ["img"];

function SafeLink({
  node: _node,
  href,
  children,
  ...rest
}: ComponentProps<"a"> & { node?: unknown }) {
  return (
    <a {...rest} href={href || undefined} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
}

/**
 * A leading `---` YAML block and the Markdown after it. Rendered as Markdown the block would
 * come out as a rule plus a heading; it is metadata, so `Markdown` shows it in a collapsed
 * section instead. Kept as text, not parsed — this package carries no YAML parser.
 */
export function splitFrontmatter(text: string): { frontmatter: string | null; body: string } {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { frontmatter: null, body: text };
  return { frontmatter: m[1], body: text.slice(m[0].length) };
}

/** Collapsed by default: metadata about the document, not part of what it says. */
function Frontmatter({ yaml }: { yaml: string }) {
  return (
    <details className="w6w-md-frontmatter" data-testid="md-frontmatter">
      <summary>Frontmatter</summary>
      <pre>
        <code>{yaml}</code>
      </pre>
    </details>
  );
}

/**
 * Renders imported, attacker-controllable note content. No `rehype-raw`: raw HTML
 * is dropped (`skipHtml`), images are not rendered, and links are protocol-allowlisted.
 * A leading YAML frontmatter block becomes a collapsed section above the body.
 */
export function Markdown({ content, className }: MarkdownProps) {
  const { frontmatter, body } = splitFrontmatter(content);
  return (
    <div className={className}>
      {frontmatter?.trim() && <Frontmatter yaml={frontmatter} />}
      <ReactMarkdown
        skipHtml
        urlTransform={safeUrl}
        disallowedElements={DISALLOWED_ELEMENTS}
        unwrapDisallowed
        components={{ a: SafeLink }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
