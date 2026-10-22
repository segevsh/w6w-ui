export interface MarkdownProps {
  content: string;
  className?: string;
}

/** Skeleton: plain-text fallback; sanitized react-markdown lands in a later slice. */
export function Markdown({ content, className }: MarkdownProps) {
  return <div className={className}>{content}</div>;
}
