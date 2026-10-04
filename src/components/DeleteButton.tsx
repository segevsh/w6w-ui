import { IconButton } from "./IconButton.tsx";

export interface DeleteButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * An `IconButton` bundling the canonical trash glyph — `icons.tsx`'s `delete`,
 * the fuller 4-shape Feather `trash-2` — always `danger`-styled.
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
      icon="delete"
      data-testid={rest["data-testid"]}
    />
  );
}
