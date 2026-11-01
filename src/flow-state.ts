// Pure "Write to state" decisions for the step settings control (`Node.state`,
// core/rfcs/workflow.md). JSX-free. Path, key and limit rules live in `@w6w/expr`
// (`validateStateConfig`, `effectiveStateConfig`) — never re-implemented here.
import { type StateWriteConfig, effectiveStateConfig } from "@w6w/expr";
import { type FlowStep, isControlApp } from "./flow-types.ts";

export type StateMode = StateWriteConfig["mode"];

/** The five modes, in the order the control lists them. */
export const STATE_MODES: readonly StateMode[] = ["off", "root", "key", "pick", "append"];

export const STATE_MODE_LABELS: Record<StateMode, string> = {
  off: "Off",
  root: "Merge at root",
  key: "Under a key",
  pick: "Pick fields",
  append: "Append",
};

type StepLike = Pick<FlowStep, "id" | "uses" | "state">;

/** What the step writes, the default applied (R14: Set data merges at root, every other step is Off). */
export function stateWriteFor(step: StepLike): StateWriteConfig {
  return effectiveStateConfig(step.uses.app, step.uses.action, step.state);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The step with `config` as its state write. The default is the key's ABSENCE
 * (Off on an ordinary step, Merge at root on Set data), so writing the default
 * removes `state`. Never mutates; every other key passes through.
 */
export function setStateWrite<S extends StepLike>(step: S, config: StateWriteConfig): S {
  const { state: _drop, ...rest } = step;
  const fallback = effectiveStateConfig(step.uses.app, step.uses.action, undefined);
  return (deepEqual(config, fallback) ? rest : { ...rest, state: config }) as S;
}

/** The config written when the author picks `mode`: named after the step so it is valid at once. */
export function seedStateWrite(step: Pick<FlowStep, "id">, mode: StateMode): StateWriteConfig {
  switch (mode) {
    case "key":
      return { mode: "key", key: step.id };
    case "pick":
      return { mode: "pick", map: [{ from: "", to: step.id }] };
    case "append":
      return { mode: "append", path: step.id };
    case "root":
      return { mode: "root" };
    default:
      return { mode: "off" };
  }
}

/** The control shows for app steps and triggers; every control-flow step (If, For each, Parallel, Race) hides it. */
export function stateWriteVisible(step: Pick<FlowStep, "uses">): boolean {
  return !isControlApp(step.uses.app);
}
