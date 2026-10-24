/**
 * `@w6w/ui/flow` — the visual workflow editor entrypoint.
 *
 * Separated from the base `@w6w/ui` module so consumers who don't use the
 * flow editor don't pull in @xyflow/react. Import like this:
 *
 * ```ts
 * import { WorkflowFlowEditor } from "@w6w/ui/flow";
 * import "@w6w/ui/styles.css";
 * ```
 *
 * `@w6w/ui/styles.css` already carries React Flow's base stylesheet (it is
 * compiled in from `@xyflow/react/dist/style`), so no second import is needed.
 */
export { WorkflowFlowEditor } from "./WorkflowFlowEditor.tsx";
export type { WorkflowFlowEditorProps } from "./WorkflowFlowEditor.tsx";

export { ExpressionOptionsProvider } from "./components/ExpressionOptions.tsx";
export type { ExpressionOptions } from "./components/ExpressionOptions.tsx";

export type { FlowEdge, FlowStep, FlowWorkflow, InternalNodeDef } from "./flow-types.ts";
export {
  CALL_APP,
  CONTROL_APP,
  DATA_APP,
  INTERNAL_NODES,
  internalNodeDefaults,
  internalNodeIcon,
  internalNodeLabel,
  internalNodeParams,
  isControlApp,
  isInternalApp,
  isTriggerApp,
  SCHEDULER_APP,
  SCRIPT_APP,
  TRIGGER_APP,
  WEBHOOK_APP,
} from "./flow-types.ts";
export {
  asFieldDefs,
  coerceDefault,
  fieldWidget,
  fieldsToParams,
  seedValues,
} from "./trigger-fields.ts";
export type { TriggerFieldDef } from "./trigger-fields.ts";

export { flowToWorkflow, workflowToFlow } from "./flow-utils.ts";
export type { StepNode, StepNodeData } from "./flow-utils.ts";
export type { StepProblem, StepProblems } from "./step-problems.ts";

export { CanvasLayer } from "./CanvasLayer.tsx";
export type { CanvasLayerProps } from "./CanvasLayer.tsx";
export { Markdown } from "./Markdown.tsx";
export type { MarkdownProps } from "./Markdown.tsx";
export { MAX_NOTE_BYTES, MAX_NOTES, MAX_SECTIONS } from "./canvas-types.ts";
export type { CanvasNote, CanvasSection, FlowCanvas } from "./canvas-types.ts";
export {
  assignMembership,
  clampCanvas,
  pruneSectionMembers,
  renameSectionMember,
  roundGeometry,
  sectionsContaining,
  withCanvasGeometry,
} from "./canvas-utils.ts";
export type { LiveGeometry } from "./canvas-utils.ts";
