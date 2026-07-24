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
import type { SecretValue } from "../types.ts";

/** An upstream step whose output this field can reference (`steps.<id>.output`). */
export interface ExpressionStepSource {
  /** Step id — the key under `steps` in the run scope. */
  id: string;
  /** Human label (defaults to the id). */
  label?: string;
}

/** Known variable/secret names offered in an ExpressionInput's insert menu. */
export interface ExpressionOptions {
  vars?: string[];
  secrets?: string[];
  /**
   * Function/run input keys in scope (`inputs.<name>`). Present when the field
   * is edited inside a Function (the engine resolves these from `RunScope.inputs`);
   * omitted for a standalone field.
   */
  inputs?: string[];
  /**
   * Dataset names in scope (`datasets.<name>`). A store-independent affordance:
   * whatever names the host passes are offered as insertable chips. Omitted when
   * no datasets are available.
   */
  datasets?: string[];
  /**
   * The workflow state leading to this step: upstream steps whose output is in
   * scope (`steps.<id>.output`). Present only in a workflow context; omitted for
   * a standalone field.
   */
  steps?: ExpressionStepSource[];
  /** Whether a trigger event is in scope (`trigger.event`). */
  hasTrigger?: boolean;
  /**
   * Seal a typed secret value into an at-rest `SecretValue` envelope via the
   * host (the client has no key). Provided by studio (`POST /vault/seal`); when
   * present, a secret-typed field encrypts on blur so its clear text never
   * lands in the workflow/config JSON. Absent → the value stays a plain string
   * and the server encrypts it on receive instead.
   */
  sealSecret?: (value: string) => Promise<SecretValue>;
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
