import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Full-row flyout anchored inside the nearest dialog’s top layer. */
export function AnchoredFlyout({
  anchorRef,
  onClose,
  children,
}: {
  // Anchored to the ROW (both App and Connection buttons together), not the
  // individual trigger button — two reasons, both from the same feedback
  // pass (2026-08-30): a flyout anchored to whichever button sits at the
  // row's right edge (Connection) could overflow past the modal's own right
  // border ("fix anchor"), and the app picker specifically was asked to
  // "take up the entire horizontal width of the content... extend to the
  // end of the prod button". Anchoring both to the row's own bounding box
  // solves both at once: the flyout's width always matches content already
  // known to fit inside the modal, and it never hangs off either edge.
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    setContainer(el.closest("dialog") ?? document.body);
  }, [anchorRef]);

  useEffect(() => {
    function onDocPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (popRef.current?.contains(target)) return;
      // A click ON the anchor is the trigger's own toggle — never close here
      // AND reopen there in the same gesture.
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, anchorRef]);

  if (!pos || !container) return null;
  return createPortal(
    <div
      ref={popRef}
      className="w6w-flyout"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      {children}
    </div>,
    container,
  );
}
