import {
  Background,
  Controls,
  type Edge,
  MiniMap,
  type NodeProps,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Handle, Position } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { JsonEditor } from "./JsonEditor.tsx";
import {
  CONTROL_APP,
  CONTROL_LABELS,
  type FlowStep,
  type FlowWorkflow,
} from "./flow-types.ts";
import {
  flowToWorkflow,
  type StepNode,
  suggestStepId,
  workflowToFlow,
} from "./flow-utils.ts";

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

/**
 * Visual workflow editor. Renders a Workflow's DAG as a React Flow graph:
 *
 *   - Auto-layouted on load (topological columns + sibling rows).
 *   - Nodes render differently for action steps vs. control steps
 *     (`uses.app === "@w6w/control"`).
 *   - Drag nodes to reposition; connect handles to create edges; select a node
 *     and delete it or edit its properties in the right-hand panel.
 *   - The right panel shows the raw step as JSON in a JsonEditor so authors
 *     can edit `with`/`retry`/`onError` without a bespoke form.
 *   - Every meaningful change fires `onChange` with an updated Workflow.
 *
 * Use this side-by-side with `<JsonEditor>` for a two-view authoring UX.
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
  const initial = useMemo(() => workflowToFlow(value), [value.id]);
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // If the caller swaps in a different workflow, reset local graph state.
  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
    setSelectedId(null);
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

  const removeSelected = useCallback(() => {
    if (readOnly || !selectedId) return;
    const nextNodes = nodes.filter((n) => n.id !== selectedId);
    const nextEdges = edges.filter((e) => e.source !== selectedId && e.target !== selectedId);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedId(null);
    emitChange(nextNodes, nextEdges);
  }, [selectedId, nodes, edges, setNodes, setEdges, emitChange, readOnly]);

  const addStep = useCallback(
    (isControl: boolean) => {
      if (readOnly) return;
      const id = suggestStepId(nodes.map((n) => n.id), isControl ? "gate" : "step");
      const step: FlowStep = isControl
        ? { id, uses: { app: CONTROL_APP, action: "if" }, with: { condition: true } }
        : { id, uses: { app: "", action: "" } };
      const newNode: StepNode = {
        id,
        type: isControl ? "control" : "step",
        position: { x: 60, y: 60 },
        data: { step, isControl },
      };
      const nextNodes = [...nodes, newNode];
      setNodes(nextNodes);
      emitChange(nextNodes, edges);
      setSelectedId(id);
    },
    [nodes, edges, setNodes, emitChange, readOnly],
  );

  const updateSelectedStep = useCallback(
    (next: FlowStep) => {
      const nextNodes = nodes.map((n) =>
        n.id === selectedId
          ? { ...n, data: { step: next, isControl: next.uses.app === CONTROL_APP } }
          : n
      );
      // If the id changed, rewire edges. Reject duplicate ids by ignoring the change.
      if (selectedId && next.id !== selectedId) {
        const dupe = nextNodes.some((n) => n.id === next.id && n.data.step !== next);
        if (dupe) return;
        for (const n of nextNodes) if (n.id === selectedId) n.id = next.id;
        const nextEdges = edges.map((e) => ({
          ...e,
          source: e.source === selectedId ? next.id : e.source,
          target: e.target === selectedId ? next.id : e.target,
          id: `${e.source === selectedId ? next.id : e.source}->${
            e.target === selectedId ? next.id : e.target
          }`,
        }));
        setNodes(nextNodes);
        setEdges(nextEdges);
        setSelectedId(next.id);
        emitChange(nextNodes, nextEdges);
        return;
      }
      setNodes(nextNodes);
      emitChange(nextNodes, edges);
    },
    [nodes, edges, setNodes, setEdges, selectedId, emitChange],
  );

  const selectedStep = nodes.find((n) => n.id === selectedId)?.data.step;

  const nodeTypes = useMemo(
    () => ({
      step: StepNodeCard,
      control: ControlNodeCard,
    }),
    [],
  );

  return (
    <div
      className="w6w-flow"
      style={{ display: "flex", width: "100%", height, gap: 12 }}
      onKeyDown={(e) => {
        if ((e.key === "Backspace" || e.key === "Delete") && selectedId) {
          e.preventDefault();
          removeSelected();
        }
      }}
    >
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={({ nodes: sel }) =>
            setSelectedId(sel[0]?.id ?? null)}
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
            <Panel position="top-left" style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="w6w-btn w6w-btn-ghost"
                onClick={() => addStep(false)}
              >
                + Step
              </button>
              <button
                type="button"
                className="w6w-btn w6w-btn-ghost"
                onClick={() => addStep(true)}
              >
                + Control
              </button>
              <button
                type="button"
                className="w6w-btn w6w-btn-ghost"
                disabled={!selectedId}
                onClick={removeSelected}
              >
                Delete
              </button>
            </Panel>
          )}
        </ReactFlow>
      </div>

      <aside
        className="w6w-flow-panel"
        style={{
          width: 320,
          flexShrink: 0,
          border: "1px solid var(--w6w-border)",
          borderRadius: "var(--w6w-radius)",
          padding: 12,
          background: "var(--w6w-panel)",
          overflow: "auto",
        }}
      >
        {selectedStep
          ? (
            <StepEditor
              step={selectedStep}
              readOnly={readOnly}
              onChange={updateSelectedStep}
            />
          )
          : (
            <p className="w6w-muted w6w-small">
              Select a step to edit its <code>id</code>, <code>uses</code>, <code>with</code>,
              and retry policy as JSON.
            </p>
          )}
      </aside>
    </div>
  );
}

// ── Node renderers ────────────────────────────────────────────────────────

function StepNodeCard({ data, selected }: NodeProps<StepNode>) {
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
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600 }}>{step.id}</div>
      <div className="w6w-muted w6w-small" style={{ marginTop: 2 }}>
        {step.uses.app || "—"} · <code>{step.uses.action || "—"}</code>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ControlNodeCard({ data, selected }: NodeProps<StepNode>) {
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
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div className="w6w-muted w6w-small">{step.id}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// ── Right-panel editor ────────────────────────────────────────────────────

function StepEditor(
  { step, onChange, readOnly }: {
    step: FlowStep;
    onChange: (next: FlowStep) => void;
    readOnly?: boolean;
  },
) {
  const [json, setJson] = useState(() => JSON.stringify(step, null, 2));
  const [validityError, setValidityError] = useState<string | null>(null);

  // Reset the local text when the caller swaps in a different selected step.
  useEffect(() => {
    setJson(JSON.stringify(step, null, 2));
    setValidityError(null);
  }, [step.id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 600 }}>Step</div>
      <div className="w6w-muted w6w-small">
        Edit the step as JSON. Changes apply on every valid keystroke.
      </div>
      <JsonEditor
        value={json}
        onChange={setJson}
        readOnly={readOnly}
        minHeight="260px"
        aria-label={`Step ${step.id} JSON`}
        onValidChange={(parsed) => {
          if (isFlowStep(parsed)) onChange(parsed);
        }}
        onValidityChange={({ valid, error }) => setValidityError(valid ? null : error ?? null)}
      />
      {validityError && (
        <div className="w6w-result w6w-error" style={{ marginTop: 4 }}>
          {validityError}
        </div>
      )}
    </div>
  );
}

function isFlowStep(v: unknown): v is FlowStep {
  return (
    !!v && typeof v === "object" &&
    typeof (v as FlowStep).id === "string" &&
    typeof (v as FlowStep).uses === "object" &&
    typeof (v as FlowStep).uses.app === "string" &&
    typeof (v as FlowStep).uses.action === "string"
  );
}
