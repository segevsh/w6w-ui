import { IconButton } from "./IconButton.tsx";

/** Pencil glyph, colocated per this file — no shared `Icon` component exists
 *  in `@w6w/ui` (deliberate, see `Copyable.tsx:3-6`). The two-path Feather
 *  `edit` glyph, matching `WorkflowFlowEditor.tsx:1656-1657`. */
function PencilGlyph() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

export interface EditButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

/** An `IconButton` bundling the canonical pencil glyph — no `danger` styling. */
export function EditButton(props: EditButtonProps) {
  const { label, onClick, disabled, className, ...rest } = props;
  return (
    <IconButton
      label={label}
      onClick={onClick}
      disabled={disabled}
      className={className}
      data-testid={rest["data-testid"]}
    >
      <PencilGlyph />
    </IconButton>
  );
}
