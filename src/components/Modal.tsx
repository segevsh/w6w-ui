import { type ReactNode, useEffect, useRef } from "react";

interface ModalProps {
  /** Title row content. A plain string also seeds the dialog's `aria-label`. */
  title: ReactNode;
  /** Accessible name for the dialog; defaults to `title` when it's a string. */
  ariaLabel?: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * Dialog width. `"wide"` fits a sidebar + content layout; `"xl"` is a large
   * work surface (e.g. the app picker) that should feel roomy, not cramped.
   */
  size?: "default" | "wide" | "xl";
  /** Optional node rendered next to the title (e.g. an app icon). */
  titleIcon?: ReactNode;
  /** Optional muted meta rendered after the title (e.g. an app's id + version). */
  subtitle?: ReactNode;
  /** Optional node rendered at the far right of the title row (e.g. a back button). */
  headerRight?: ReactNode;
}

/**
 * Small dialog modal. Built on the native `<dialog>` element so it gets focus
 * trapping, Esc-dismiss, and accessibility semantics for free. A button
 * positioned over the backdrop catches outside-clicks to close.
 */
const SIZE_CLASS: Record<NonNullable<ModalProps["size"]>, string> = {
  default: "",
  wide: " w6w-modal-wide",
  xl: " w6w-modal-xl",
};

export function Modal({
  title,
  ariaLabel,
  onClose,
  children,
  size = "default",
  titleIcon,
  subtitle,
  headerRight,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.open) el.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    // A `showModal()` dialog and its ::backdrop live in the browser's top layer,
    // above any sibling overlay — so an overlay button can't catch outside
    // clicks. Backdrop clicks are dispatched with the dialog as target, so
    // treat a click landing outside the dialog's box as a dismiss.
    const onClick = (e: MouseEvent) => {
      if (e.target !== el) return;
      const r = el.getBoundingClientRect();
      const outside =
        e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (outside) onClose();
    };
    el.addEventListener("cancel", onCancel);
    el.addEventListener("click", onClick);
    return () => {
      el.removeEventListener("cancel", onCancel);
      el.removeEventListener("click", onClick);
    };
  }, [onClose]);

  return (
    <div className="w6w-modal-backdrop">
      <dialog
        ref={ref}
        className={`w6w-modal${SIZE_CLASS[size]}`}
        aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
      >
        <div className="w6w-modal-header">
          <h3 className="w6w-modal-title">
            {titleIcon}
            <span>{title}</span>
            {subtitle && <span className="w6w-modal-subtitle">{subtitle}</span>}
          </h3>
          {headerRight}
        </div>
        {children}
      </dialog>
    </div>
  );
}
