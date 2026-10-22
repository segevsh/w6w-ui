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
 * Renders imported, attacker-controllable note content. No `rehype-raw`: raw HTML
 * is dropped (`skipHtml`), images are not rendered, and links are protocol-allowlisted.
 */
export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        skipHtml
        urlTransform={safeUrl}
        disallowedElements={DISALLOWED_ELEMENTS}
        unwrapDisallowed
        components={{ a: SafeLink }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
