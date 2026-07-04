/**
 * @w6w/ui — public entry point.
 *
 * Import the stylesheet separately:
 *   import "@w6w/ui/styles.css";
 */

export { W6wUIProvider, useW6wApi } from "./provider.tsx";
export type { W6wApi, W6wUIProviderProps } from "./provider.tsx";

export { createW6wApi, ApiError } from "./createW6wApi.ts";
export type { CreateW6wApiOptions } from "./createW6wApi.ts";

export { AddConnectionModal } from "./AddConnectionModal.tsx";
export type { AddConnectionModalProps } from "./AddConnectionModal.tsx";

export { JsonEditor } from "./JsonEditor.tsx";
export type { JsonEditorProps } from "./JsonEditor.tsx";

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
