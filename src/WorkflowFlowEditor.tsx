import {
  Background,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  type NodeProps,
  NodeToolbar,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import type { FinalConnectionState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Handle } from "@xyflow/react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { JsonEditor } from "./JsonEditor.tsx";
import { NodeConfigForm } from "./NodeConfigForm.tsx";
import { ParamsForm } from "./ParamsForm.tsx";
import {
  type BuiltStep,
  type ConfigView,
  ConfigViewToggle,
  StepBuilderModal,
  StepTestRun,
  requiredParamsFilled,
} from "./StepBuilderModal.tsx";
import { AppIcon } from "./components/AppIcon.tsx";
import {
  type ExpressionOptions,
  ExpressionOptionsProvider,
  type ExpressionStepSource,
} from "./components/ExpressionOptions.tsx";
import { InternalIcon } from "./components/InternalIcon.tsx";
import { Modal } from "./components/Modal.tsx";
import {
  type FlowStep,
  type FlowWorkflow,
  internalNodeDef,
  internalNodeIcon,
  internalNodeLabel,
  internalNodeParams,
  isControlApp,
  isInternalApp,
  nodePorts,
} from "./flow-types.ts";
import { type StepNode, flowToWorkflow, suggestStepId, workflowToFlow } from "./flow-utils.ts";
import { useW6wApi } from "./provider.tsx";
import type { ActionDef, ActionParam, AppSummary, ConnectionSummary } from "./types.ts";

/**
 * The hard rules for an edge `source → target` — the ones no amount of
 * replacement can satisfy: a real, *distinct* pair (no self-loops), no duplicate
 * edge, the target accepts an entry port (blocks connecting *into* a trigger,
 * which declares `in: 0`), and the source has an exit port. Port **capacity** is
 * deliberately NOT checked here: a full single-slot port is freed by replacement
 * (see `applyConnect`), so dragging a new wire from an already-connected node
 * re-points it rather than being rejected. Used as the live `isValidConnection`.
 */
function canConnect(
  source: string | null | undefined,
  target: string | null | undefined,
  nodes: StepNode[],
  edges: Edge[],
): boolean {
  if (!source || !target || source === target) return false;
  if (edges.some((e) => e.source === source && e.target === target)) return false;
  const srcStep = nodes.find((n) => n.id === source)?.data.step;
  const tgtStep = nodes.find((n) => n.id === target)?.data.step;
  if (!srcStep || !tgtStep) return false;
  const srcPorts = nodePorts(srcStep.uses.app, srcStep.uses.action);
  const tgtPorts = nodePorts(tgtStep.uses.app, tgtStep.uses.action);
  return srcPorts.out >= 1 && tgtPorts.in >= 1;
}

/**
 * Build the next edge set for a new `source → target` connection, **replacing**
 * whatever already occupied the source's exit or the target's entry so
 * single-slot ports stay at exactly one connection. Drops the oldest conflicting
 * edge(s) to make room, then appends the new one. Returns `null` when the
 * connection is disallowed by {@link canConnect}.
 */
function applyConnect(
  source: string | null | undefined,
  target: string | null | undefined,
  nodes: StepNode[],
  edges: Edge[],
): Edge[] | null {
  if (!canConnect(source, target, nodes, edges) || !source || !target) return null;
  const srcStep = nodes.find((n) => n.id === source)?.data.step;
  const tgtStep = nodes.find((n) => n.id === target)?.data.step;
  if (!srcStep || !tgtStep) return null;
  const srcPorts = nodePorts(srcStep.uses.app, srcStep.uses.action);
  const tgtPorts = nodePorts(tgtStep.uses.app, tgtStep.uses.action);
  let next = edges;
  // Free the source's exit port: drop the oldest same-source edges so adding one
  // more stays within out-capacity (for the current 1-out model, replaces it).
  const fromSrc = next.filter((e) => e.source === source);
  if (fromSrc.length >= srcPorts.out) {
    const drop = new Set(fromSrc.slice(0, fromSrc.length - srcPorts.out + 1).map((e) => e.id));
    next = next.filter((e) => !drop.has(e.id));
  }
  // Free the target's entry port likewise.
  const toTgt = next.filter((e) => e.target === target);
  if (toTgt.length >= tgtPorts.in) {
    const drop = new Set(toTgt.slice(0, toTgt.length - tgtPorts.in + 1).map((e) => e.id));
    next = next.filter((e) => !drop.has(e.id));
  }
  return addEdge({ source, target, id: `${source}->${target}` }, next);
}

/**
 * The workflow state a given step can reference: the outputs of every step that
 * runs before it (its graph ancestors) plus whether a trigger precedes it. A
 * trigger ancestor becomes `hasTrigger` (referenced as `trigger.event`), not a
 * `steps.<id>.output` source. With no specific step (shouldn't happen for a
 * field edit) every node is offered.
 */
function upstreamStateSources(
  editingId: string | null,
  nodes: StepNode[],
  edges: Edge[],
): { steps: ExpressionStepSource[]; hasTrigger: boolean } {
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    const arr = parents.get(e.target) ?? [];
    arr.push(e.source);
    parents.set(e.target, arr);
  }
  const ancestors = new Set<string>();
  if (editingId) {
    const stack = [editingId];
    while (stack.length) {
      const id = stack.pop() as string;
      for (const p of parents.get(id) ?? []) {
        if (!ancestors.has(p)) {
          ancestors.add(p);
          stack.push(p);
        }
      }
    }
  } else {
    for (const n of nodes) ancestors.add(n.id);
  }

  const steps: ExpressionStepSource[] = [];
  let hasTrigger = false;
  for (const n of nodes) {
    if (!ancestors.has(n.id)) continue;
    const step = n.data.step;
    if (internalNodeDef(step.uses.app, step.uses.action)?.group === "trigger") {
      hasTrigger = true;
      continue;
    }
    steps.push({ id: step.id, label: step.id });
  }
  return { steps, hasTrigger };
}

