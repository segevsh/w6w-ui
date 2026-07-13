/**
 * Context that supplies the var/secret PICKER data to every `ExpressionInput`
 * under it (task 3.2). The editor tree is deep — a step's params render several
 * layers below the editor root (`WorkflowFlowEditor → StepEditModal/StepBuilder
 * → ParamsForm → ParamField → ExpressionInput`), so threading names as props
 * through each layer would be noisy. A context keeps the wiring at the two ends:
 * the editor provides the names once, the input consumes them where it renders.
 *
 * The data pattern stays intact — ui components remain pure (they never fetch);
 * the host (studio) fetches `/vars` + `/vault` and hands the NAMES in via the
 * editor's `exprOptions` prop, which feeds this provider. Only names/refs ever
 * cross this boundary — secret plaintext never reaches the client.
 */
import { type ReactNode, createContext, useContext } from "react";

/** Known variable/secret names offered in an ExpressionInput's insert menu. */
export interface ExpressionOptions {
  vars?: string[];
  secrets?: string[];
}

const ExpressionOptionsCtx = createContext<ExpressionOptions>({});

export interface ExpressionOptionsProviderProps {
  value: ExpressionOptions;
  children: ReactNode;
}

/** Provide the var/secret names offered to every `ExpressionInput` below. */
export function ExpressionOptionsProvider({ value, children }: ExpressionOptionsProviderProps) {
  return <ExpressionOptionsCtx.Provider value={value}>{children}</ExpressionOptionsCtx.Provider>;
}

/**
 * The var/secret names in scope. Empty by default so a standalone
 * `ExpressionInput` (no provider) still works — authors just type names by hand.
 */
export function useExpressionOptions(): ExpressionOptions {
  return useContext(ExpressionOptionsCtx);
}
