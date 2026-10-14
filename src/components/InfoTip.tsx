import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { IconButton } from "./IconButton.tsx";

export interface InfoTipProps {
  /** Accessible name AND tooltip of the toggle button (e.g. "About client secrets"). */
  label: string;
  /** The explanation, rendered only while expanded. */
  children: ReactNode;
  className?: string;
}

/**
 * A small "i" button that reveals a muted explanation block on click — for
 * copy that would otherwise clutter a modal. Collapsed by default; the button
 * carries `aria-expanded` and `aria-controls` pointing at the block, and the
 * block is not rendered at all while collapsed.
 */
export function InfoTip({ label, children, className }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  // `IconButton` has no `aria-controls` passthrough (and is outside this
  // change's footprint), so wire the relationship on the rendered <button>.
  useEffect(() => {
    btn.current?.setAttribute("aria-controls", id);
  }, [id]);
  return (
    <span className={["w6w-info-tip", className ?? ""].filter(Boolean).join(" ")}>
      <IconButton
        ref={btn}
        label={label}
        icon="info"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <span id={id} className="w6w-info-tip-body w6w-muted w6w-small">
          {children}
        </span>
      )}
    </span>
  );
}
