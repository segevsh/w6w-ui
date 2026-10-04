import { IconButton } from "./IconButton.tsx";

export interface EditButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

/** An `IconButton` bundling the canonical pencil glyph — `icons.tsx`'s `edit`,
 *  the two-path Feather pencil — with no `danger` styling. */
export function EditButton(props: EditButtonProps) {
  const { label, onClick, disabled, className, ...rest } = props;
  return (
    <IconButton
      label={label}
      onClick={onClick}
      disabled={disabled}
      className={className}
      icon="edit"
      data-testid={rest["data-testid"]}
    />
  );
}
