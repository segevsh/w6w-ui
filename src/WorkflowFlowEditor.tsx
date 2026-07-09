import {
  Background,
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
import { ParamsForm } from "./ParamsForm.tsx";
import { type BuiltStep, StepBuilderModal } from "./StepBuilderModal.tsx";
import { AppIcon } from "./components/AppIcon.tsx";
import { Modal } from "./components/Modal.tsx";
import {
  type FlowStep,
  type FlowWorkflow,
  internalNodeIcon,
  internalNodeLabel,
  internalNodeParams,
  isControlApp,
  isInternalApp,
} from "./flow-types.ts";
import { type StepNode, flowToWorkflow, suggestStepId, workflowToFlow } from "./flow-utils.ts";
import { useW6wApi } from "./provider.tsx";
import type { ActionParam, AppSummary } from "./types.ts";

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
}

/**
 * App metadata by id, shared with the node cards so `StepNodeCard` can show the
 * app's icon/name/version without threading it through each node's `data`.
 */
const AppsCtx = createContext<Map<string, AppSummary>>(new Map());

/** Which view the step edit modal opens in. */
type EditView = "form" | "json";

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
}

function Inner({ value, onChange, readOnly, height = 480, apps }: WorkflowFlowEditorProps) {
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
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editView, setEditView] = useState<EditView>("form");
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

  const onConnect = useCallback(
    (params: Parameters<typeof addEdge>[0]) => {
      if (readOnly) return;
      const next = addEdge({ ...params, id: `${params.source}->${params.target}` }, edges);
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
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      const position = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      setPendingConnect({
        nodeId: fromNode.id,
        handleType: connectionState.fromHandle?.type === "target" ? "target" : "source",
        position,
      });
      setBuilderOpen(true);
    },
    [readOnly, screenToFlowPosition],
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
      let nextEdges = edges;
      if (pendingConnect) {
        const [source, target] =
          pendingConnect.handleType === "target"
            ? [id, pendingConnect.nodeId]
            : [pendingConnect.nodeId, id];
        nextEdges = addEdge({ source, target, id: `${source}->${target}` }, edges);
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
        const { value: out } = await api.invokeAction(
          step.uses.app,
          step.uses.action,
          step.with ?? {},
          step.uses.connection ? { connectionId: step.uses.connection } : {},
        );
        setRunResult({ stepId: id, status: "done", value: out });
      } catch (e) {
        setRunResult({ stepId: id, status: "error", error: (e as Error).message });
      }
    },
    [nodes, api],
  );

  const controls = useMemo<StepControls>(
    () => ({
      onEdit: (id) => {
        setEditView("form");
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

  return (
    <StepControlsCtx.Provider value={controls}>
      <AppsCtx.Provider value={appsById}>
        <div
          className="w6w-flow"
          style={{ width: "100%", height, position: "relative" }}
          onKeyDown={(e) => {
            if ((e.key === "Backspace" || e.key === "Delete") && selectedId && !editingId) {
              e.preventDefault();
              deleteStep(selectedId);
            }
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            onSelectionChange={({ nodes: sel }) => setSelectedId(sel[0]?.id ?? null)}
            nodeTypes={nodeTypes}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable
            fitView
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
                <div className="w6w-result w6w-error">{runResult.error}</div>
              )}
              {runResult.status === "done" && (
                <div>
                  <div className="w6w-muted w6w-small" style={{ marginBottom: 6 }}>
                    Result
                  </div>
                  <pre
                    className="w6w-result"
                    style={{ whiteSpace: "pre-wrap", maxHeight: 360, overflow: "auto", margin: 0 }}
                  >
                    {JSON.stringify(runResult.value, null, 2)}
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
        title="Edit as JSON"
        aria-label="Edit step as JSON"
        onClick={() => ctrl.onEditJson(id)}
      >
        <ToolbarIcon>
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
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

/**
 * An internal pseudo-app's glyph on a rounded tile, sized and shaped to match
 * `AppIcon`'s image tile so control nodes and app nodes read as the same family.
 * The glyph strokes with the panel's text color, so it tracks the active theme.
 */
function InternalIcon({ icon, size = 28 }: { icon: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 6,
        flexShrink: 0,
        background: "var(--w6w-icon-swatch, var(--w6w-panel-2))",
        color: "var(--w6w-accent)",
      }}
    >
      <svg
        width={Math.round(size * 0.6)}
        height={Math.round(size * 0.6)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static, in-repo SVG glyph markup (no user input)
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    </span>
  );
}

function StepNodeCard({ id, data, selected }: NodeProps<StepNode>) {
  const step = data.step;
  const apps = useContext(AppsCtx);
  const app = apps.get(step.uses.app);
  // The human app name (fall back to the raw id when the app isn't in the list).
  const appName = app?.displayName || step.uses.app || "—";
  return (
    <div>
      <NodeControls id={id} runnable />
      <div
        style={{
          border: `1px solid ${selected ? "var(--w6w-accent)" : "var(--w6w-border)"}`,
          background: "var(--w6w-panel)",
          color: "var(--w6w-text)",
          borderRadius: 8,
          padding: "8px 12px",
          minWidth: 180,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Handle type="target" position={Position.Left} />
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
        <Handle type="source" position={Position.Right} />
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
  return (
    <div
      style={{
        border: `1px solid ${selected ? "var(--w6w-accent)" : "var(--w6w-border)"}`,
        background: "var(--w6w-panel-2)",
        color: "var(--w6w-text)",
        borderRadius: 999,
        padding: "6px 14px 6px 8px",
        minWidth: 140,
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      {/* Compute/trigger nodes can be test-run; flow-control nodes cannot. */}
      <NodeControls id={id} runnable={!isControlApp(step.uses.app)} />
      <Handle type="target" position={Position.Left} />
      {icon && <InternalIcon icon={icon} />}
      <div style={{ minWidth: 0, textAlign: "left" }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div className="w6w-muted w6w-small">{step.id}</div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// ── Step edit modal (Form ⇄ JSON) ─────────────────────────────────────────

function StepEditModal({
  step: initialStep,
  onChange,
  onClose,
  readOnly,
  initialView = "form",
}: {
  step: FlowStep;
  onChange: (next: FlowStep) => void;
  onClose: () => void;
  readOnly?: boolean;
  initialView?: EditView;
}) {
  const api = useW6wApi();
  const [step, setStep] = useState<FlowStep>(initialStep);
  const [view, setView] = useState<EditView>(initialView);
  const [json, setJson] = useState(() => JSON.stringify(initialStep, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Param defs driving the Form view. Internal pseudo-app nodes use their
  // built-in schema; app actions fetch theirs from the registry. Either way the
  // same ParamsForm renders the config.
  const [params, setParams] = useState<ActionParam[] | null>(null);
  const isInternal = isInternalApp(step.uses.app);

  // Refetch action param defs whenever the app/action identity changes.
  useEffect(() => {
    if (isInternal) {
      setParams(internalNodeParams(step.uses.app, step.uses.action));
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
      .then((actions) => {
        if (canceled) return;
        const def = actions.find((a) => a.key === step.uses.action);
        setParams(def?.params ?? []);
      })
      .catch(() => !canceled && setParams([]));
    return () => {
      canceled = true;
    };
  }, [api, step.uses.app, step.uses.action, isInternal]);

  // Commit a new step: update local state, re-seed JSON, and propagate up.
  const commit = useCallback(
    (next: FlowStep) => {
      setStep(next);
      setJson(JSON.stringify(next, null, 2));
      onChange(next);
    },
    [onChange],
  );

  function switchTo(next: EditView) {
    if (next === "json") setJson(JSON.stringify(step, null, 2)); // re-seed from truth
    setView(next);
  }

  return (
    <Modal title={`Edit step: ${step.id}`} onClose={onClose} size="wide">
      <div className="w6w-tabbar" style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className={`w6w-btn w6w-btn-ghost${view === "form" ? " active" : ""}`}
          onClick={() => switchTo("form")}
        >
          Form
        </button>
        <button
          type="button"
          className={`w6w-btn w6w-btn-ghost${view === "json" ? " active" : ""}`}
          onClick={() => switchTo("json")}
        >
          JSON
        </button>
      </div>

      {view === "form" ? (
        <div className="w6w-stack">
          <label className="w6w-field">
            <span>Step id</span>
            <input
              type="text"
              value={step.id}
              readOnly={readOnly}
              onChange={(e) => commit({ ...step, id: e.target.value })}
            />
          </label>
          <div className="w6w-field">
            <span>Uses</span>
            <div className="w6w-muted w6w-small">
              <code>{step.uses.app || "—"}</code> · <code>{step.uses.action || "—"}</code>
            </div>
          </div>
          {!isInternal && (
            <label className="w6w-field">
              <span>Connection</span>
              <input
                type="text"
                value={step.uses.connection ?? ""}
                readOnly={readOnly}
                placeholder="(optional connection id)"
                onChange={(e) =>
                  commit({
                    ...step,
                    uses: { ...step.uses, connection: e.target.value || undefined },
                  })
                }
              />
            </label>
          )}
          <div>
            <div className="w6w-muted w6w-small" style={{ marginBottom: 6 }}>
              {isInternal ? "Configuration" : "Parameters"}
            </div>
            {params === null ? (
              <p className="w6w-muted w6w-small">Loading parameters…</p>
            ) : (
              <ParamsForm
                params={params}
                values={step.with ?? {}}
                readOnly={readOnly}
                onChange={(w) => commit({ ...step, with: w })}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="w6w-stack">
          <p className="w6w-muted w6w-small">
            Edit the whole step as JSON. Changes apply on every valid edit.
          </p>
          <JsonEditor
            value={json}
            onChange={setJson}
            readOnly={readOnly}
            minHeight="300px"
            aria-label={`Step ${step.id} JSON`}
            onValidChange={(parsed) => {
              if (isFlowStep(parsed)) {
                setJsonError(null);
                setStep(parsed);
                onChange(parsed);
              } else {
                setJsonError("Not a valid step: needs id and uses.{app,action}.");
              }
            }}
            onValidityChange={({ valid, error }) => {
              if (!valid) setJsonError(error ?? "Invalid JSON");
            }}
          />
          {jsonError && <div className="w6w-result w6w-error">{jsonError}</div>}
        </div>
      )}

      <div className="w6w-modal-actions">
        <button type="button" className="w6w-btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function isFlowStep(v: unknown): v is FlowStep {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as FlowStep).id === "string" &&
    typeof (v as FlowStep).uses === "object" &&
    typeof (v as FlowStep).uses.app === "string" &&
    typeof (v as FlowStep).uses.action === "string"
  );
}
