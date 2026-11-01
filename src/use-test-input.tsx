/**
 * The React face of remembered test inputs (`test-inputs.ts`): read the node's
 * last-used input once per (workflow, node), write it on every Run / Test, and
 * the small muted "last used values · Clear" note every collecting surface shows.
 */
import { useCallback, useEffect, useState } from "react";
import { useW6WApi } from "./provider.tsx";
import { findTestInput, rememberableInput } from "./test-inputs.ts";
import type { ActionParam } from "./types.ts";

export interface RememberedTestInput {
  /** `true` once the read settled (or there was nothing to read). */
  loaded: boolean;
  /** `false` when the host has no `loadTestInputs` — fall back to the older source. */
  supported: boolean;
  /** `undefined` = no row; `{}` = cleared; else the values last used. */
  input: Record<string, unknown> | undefined;
  /** Remember `values` (secret literals dropped). Best-effort: never throws. */
  save: (values: Record<string, unknown>, params?: readonly ActionParam[]) => void;
  /** Forget the values (stored as `{}`, so no older source refills the form). */
  clear: () => void;
}

export function useRememberedTestInput(
  workflowId: string | undefined,
  nodeId: string | undefined,
): RememberedTestInput {
  const api = useW6WApi();
  const supported = typeof api.loadTestInputs === "function" && !!workflowId && !!nodeId;
  const [loaded, setLoaded] = useState(!supported);
  const [input, setInput] = useState<Record<string, unknown> | undefined>(undefined);
  useEffect(() => {
    if (!supported || !workflowId || !nodeId || !api.loadTestInputs) {
      setLoaded(true);
      return;
    }
    let canceled = false;
    setLoaded(false);
    api
      .loadTestInputs(workflowId)
      .then((rows) => {
        if (canceled) return;
        setInput(findTestInput(rows, nodeId));
        setLoaded(true);
      })
      // A failed read never blocks the form: no remembered values, older source applies.
      .catch(() => {
        if (!canceled) setLoaded(true);
      });
    return () => {
      canceled = true;
    };
  }, [api, supported, workflowId, nodeId]);

  const write = useCallback(
    (next: Record<string, unknown>) => {
      setInput(next);
      if (!workflowId || !nodeId || typeof api.saveTestInput !== "function") return;
      api.saveTestInput(workflowId, nodeId, next).catch((err) => {
        console.error("test input save failed", err);
      });
    },
    [api, workflowId, nodeId],
  );
  const save = useCallback(
    (values: Record<string, unknown>, params?: readonly ActionParam[]) =>
      write(rememberableInput(values, params)),
    [write],
  );
  const clear = useCallback(() => write({}), [write]);
  return { loaded, supported, input, save, clear };
}

/** The small muted note under a prefilled form: "last used values · Clear". */
export function LastUsedNote({ onClear }: { onClear: () => void }) {
  return (
    <p className="w6w-muted w6w-small" data-testid="last-used-note">
      last used values ·{" "}
      <button type="button" className="w6w-linkbtn" onClick={onClear}>
        Clear
      </button>
    </p>
  );
}
