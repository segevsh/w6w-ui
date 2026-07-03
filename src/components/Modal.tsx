import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Small dialog modal. Built on the native `<dialog>` element so it gets focus
 * trapping, Esc-dismiss, and accessibility semantics for free. A button
 * positioned over the backdrop catches outside-clicks to close.
 */
export function Modal({ title, onClose, children }: ModalProps) {
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
      <dialog ref={ref} className="w6w-modal" aria-label={title}>
        <h3>{title}</h3>
        {children}
      </dialog>
    </div>
  );
}
