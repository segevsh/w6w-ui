import { IconButton } from "./IconButton.tsx";

/** Trash glyph, colocated per this file — no shared `Icon` component exists
 *  in `@w6w/ui` (deliberate, see `Copyable.tsx:3-6`). The fuller 4-shape
 *  Feather `trash-2` glyph, matching `AppsPage.tsx:84-92`. */
function TrashGlyph() {
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
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export interface DeleteButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * An `IconButton` bundling the canonical trash glyph, always `danger`-styled.
 *
 * Presentational only (HITL-1, binding): takes a plain `onClick`, never an
 * `onConfirm`, and never imports any confirm-dialog component — the call
 * site owns whether and which one gates the click.
 */
export function DeleteButton(props: DeleteButtonProps) {
  const { label, onClick, disabled, className, ...rest } = props;
  return (
    <IconButton
      label={label}
      onClick={onClick}
      disabled={disabled}
      className={className}
      danger
      data-testid={rest["data-testid"]}
    >
      <TrashGlyph />
    </IconButton>
  );
}
