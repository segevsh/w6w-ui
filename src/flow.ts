/**
 * `@w6w/ui/flow` — the visual workflow editor entrypoint.
 *
 * Separated from the base `@w6w/ui` module so consumers who don't use the
 * flow editor don't pull in @xyflow/react. Import like this:
 *
 * ```ts
 * import { WorkflowFlowEditor } from "@w6w/ui/flow";
 * import "@w6w/ui/styles.css";
 * import "@xyflow/react/dist/style.css";
 * ```
 */
export { WorkflowFlowEditor } from "./WorkflowFlowEditor.tsx";
export type { WorkflowFlowEditorProps } from "./WorkflowFlowEditor.tsx";

export type { FlowEdge, FlowStep, FlowWorkflow, InternalNodeDef } from "./flow-types.ts";
export {
  CONTROL_APP,
  DATA_APP,
  INTERNAL_NODES,
  internalNodeDefaults,
  internalNodeLabel,
  internalNodeParams,
  isControlApp,
  isInternalApp,
  SCRIPT_APP,
  TRIGGER_APP,
} from "./flow-types.ts";

export { flowToWorkflow, workflowToFlow } from "./flow-utils.ts";
export type { StepNode, StepNodeData } from "./flow-utils.ts";