export interface WorkflowFlowEditorProps {
  /** The workflow being edited. The editor re-derives layout when this changes identity. */
  value: FlowWorkflow;
  /** Fired whenever the user changes the graph — new nodes, edges, or step edits. */
  onChange: (next: FlowWorkflow) => void;
  /** Disable all interactions — pans/zooms are still enabled. */
  readOnly?: boolean;
  /** Height of the editor viewport. Defaults to 480px. */
  height?: string | number;
  /**
   * Registered apps, used to render each action node with its owning app's icon,
   * display name, and version. A step only carries `uses.app` (an id), so the
   * card joins that id against this list. Optional — unknown/absent apps degrade
   * to an initials tile with no version. Metadata is looked up at render time and
   * never stored on nodes, so it can't corrupt round-tripping back to a workflow.
   */
  apps?: AppSummary[];
  /**
   * Names offered by each step field's expression picker (task 3.2): the
   * project's variable + secret names. Fed to every `ExpressionInput` in the
   * editor via context. Names only — secret plaintext never reaches the client.
   * The host (studio) fetches `/vars` + `/vault` and passes the names here.
   */
  exprOptions?: ExpressionOptions;
}

/**
 * App metadata by id, shared with the node cards so `StepNodeCard` can show the
 * app's icon/name/version without threading it through each node's `data`.
 */
const AppsCtx = createContext<Map<string, AppSummary>>(new Map());

/** Which view the step edit modal opens in: the tabbed form, raw JSON, or node settings. */
type EditView = "props" | "json" | "settings";

/** Per-node control handlers, provided to the node cards via context. */
interface StepControls {
  /** Open the edit modal on the form view. */
  onEdit: (id: string) => void;
  /** Open the edit modal straight on the JSON view. */
  onEditJson: (id: string) => void;
  /** Test-run a single step and show its result. */
  onRun: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
}
const StepControlsCtx = createContext<StepControls | null>(null);

/**
 * Visual workflow editor. Renders a Workflow's DAG as a React Flow graph:
 *
 *   - Auto-layouted on load (topological columns + sibling rows).
 *   - Nodes render differently for action steps vs. control steps
 *     (`uses.app === "@w6w/control"`).
 *   - `+ Step` opens a guided builder (pick app → connection → action → params,
 *     or a flow control). Drag nodes to reposition; connect handles to add edges.
 *   - Selecting a node reveals a toolbar above it: Edit / Duplicate / Delete.
 *   - Edit opens a modal with a Form ⇄ JSON toggle for that step.
 *   - Every meaningful change fires `onChange` with an updated Workflow.
 */
