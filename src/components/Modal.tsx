import { type ReactNode, useEffect, useRef } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * Dialog width. `"wide"` fits a sidebar + content layout; `"xl"` is a large
   * work surface (e.g. the app picker) that should feel roomy, not cramped.
   */
  size?: "default" | "wide" | "xl";
  /** Optional node rendered next to the title (e.g. an app icon). */
  titleIcon?: ReactNode;
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

export function Modal({ title, onClose, children, size = "default", titleIcon }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.open) el.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <div className="w6w-modal-backdrop">
      <button
        type="button"
        className="w6w-modal-dismiss-overlay"
        aria-label="Close modal"
        onClick={onClose}
      />
      <dialog ref={ref} className={`w6w-modal${SIZE_CLASS[size]}`} aria-label={title}>
        <h3 className="w6w-modal-title">
          {titleIcon}
          <span>{title}</span>
        </h3>
        {children}
      </dialog>
    </div>
  );
}
