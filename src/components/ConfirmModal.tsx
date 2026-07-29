import type { ReactNode } from "react";
import { Modal } from "./Modal.tsx";

export interface ConfirmModalProps {
  title: string;
  message: string;
  /** Fired when the user confirms. The caller clears its pending state via onClose. */
  onConfirm: () => void;
  /** Fired on Cancel, Esc, or outside-click — dismisses without confirming. */
  onClose: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (default true — this dialog gates dangerous actions). */
  destructive?: boolean;
  /** Extra consequence copy under the message (e.g. a warning line) that a string cannot carry. */
  children?: ReactNode;
}

/**
 * A reusable confirmation dialog built on `@w6w/ui`'s <Modal>, so it inherits the
 * same backdrop, Esc-dismiss and outside-click close as every other dialog here.
 * Replaces the browser's native confirmation prompt: Confirm fires `onConfirm`;
 * Cancel/Esc/outside-click fires `onClose` only (no confirmation).
 *
 * Prop API mirrors `packages/studio/src/components/ConfirmModal.tsx` and
 * `packages/admin/src/components/ConfirmModal.tsx` so all three consoles share one
 * vocabulary. Only the class names differ — this one is `w6w-*` namespaced.
 *
 * It owns its own <Modal>, so never render it *inside* another modal's body: ui's
 * Modal is a native <dialog>, so nesting one works mechanically and fails no gate —
 * it just looks wrong. Render it as a **sibling** of the other modal instead.
 *
 * Confirmations are `{pending}` state + a rendered sibling modal, never a blocking
 * call: a caller reachable from a keydown handler cannot swap in a boolean.
 */
export function ConfirmModal({
  title,
  message,
  onConfirm,
  onClose,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  children,
}: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="w6w-muted w6w-small">{message}</p>
      {children}
      <div className="w6w-modal-actions">
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onClose}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={destructive ? "w6w-btn w6w-btn-danger" : "w6w-btn"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