export function WorkflowFlowEditor(props: WorkflowFlowEditorProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

/** Live state of a single-step test run, shown in a modal. */
interface StepRunState {
  stepId: string;
  status: "running" | "done" | "error";
  value?: unknown;
  error?: string;
  errorCode?: string;
  /** console.* output captured from a script node run, if any. */
  logs?: string[];
}

function Inner({
  value,
  onChange,
  readOnly,
  height = 480,
  apps,
  exprOptions,
}: WorkflowFlowEditorProps) {
  const api = useW6wApi();
  const appsById = useMemo(() => new Map((apps ?? []).map((a) => [a.id, a])), [apps]);
  const [runResult, setRunResult] = useState<StepRunState | null>(null);
  // Re-hydrate nodes+edges only when the workflow id changes identity. Local
  // edits (drag, connect, delete) go through the useNodesState / useEdgesState
  // handles so React Flow's own state stays authoritative during interaction.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-derive layout only on workflow identity change
  const initial = useMemo(() => workflowToFlow(value), [value.id]);
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editView, setEditView] = useState<EditView>("props");
  // When a connection drag is released on empty canvas, we open the builder to
  // create a new node and auto-wire it to the handle it was dragged from.
  const [pendingConnect, setPendingConnect] = useState<{
    nodeId: string;
    handleType: "source" | "target";
    position: { x: number; y: number };
  } | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  // If the caller swaps in a different workflow, reset local graph state.
  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
    setSelectedId(null);
    setEditingId(null);
  }, [initial, setNodes, setEdges]);

  const emitChange = useCallback(
    (nextNodes: StepNode[], nextEdges: Edge[]) => {
      onChange(flowToWorkflow(value, nextNodes, nextEdges));
    },
    [value, onChange],
  );

  // Live gate while dragging a connection — React Flow marks the drop invalid
  // (and won't fire onConnect) when this returns false.
  const isValidConnection = useCallback(
    (c: Connection | Edge) => canConnect(c.source, c.target, nodes, edges),
    [nodes, edges],
  );

  const onConnect = useCallback(
    (params: Parameters<typeof addEdge>[0]) => {
      if (readOnly) return;
      // applyConnect replaces a full single-slot port rather than ignoring the drop.
      const next = applyConnect(params.source, params.target, nodes, edges);
      if (!next) return;
      setEdges(next);
      emitChange(nodes, next);
    },
    [edges, nodes, setEdges, emitChange, readOnly],
  );

  // A connection dropped on empty canvas (no valid target) means "add a new node
  // here and connect to it" — open the builder and remember where it came from.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (readOnly) return;
      // A valid drop onto a handle is already handled by onConnect.
      if (connectionState.isValid) return;
      const fromNode = connectionState.fromNode;
      if (!fromNode) return;
      const handleType = connectionState.fromHandle?.type === "target" ? "target" : "source";
      // Only spawn if the origin handle can participate at all — a source handle
      // needs an exit port, a target handle an entry port. (A full single-slot
      // port is fine: the auto-wire below replaces its existing edge.)
      const originStep = nodes.find((n) => n.id === fromNode.id)?.data.step;
      if (originStep) {
        const p = nodePorts(originStep.uses.app, originStep.uses.action);
        if ((handleType === "source" ? p.out : p.in) < 1) return;
      }
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      const position = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      setPendingConnect({ nodeId: fromNode.id, handleType, position });
      setBuilderOpen(true);
    },
    [readOnly, screenToFlowPosition, nodes],
  );

  const deleteStep = useCallback(
    (id: string) => {
      if (readOnly) return;
      if (!window.confirm(`Delete step "${id}"?`)) return;
      const nextNodes = nodes.filter((n) => n.id !== id);
      const nextEdges = edges.filter((e) => e.source !== id && e.target !== id);
      setNodes(nextNodes);
      setEdges(nextEdges);
      if (selectedId === id) setSelectedId(null);
      if (editingId === id) setEditingId(null);
      emitChange(nextNodes, nextEdges);
    },
    [nodes, edges, setNodes, setEdges, emitChange, readOnly, selectedId, editingId],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      if (readOnly) return;
      const nextEdges = edges.filter((e) => e.id !== id);
      if (nextEdges.length === edges.length) return;
      setEdges(nextEdges);
      if (selectedEdgeId === id) setSelectedEdgeId(null);
      emitChange(nodes, nextEdges);
    },
    [nodes, edges, setEdges, emitChange, readOnly, selectedEdgeId],
  );

  const duplicateStep = useCallback(
    (id: string) => {
      if (readOnly) return;
      const src = nodes.find((n) => n.id === id);
      if (!src) return;
      const newId = suggestStepId(
        nodes.map((n) => n.id),
        `${src.data.step.id}_copy`,
      );
      const cloned: FlowStep = { ...structuredClone(src.data.step), id: newId };
      const newNode: StepNode = {
        id: newId,
        type: src.type,
        position: { x: src.position.x + 40, y: src.position.y + 60 },
        data: { step: cloned, isInternal: src.data.isInternal },
      };
      const nextNodes = [...nodes, newNode];
      setNodes(nextNodes);
      setSelectedId(newId);
      emitChange(nextNodes, edges);
    },
    [nodes, edges, setNodes, emitChange, readOnly],
  );

  const addBuiltStep = useCallback(
    (built: BuiltStep) => {
      if (readOnly) return;
      const isInternal = isInternalApp(built.uses.app);
      const id = suggestStepId(
        nodes.map((n) => n.id),
        isInternal ? "gate" : "step",
      );
      const step: FlowStep = {
        id,
        uses: built.uses,
        ...(built.with && Object.keys(built.with).length > 0 ? { with: built.with } : {}),
      };
      const newNode: StepNode = {
        id,
        type: isInternal ? "control" : "step",
        // Drop point when spawned from a dragged connection; else a light cascade.
        position: pendingConnect?.position ?? { x: 80, y: 80 + nodes.length * 24 },
        data: { step, isInternal },
      };
      const nextNodes = [...nodes, newNode];

      // Auto-wire the edge back to the handle the drag started from. Dragging a
      // source handle points the edge at the new node; a target handle reverses it.
      // Gated + replacing per the port rules (applyConnect) against the new node.
      let nextEdges = edges;
      if (pendingConnect) {
        const [source, target] =
          pendingConnect.handleType === "target"
            ? [id, pendingConnect.nodeId]
            : [pendingConnect.nodeId, id];
        nextEdges = applyConnect(source, target, nextNodes, edges) ?? edges;
      }

      setNodes(nextNodes);
      if (nextEdges !== edges) setEdges(nextEdges);
      setSelectedId(id);
      setBuilderOpen(false);
      setPendingConnect(null);
      emitChange(nextNodes, nextEdges);
    },
    [nodes, edges, setNodes, setEdges, emitChange, readOnly, pendingConnect],
  );

  // Apply an edit to a step, rewiring edges if its id changed.
  const updateStep = useCallback(
    (prevId: string, next: FlowStep) => {
      const idChanged = next.id !== prevId;
      if (idChanged && nodes.some((n) => n.id === next.id)) return; // reject dup id
      const nextNodes = nodes.map((n) =>
        n.id === prevId
          ? {
              ...n,
              id: next.id,
              data: { step: next, isInternal: isInternalApp(next.uses.app) },
            }
          : n,
      );
      if (idChanged) {
        const nextEdges = edges.map((e) => {
          const source = e.source === prevId ? next.id : e.source;
          const target = e.target === prevId ? next.id : e.target;
          return { ...e, source, target, id: `${source}->${target}` };
        });
        setNodes(nextNodes);
        setEdges(nextEdges);
        if (selectedId === prevId) setSelectedId(next.id);
        if (editingId === prevId) setEditingId(next.id);
        emitChange(nextNodes, nextEdges);
        return;
      }
      setNodes(nextNodes);
      emitChange(nextNodes, edges);
    },
    [nodes, edges, setNodes, setEdges, selectedId, editingId, emitChange],
  );

  // Test-run one step through the invoke API, using its own `with` params and
  // (for action steps) its stored connection. Control steps aren't invocable.
  const runStep = useCallback(
    async (id: string) => {
      const node = nodes.find((n) => n.id === id);
      // Flow-control nodes can't run standalone; app + compute/trigger nodes can.
      if (!node || isControlApp(node.data.step.uses.app)) return;
      const step = node.data.step;
      setRunResult({ stepId: id, status: "running" });
      try {
        const result = await api.invokeAction(
          step.uses.app,
          step.uses.action,
          step.with ?? {},
          step.uses.connection ? { connectionId: step.uses.connection } : {},
        );
        // Script nodes may return captured console output alongside the value.
        const logs = (result as { logs?: string[] }).logs;
        setRunResult({ stepId: id, status: "done", value: result.value, logs });
      } catch (e) {
        // The api client wraps network/parse failures with context; duck-type the
        // code so the modal can show it next to the message.
        const err = e as { message?: string; code?: string };
        setRunResult({
          stepId: id,
          status: "error",
          error: err.message ?? String(e),
          errorCode: err.code,
        });
      }
    },
    [nodes, api],
  );

  const controls = useMemo<StepControls>(
    () => ({
      onEdit: (id) => {
        setEditView("props");
        setEditingId(id);
      },
      onEditJson: (id) => {
        setEditView("json");
        setEditingId(id);
      },
      onRun: runStep,
      onDuplicate: duplicateStep,
      onDelete: deleteStep,
      readOnly,
    }),
    [runStep, duplicateStep, deleteStep, readOnly],
  );

  const editingStep = nodes.find((n) => n.id === editingId)?.data.step ?? null;

  const nodeTypes = useMemo(
    () => ({
      step: StepNodeCard,
      control: ControlNodeCard,
    }),
    [],
  );

  // The workflow state in scope for the step being edited: its upstream steps'
  // outputs (`steps.<id>.output`) and, if a trigger precedes it, `trigger.event`.
  // Merged with the host-supplied vars/secrets/sealSecret so the expression
  // editor's left panel shows every source at once.
  const mergedExprOptions = useMemo<ExpressionOptions>(() => {
    const { steps, hasTrigger } = upstreamStateSources(editingId, nodes, edges);
    return { ...(exprOptions ?? {}), steps, hasTrigger };
  }, [exprOptions, editingId, nodes, edges]);

  return (
    <StepControlsCtx.Provider value={controls}>
      <AppsCtx.Provider value={appsById}>
        <ExpressionOptionsProvider value={mergedExprOptions}>
          <div
            className="w6w-flow"
            style={{ width: "100%", height, position: "relative" }}
            onKeyDown={(e) => {
              if (e.key !== "Backspace" && e.key !== "Delete") return;
              // Only delete the selected node/edge when the key is aimed at the
              // canvas — never while a modal is open or the user is editing a field.
              // The modal <dialog> is a DOM descendant here, so its keystrokes
              // bubble up; without this guard, backspacing a typo deletes a node.
              if (editingId || builderOpen || (!selectedId && !selectedEdgeId)) return;
              const t = e.target as HTMLElement;
              if (
                t.isContentEditable ||
                t.tagName === "INPUT" ||
                t.tagName === "TEXTAREA" ||
                t.tagName === "SELECT" ||
                t.closest("dialog, .w6w-modal") !== null
              ) {
                return;
              }
              e.preventDefault();
              // A selected node takes precedence (its confirm); else drop the edge.
              if (selectedId) deleteStep(selectedId);
              else if (selectedEdgeId) deleteEdge(selectedEdgeId);
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              onSelectionChange={({ nodes: sel, edges: edgeSel }) => {
                setSelectedId(sel[0]?.id ?? null);
                setSelectedEdgeId(edgeSel[0]?.id ?? null);
              }}
              nodeTypes={nodeTypes}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              elementsSelectable
              fitView
              // Deletion is owned solely by the guarded onKeyDown handler above
              // (canvas-only, with a confirm). Disable React Flow's built-in
              // Backspace/Delete so it can't silently remove a node — e.g. while a
              // modal is open or the user is editing a field.
              deleteKeyCode={null}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={16} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable style={{ background: "var(--w6w-panel-2)" }} />
              {!readOnly && (
                <Panel position="top-left">
                  <button type="button" className="w6w-btn" onClick={() => setBuilderOpen(true)}>
                    + Step
                  </button>
                </Panel>
              )}
            </ReactFlow>

            {builderOpen && (
              <StepBuilderModal
                onClose={() => {
                  setBuilderOpen(false);
                  setPendingConnect(null);
                }}
                onAdd={addBuiltStep}
              />
            )}

            {editingStep && editingId && (
              // No `key` on purpose: renaming a step updates `editingId`, and a keyed
              // remount would drop focus mid-keystroke. The modal seeds its own state
              // once and unmounts (editingId → null) between edits of different nodes.
              <StepEditModal
                step={editingStep}
                readOnly={readOnly}
                initialView={editView}
                onChange={(next) => updateStep(editingId, next)}
                onClose={() => setEditingId(null)}
              />
            )}

            {runResult && (
              <Modal title={`Test run: ${runResult.stepId}`} onClose={() => setRunResult(null)}>
                {runResult.status === "running" && <p className="w6w-muted w6w-small">Running…</p>}
                {runResult.status === "error" && (
                  <div className="w6w-result w6w-error">
                    {runResult.errorCode && (
                      <div className="w6w-small" style={{ opacity: 0.75, marginBottom: 4 }}>
                        <code>{runResult.errorCode}</code>
                      </div>
                    )}
                    {runResult.error || "The step failed with no error message."}
                  </div>
                )}
                {runResult.status === "done" && (
                  <div>
                    <div className="w6w-muted w6w-small" style={{ marginBottom: 6 }}>
                      Result
                    </div>
                    <pre
                      className="w6w-result"
                      style={{
                        whiteSpace: "pre-wrap",
                        maxHeight: 360,
                        overflow: "auto",
                        margin: 0,
                      }}
                    >
                      {JSON.stringify(runResult.value, null, 2)}
                    </pre>
                  </div>
                )}
                {runResult.logs && runResult.logs.length > 0 && (
                  <div>
                    <div className="w6w-muted w6w-small" style={{ margin: "10px 0 6px" }}>
                      Console output
                    </div>
                    <pre
                      className="w6w-result"
                      style={{
                        whiteSpace: "pre-wrap",
                        maxHeight: 200,
                        overflow: "auto",
                        margin: 0,
                      }}
                    >
                      {runResult.logs.join("\n")}
                    </pre>
                  </div>
                )}
                <div className="w6w-modal-actions">
                  <button type="button" className="w6w-btn" onClick={() => setRunResult(null)}>
                    Close
                  </button>
                </div>
              </Modal>
            )}
          </div>
        </ExpressionOptionsProvider>
      </AppsCtx.Provider>
    </StepControlsCtx.Provider>
  );
}

// ── Node renderers ────────────────────────────────────────────────────────

/** A 24×24 stroked glyph for the node toolbar. */
function ToolbarIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function NodeControls({ id, runnable }: { id: string; runnable?: boolean }) {
  const ctrl = useContext(StepControlsCtx);
  if (!ctrl || ctrl.readOnly) return null;
  return (
    <NodeToolbar position={Position.Top} className="w6w-node-toolbar">
      {runnable && (
        <button
          type="button"
          className="w6w-node-toolbar-btn"
          title="Test-run this step"
          aria-label="Test-run this step"
          onClick={() => ctrl.onRun(id)}
        >
          <ToolbarIcon>
            <polygon points="6 4 20 12 6 20 6 4" />
          </ToolbarIcon>
        </button>
      )}
      <button
        type="button"
        className="w6w-node-toolbar-btn"
        title="Edit"
        aria-label="Edit step"
        onClick={() => ctrl.onEdit(id)}
      >
        <ToolbarIcon>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </ToolbarIcon>
      </button>
      <button
        type="button"
        className="w6w-node-toolbar-btn"
        title="Duplicate"
        aria-label="Duplicate step"
        onClick={() => ctrl.onDuplicate(id)}
      >
        <ToolbarIcon>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </ToolbarIcon>
      </button>
      <button
        type="button"
        className="w6w-node-toolbar-btn danger"
        title="Delete"
        aria-label="Delete step"
        onClick={() => ctrl.onDelete(id)}
      >
        <ToolbarIcon>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </ToolbarIcon>
      </button>
    </NodeToolbar>
  );
}

function StepNodeCard({ id, data, selected }: NodeProps<StepNode>) {
  const step = data.step;
  const apps = useContext(AppsCtx);
  const app = apps.get(step.uses.app);
  // The human app name (fall back to the raw id when the app isn't in the list).
  const appName = app?.displayName || step.uses.app || "—";
  const ports = nodePorts(step.uses.app, step.uses.action);
  return (
    <div>
      <NodeControls id={id} runnable />
      <div
        style={{
          // `relative` so the Handles center on the CARD, not the whole node
          // (which also spans the meta line below) — keeps ports vertically centered.
          position: "relative",
          border: `1px solid ${selected ? "var(--w6w-accent)" : "var(--w6w-border)"}`,
          background: "var(--w6w-panel)",
          color: "var(--w6w-text)",
          borderRadius: 4,
          padding: "8px 12px",
          minWidth: 180,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {ports.in > 0 && <Handle type="target" position={Position.Left} />}
        <AppIcon
          src={app?.iconSvg}
          srcDark={app?.iconSvgDark}
          brandColor={app?.brandColor}
          name={appName}
          size={28}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{appName}</div>
          <div className="w6w-muted w6w-small" style={{ marginTop: 2 }}>
            <code>{step.uses.action || "—"}</code>
          </div>
        </div>
        {ports.out > 0 && <Handle type="source" position={Position.Right} />}
      </div>
      {/* Meta line under the card: the step id and (when known) the app version. */}
      <div
        className="w6w-muted"
        style={{ marginTop: 3, fontSize: 10, opacity: 0.75, paddingLeft: 2 }}
      >
        {step.id}
        {app?.version ? ` - v${app.version}` : ""}
      </div>
    </div>
  );
}

function ControlNodeCard({ id, data, selected }: NodeProps<StepNode>) {
  const step = data.step;
  const label = internalNodeLabel(step.uses.app, step.uses.action);
  const icon = internalNodeIcon(step.uses.app, step.uses.action);
  // Ports: triggers have no entry (0 in, 1 out); other internals default to 1/1.
  const ports = nodePorts(step.uses.app, step.uses.action);
  return (
    <div>
      {/* Compute/trigger nodes can be test-run; flow-control nodes cannot. */}
      <NodeControls id={id} runnable={!isControlApp(step.uses.app)} />
      <div
        style={{
          // `relative` so the Handles center on the CARD, not the whole node
          // (which also spans the meta line below) — keeps ports vertically centered.
          position: "relative",
          border: `1px solid ${selected ? "var(--w6w-accent)" : "var(--w6w-border)"}`,
          background: "var(--w6w-panel-2)",
          color: "var(--w6w-text)",
          borderRadius: 4,
          padding: "6px 14px 6px 8px",
          minWidth: 140,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {ports.in > 0 && <Handle type="target" position={Position.Left} />}
        {icon && <InternalIcon icon={icon} />}
        <div style={{ minWidth: 0, textAlign: "left" }}>
          <div style={{ fontWeight: 600 }}>{label}</div>
          <div className="w6w-muted w6w-small" style={{ marginTop: 2 }}>
            <code>{step.uses.action || "—"}</code>
          </div>
        </div>
        {ports.out > 0 && <Handle type="source" position={Position.Right} />}
      </div>
      {/* Meta line under the card: the step id (internal nodes carry no version). */}
      <div
        className="w6w-muted"
        style={{ marginTop: 3, fontSize: 10, opacity: 0.75, paddingLeft: 2 }}
      >
        {step.id}
      </div>
    </div>
  );
}

// ── Step edit modal (Form ⇄ JSON) ─────────────────────────────────────────

function StepEditModal({
  step: initialStep,
  onChange,
  onClose,
  readOnly,
  initialView = "props",
}: {
  step: FlowStep;
  onChange: (next: FlowStep) => void;
  onClose: () => void;
  readOnly?: boolean;
  initialView?: EditView;
}) {
  const api = useW6wApi();
  const apps = useContext(AppsCtx);
  const [step, setStep] = useState<FlowStep>(initialStep);
  // Same shape as the add modal: Setup/Configure/Test tabs with the Configure
  // tab showing form (props) / JSON (code) / node settings (config).
  const [tab, setTab] = useState<"setup" | "configure" | "test">(
    initialView === "json" ? "configure" : initialView === "settings" ? "configure" : "configure",
  );
  const [configView, setConfigView] = useState<ConfigView>(
    initialView === "json" ? "code" : initialView === "settings" ? "config" : "props",
  );
  const [codeText, setCodeText] = useState(() => JSON.stringify(initialStep.with ?? {}, null, 2));
  const [testState, setTestState] = useState("{}");
  // Inline step rename (pencil next to the name). `updateStep` fixes up edges.
  const [renaming, setRenaming] = useState(false);
  const [draftId, setDraftId] = useState(step.id);

  const [params, setParams] = useState<ActionParam[] | null>(null);
  const [actions, setActions] = useState<ActionDef[] | null>(null);
  const [conns, setConns] = useState<ConnectionSummary[] | null>(null);
  const isInternal = isInternalApp(step.uses.app);

  // Refetch actions + params whenever the app/action identity changes.
  useEffect(() => {
    if (isInternal) {
      setParams(internalNodeParams(step.uses.app, step.uses.action));
      setActions(null);
      return;
    }
    if (!step.uses.app || !step.uses.action) {
      setParams([]);
      return;
    }
    let canceled = false;
    setParams(null);
    api
      .getAppActions(step.uses.app)
      .then((acts) => {
        if (canceled) return;
        setActions(acts);
        setParams(acts.find((a) => a.key === step.uses.action)?.params ?? []);
      })
      .catch(() => !canceled && setParams([]));
    return () => {
      canceled = true;
    };
  }, [api, step.uses.app, step.uses.action, isInternal]);

  useEffect(() => {
    if (isInternal || !step.uses.app) return;
    let canceled = false;
    api
      .listConnectionsForApp(step.uses.app)
      .then((c) => !canceled && setConns(c))
      .catch(() => !canceled && setConns([]));
    return () => {
      canceled = true;
    };
  }, [api, step.uses.app, isInternal]);

  const commit = useCallback(
    (next: FlowStep) => {
      setStep(next);
      onChange(next);
    },
    [onChange],
  );

  const changeConfigView = (v: ConfigView) => {
    if (v === "code") setCodeText(JSON.stringify(step.with ?? {}, null, 2));
    setConfigView(v);
  };
  const commitRename = () => {
    const id = draftId.trim();
    if (id && id !== step.id) commit({ ...step, id });
    setRenaming(false);
  };

  const testable = !!step.uses.app && !!step.uses.action && !isControlApp(step.uses.app);
  const testValues = (() => {
    try {
      const extra = JSON.parse(testState);
      return extra && typeof extra === "object"
        ? { ...(step.with ?? {}), ...(extra as Record<string, unknown>) }
        : (step.with ?? {});
    } catch {
      return step.with ?? {};
    }
  })();

  // Header icon mirrors the canvas node: the app's icon for app steps, the
  // internal glyph for triggers/actions/control nodes (same as the node cards).
  const app = apps.get(step.uses.app);
  const internalIcon = isInternal ? internalNodeIcon(step.uses.app, step.uses.action) : null;
  const titleIcon = isInternal ? (
    internalIcon ? (
      <InternalIcon icon={internalIcon} />
    ) : null
  ) : (
    <AppIcon
      src={app?.iconSvg}
      srcDark={app?.iconSvgDark}
      brandColor={app?.brandColor}
      name={app?.displayName}
    />
  );

  return (
    <Modal
      ariaLabel="Edit step"
      titleIcon={titleIcon}
      title={
        <span className="w6w-step-rename">
          {renaming && !readOnly ? (
            <input
              // biome-ignore lint/a11y/noAutofocus: rename input opened on demand
              autoFocus
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setDraftId(step.id);
                  setRenaming(false);
                }
              }}
            />
          ) : (
            <>
              <code>{step.id}</code>
              {!readOnly && (
                <button
                  type="button"
                  className="w6w-icon-btn w6w-btn-sm"
                  title="Rename step"
                  aria-label="Rename step"
                  onClick={() => {
                    setDraftId(step.id);
                    setRenaming(true);
                  }}
                >
                  <ToolbarIcon>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </ToolbarIcon>
                </button>
              )}
            </>
          )}
        </span>
      }
      onClose={onClose}
      size="wide"
    >
      <div className="w6w-stepconfig">
        <div className="w6w-tabsbar">
          <div className="w6w-subtabs">
            {(["setup", "configure", "test"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`w6w-subtab${tab === t ? " active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t === "setup" ? "Setup" : t === "configure" ? "Configure" : "Test"}
              </button>
            ))}
          </div>
          <ConfigViewToggle
            view={configView}
            onChange={changeConfigView}
            disabled={tab !== "configure"}
          />
        </div>

        <div className="w6w-stepconfig-body">
          {tab === "setup" && (
            <SetupTab
              step={step}
              app={app}
              actions={actions}
              conns={conns}
              isInternal={isInternal}
              readOnly={readOnly}
              onChangeAction={(action) =>
                commit({ ...step, uses: { ...step.uses, action }, with: {} })
              }
              onChangeConnection={(connection) =>
                commit({ ...step, uses: { ...step.uses, connection } })
              }
            />
          )}

          {tab === "configure" &&
            (params === null ? (
              <p className="w6w-muted w6w-small">Loading parameters…</p>
            ) : configView === "props" ? (
              <ParamsForm
                params={params}
                values={step.with ?? {}}
                readOnly={readOnly}
                onChange={(w) => commit({ ...step, with: w })}
              />
            ) : configView === "code" ? (
              <JsonEditor
                value={codeText}
                onChange={setCodeText}
                readOnly={readOnly}
                minHeight="260px"
                height="100%"
                aria-label={`Step ${step.id} params JSON`}
                onValidChange={(p) =>
                  p &&
                  typeof p === "object" &&
                  !Array.isArray(p) &&
                  commit({ ...step, with: p as Record<string, unknown> })
                }
              />
            ) : (
              <NodeConfigForm
                config={{ retry: step.retry, onError: step.onError, notes: step.notes }}
                onChange={(c) => commit({ ...step, ...c })}
                readOnly={readOnly}
              />
            ))}

          {tab === "test" && (
            <div className="w6w-stack">
              {testable ? (
                <>
                  <label className="w6w-field">
                    <span>Incoming state</span>
                    <textarea
                      rows={3}
                      value={testState}
                      readOnly={readOnly}
                      spellCheck={false}
                      onChange={(e) => setTestState(e.target.value)}
                    />
                    <span className="w6w-hint">
                      Optional JSON merged into the test call (e.g. a script's <code>input</code>).
                    </span>
                  </label>
                  <StepTestRun
                    app={step.uses.app}
                    action={step.uses.action}
                    connectionId={step.uses.connection ?? undefined}
                    values={testValues}
                    canRun={!!params && requiredParamsFilled(params, testValues)}
                  />
                </>
              ) : (
                <p className="w6w-muted w6w-small">
                  Flow-control nodes can't be tested on their own.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="w6w-modal-actions w6w-stepconfig-footer">
          {tab !== "test" ? (
            <button
              type="button"
              className="w6w-btn"
              onClick={() => setTab(tab === "setup" ? "configure" : "test")}
            >
              Next →
            </button>
          ) : (
            <button type="button" className="w6w-btn" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * The Setup tab — the step's app (read-only), its action (a dropdown for app
 * steps), and its connection. Mirrors the top of a Zapier node.
 */
function SetupTab({
  step,
  app,
  actions,
  conns,
  isInternal,
  readOnly,
  onChangeAction,
  onChangeConnection,
}: {
  step: FlowStep;
  app: AppSummary | undefined;
  actions: ActionDef[] | null;
  conns: ConnectionSummary[] | null;
  isInternal: boolean;
  readOnly?: boolean;
  onChangeAction: (action: string) => void;
  onChangeConnection: (connection: string | undefined) => void;
}) {
  return (
    <div className="w6w-stack">
      <div className="w6w-field">
        <span>App</span>
        <div className="w6w-conn-label">
          {!isInternal && app && (
            <AppIcon
              src={app.iconSvg}
              srcDark={app.iconSvgDark}
              brandColor={app.brandColor}
              name={app.displayName}
              size={20}
            />
          )}
          <span className="w6w-conn-label-name">
            {isInternal ? step.uses.app : (app?.displayName ?? step.uses.app)}
          </span>
        </div>
      </div>

      {isInternal ? (
        <div className="w6w-field">
          <span>Action</span>
          <div className="w6w-muted w6w-small">
            <code>{step.uses.action}</code>
          </div>
        </div>
      ) : (
        <label className="w6w-field">
          <span>Action</span>
          <select
            value={step.uses.action}
            disabled={readOnly || actions === null}
            onChange={(e) => onChangeAction(e.target.value)}
          >
            {actions === null && <option>{step.uses.action}</option>}
            {(actions ?? []).map((a) => (
              <option key={a.key} value={a.key}>
                {a.title ?? a.key}
              </option>
            ))}
          </select>
        </label>
      )}

      {!isInternal && (
        <label className="w6w-field">
          <span>Connection</span>
          <select
            value={step.uses.connection ?? ""}
            disabled={readOnly}
            onChange={(e) => onChangeConnection(e.target.value || undefined)}
          >
            <option value="">— none —</option>
            {(conns ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName || c.id}
                {c.state ? ` (${c.state})` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
