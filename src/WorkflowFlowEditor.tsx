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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Handle } from "@xyflow/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { JsonEditor } from "./JsonEditor.tsx";
import { ParamsForm } from "./ParamsForm.tsx";
import { type BuiltStep, StepBuilderModal } from "./StepBuilderModal.tsx";
import { Modal } from "./components/Modal.tsx";
import { CONTROL_APP, CONTROL_LABELS, type FlowStep, type FlowWorkflow } from "./flow-types.ts";
import { type StepNode, flowToWorkflow, suggestStepId, workflowToFlow } from "./flow-utils.ts";
import { useW6wApi } from "./provider.tsx";
import type { ActionParam } from "./types.ts";

export interface WorkflowFlowEditorProps {
  /** The workflow being edited. The editor re-derives layout when this changes identity. */
  value: FlowWorkflow;
  /** Fired whenever the user changes the graph — new nodes, edges, or step edits. */
  onChange: (next: FlowWorkflow) => void;
  /** Disable all interactions — pans/zooms are still enabled. */
  readOnly?: boolean;
  /** Height of the editor viewport. Defaults to 480px. */
  height?: string | number;
}

/** Per-node control handlers, provided to the node cards via context. */
interface StepControls {
  onEdit: (id: string) => void;
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

function Inner({ value, onChange, readOnly, height = 480 }: WorkflowFlowEditorProps) {
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

  const deleteStep = useCallback(
    (id: string) => {
      if (readOnly) return;
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
        data: { step: cloned, isControl: src.data.isControl },
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
      const isControl = built.uses.app === CONTROL_APP;
      const id = suggestStepId(
        nodes.map((n) => n.id),
        isControl ? "gate" : "step",
      );
      const step: FlowStep = {
        id,
        uses: built.uses,
        ...(built.with && Object.keys(built.with).length > 0 ? { with: built.with } : {}),
      };
      const newNode: StepNode = {
        id,
        type: isControl ? "control" : "step",
        position: { x: 80, y: 80 + nodes.length * 24 },
        data: { step, isControl },
      };
      const nextNodes = [...nodes, newNode];
      setNodes(nextNodes);
      setSelectedId(id);
      setBuilderOpen(false);
      emitChange(nextNodes, edges);
    },
    [nodes, edges, setNodes, emitChange, readOnly],
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
              data: { step: next, isControl: next.uses.app === CONTROL_APP },
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

  const controls = useMemo<StepControls>(
    () => ({
      onEdit: (id) => setEditingId(id),
      onDuplicate: duplicateStep,
      onDelete: deleteStep,
      readOnly,
    }),
    [duplicateStep, deleteStep, readOnly],
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
          <StepBuilderModal onClose={() => setBuilderOpen(false)} onAdd={addBuiltStep} />
        )}

        {editingStep && editingId && (
          // No `key` on purpose: renaming a step updates `editingId`, and a keyed
          // remount would drop focus mid-keystroke. The modal seeds its own state
          // once and unmounts (editingId → null) between edits of different nodes.
          <StepEditModal
            step={editingStep}
            readOnly={readOnly}
            onChange={(next) => updateStep(editingId, next)}
            onClose={() => setEditingId(null)}
          />
        )}
      </div>
    </StepControlsCtx.Provider>
  );
}

// ── Node renderers ────────────────────────────────────────────────────────

function NodeControls({ id }: { id: string }) {
  const ctrl = useContext(StepControlsCtx);
  if (!ctrl || ctrl.readOnly) return null;
  return (
    <NodeToolbar position={Position.Top} className="w6w-node-toolbar">
      <button type="button" className="w6w-node-toolbar-btn" onClick={() => ctrl.onEdit(id)}>
        Edit
      </button>
      <button type="button" className="w6w-node-toolbar-btn" onClick={() => ctrl.onDuplicate(id)}>
        Duplicate
      </button>
      <button
        type="button"
        className="w6w-node-toolbar-btn danger"
        onClick={() => ctrl.onDelete(id)}
      >
        Delete
      </button>
    </NodeToolbar>
  );
}

function StepNodeCard({ id, data, selected }: NodeProps<StepNode>) {
  const step = data.step;
  return (
    <div
      style={{
        border: `1px solid ${selected ? "var(--w6w-accent)" : "var(--w6w-border)"}`,
        background: "var(--w6w-panel)",
        color: "var(--w6w-text)",
        borderRadius: 8,
        padding: "8px 12px",
        minWidth: 180,
        fontSize: 13,
      }}
    >
      <NodeControls id={id} />
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600 }}>{step.id}</div>
      <div className="w6w-muted w6w-small" style={{ marginTop: 2 }}>
        {step.uses.app || "—"} · <code>{step.uses.action || "—"}</code>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ControlNodeCard({ id, data, selected }: NodeProps<StepNode>) {
  const step = data.step;
  const label = CONTROL_LABELS[step.uses.action] ?? step.uses.action;
  return (
    <div
      style={{
        border: `1px solid ${selected ? "var(--w6w-accent)" : "var(--w6w-border)"}`,
        background: "var(--w6w-panel-2)",
        color: "var(--w6w-text)",
        borderRadius: 999,
        padding: "6px 14px",
        minWidth: 140,
        fontSize: 13,
        textAlign: "center",
      }}
    >
      <NodeControls id={id} />
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div className="w6w-muted w6w-small">{step.id}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// ── Step edit modal (Form ⇄ JSON) ─────────────────────────────────────────

type EditView = "form" | "json";

function StepEditModal({
  step: initialStep,
  onChange,
  onClose,
  readOnly,
}: {
  step: FlowStep;
  onChange: (next: FlowStep) => void;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const api = useW6wApi();
  const [step, setStep] = useState<FlowStep>(initialStep);
  const [view, setView] = useState<EditView>("form");
  const [json, setJson] = useState(() => JSON.stringify(initialStep, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Action param defs for the Form view (skipped for control steps).
  const [params, setParams] = useState<ActionParam[] | null>(null);
  const isControl = step.uses.app === CONTROL_APP;

  // Refetch action param defs whenever the app/action identity changes.
  useEffect(() => {
    if (isControl || !step.uses.app || !step.uses.action) {
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
  }, [api, step.uses.app, step.uses.action, isControl]);

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
          {!isControl && (
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
              {isControl ? "Configuration" : "Parameters"}
            </div>
            {params === null ? (
              <p className="w6w-muted w6w-small">Loading parameters…</p>
            ) : isControl ? (
              <p className="w6w-muted w6w-small">
                Control steps have no declared params — edit their config in the JSON view.
              </p>
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
