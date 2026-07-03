/**
 * @w6w/ui — public entry point.
 *
 * Import the stylesheet separately:
 *   import "@w6w/ui/styles.css";
 */

export { AddConnectionModal } from "./AddConnectionModal.tsx";
export type { AddConnectionModalProps } from "./AddConnectionModal.tsx";

export { Modal } from "./components/Modal.tsx";
export { AppIcon } from "./components/AppIcon.tsx";
export { AuthFieldsForm } from "./components/AuthFieldsForm.tsx";

export { startOAuthPopup } from "./oauth-popup.ts";
export type { OAuthPopupResult } from "./oauth-popup.ts";

export type {
  AppSummary,
  AuthDef,
  AuthField,
  ConnectionSummary,
  ThemeMode,
} from "./types.ts";
