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

export { AppPicker } from "./AppPicker.tsx";
export type { AppPickerProps } from "./AppPicker.tsx";

export { StepBuilderModal } from "./StepBuilderModal.tsx";
export type { BuiltStep, StepBuilderModalProps } from "./StepBuilderModal.tsx";

export { ParamsForm } from "./ParamsForm.tsx";
export type { DataVar, ParamsFormProps } from "./ParamsForm.tsx";

export { ActionTestForm } from "./ActionTestForm.tsx";
export type { ActionTestFormProps } from "./ActionTestForm.tsx";

export { JsonEditor } from "./JsonEditor.tsx";
export type { JsonEditorProps } from "./JsonEditor.tsx";

export { CodeEditor } from "./CodeEditor.tsx";
export type { CodeEditorProps } from "./CodeEditor.tsx";

export { Modal } from "./components/Modal.tsx";
export { AppIcon } from "./components/AppIcon.tsx";
export { AuthFieldsForm } from "./components/AuthFieldsForm.tsx";

export { ExpressionInput } from "./components/ExpressionInput.tsx";
export type { ExpressionInputProps } from "./components/ExpressionInput.tsx";

export {
  ExpressionOptionsProvider,
  useExpressionOptions,
} from "./components/ExpressionOptions.tsx";
export type {
  ExpressionOptions,
  ExpressionOptionsProviderProps,
} from "./components/ExpressionOptions.tsx";

export { startOAuthPopup } from "./oauth-popup.ts";
export type { OAuthPopupResult } from "./oauth-popup.ts";

export type {
  ActionDef,
  ActionParam,
  AppSummary,
  AuthDef,
  AuthField,
  ConnectionSummary,
  ExprPart,
  ExprPartKind,
  ExprValue,
  SecretValue,
  ThemeMode,
} from "./types.ts";
export { isExprValue, isSecretValue } from "./types.ts";
