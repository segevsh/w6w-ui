import { type ReactNode, forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { AddConnectionModal } from "./AddConnectionModal.tsx";
import { AppPicker } from "./AppPicker.tsx";
import { JsonEditor } from "./JsonEditor.tsx";
import { type NodeConfig, NodeConfigForm } from "./NodeConfigForm.tsx";
import { ParamsForm, flattenParams, isParamVisible } from "./ParamsForm.tsx";
import { TriggerFillForm } from "./TriggerFillForm.tsx";
import { AppIcon } from "./components/AppIcon.tsx";
import type { ExpressionStepSource } from "./components/ExpressionOptions.tsx";
import { InternalIcon } from "./components/InternalIcon.tsx";
import { Modal } from "./components/Modal.tsx";
import {
  DATA_APP,
  INTERNAL_NODES,
  type InternalNodeDef,
  internalNodeDefaults,
  isControlApp,
  isTriggerApp,
} from "./flow-types.ts";
import { paramsToJson, stepToJson } from "./flow-utils.ts";
import { type StepStartState, useW6WApi, useWorkflowProject } from "./provider.tsx";
import { startStateFromSeeds } from "./step-preview-state.ts";
import type {
  ActionDef,
  ActionParam,
  AppSummary,
  AuthDef,
  ConnectionSummary,
  ThemeMode,
} from "./types.ts";
import { useSeedSources } from "./use-seed-sources.ts";

/** The step the builder emits — the editor assigns the final `id`. `NodeConfig`
 * carries the base settings (retry / onError / notes) set on the Config view. */
export interface BuiltStep extends NodeConfig {
  uses: { app: string; action: string; connection?: string | null };
  with?: Record<string, unknown>;
}

export interface StepBuilderModalProps {
  onClose: () => void;
  /**
   * Fired once per session, the moment the step first has identity — for an
   * app step, when Setup completes (action + connection, if needed); for a
   * control node, on mount. Returns the minted step id so subsequent edits can
   * target it via {@link StepBuilderModalProps.onDraftChange}.
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: widened so studio's void-returning callers stay assignable.
  onAdd: (step: BuiltStep) => string | undefined | void;
  /**
   * Fired for every field change **after** the step has been committed via
   * `onAdd` — keeps the already-added node current without minting a second
   * one. `id` is the id `onAdd` returned. Progressive commit (mint-then-update)
   * only engages when this is supplied; omitted callers (the Functions/
   * Endpoints pickers) keep the original one-shot "Add step" behavior.
   */
  onDraftChange?: (id: string, step: BuiltStep) => void;
  theme?: ThemeMode;
  /**
   * Restrict the picker to real app actions — hides the Triggers / Controls /
   * Utilities (flow-control / internal `@w6w/*` node) tabs. Used where only an
   * app action makes sense, e.g. binding a Function's implementation.
   */
  appsOnly?: boolean;
  /** Modal heading. Defaults to "Add a step". */
  title?: string;
  /**
   * Workflow-step context, when the builder is opened for a step that already
   * lives in a workflow. When present the `testRequired` save-gate can discover a
   * previously-saved **passing** test for the step via {@link W6WApi.listStepTests}.
   * Absent in the plain add-step flow (the step has no id yet) — there the gate is
   * satisfied by running a passing test in-session.
   */
  workflowId?: string;
  /** Step id paired with {@link StepBuilderModalProps.workflowId}. */
  stepId?: string;
  /**
   * The new step's known graph ancestors, when the builder is opened from the
   * workflow canvas (`stepBuilderUpstreamSteps`, derived from the connection
   * drag that opened it). Threaded into the Test tab's `<StepTestRun>` the same
   * way `StepEditModal` seeds an existing step's Test tab, so a `with` block
   * written as `{{ steps.<id>.output.<field> }}` resolves instead of coming
   * back empty. Absent (defaults to `[]`) for the Functions/Endpoints pickers,
   * which have no graph to draw ancestors from.
   */
  upstreamSteps?: ExpressionStepSource[];
  /**
   * Pre-select an app when the modal opens. When provided along with
   * initialAction/initialConnection/initialWith, the modal opens directly
   * to the action configuration view instead of the app picker.
   * Used when editing an existing action (e.g., clicking "Change" on an
   * Endpoint's already-configured target).
   */
  initialApp?: AppSummary;
  /**
   * Pre-select an action key. Requires initialApp to be set.
   */
  initialAction?: string;
  /**
   * Pre-select a connection. Requires initialApp and initialAction.
   */
  initialConnection?: string;
  /**
   * Pre-fill the action's parameter values. Requires initialApp and initialAction.
   */
  initialWith?: Record<string, unknown>;
}

type Tab = "connected" | "apps" | "ai" | "triggers" | "controls" | "utilities" | "data";

/** Config sub-tabs shared by the add-step config and the node editor. */
type StepConfigTab = "setup" | "configure" | "test";

/** The four representations of the Configure tab: form, full-step JSON,
 * params-only JSON, node settings. */
export type ConfigView = "props" | "code" | "params-code" | "config";

/** A 15×15 stroked glyph on a 24×24 viewBox (matches the editor's toolbar icons). */
function Glyph({ children }: { children: ReactNode }) {
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

/** The glyph + accessible label each view is drawn with. */
const CONFIG_VIEW_GLYPHS: Record<ConfigView, { label: string; glyph: ReactNode }> = {
  props: {
    label: "Form",
    glyph: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="7" y1="8" x2="17" y2="8" />
        <line x1="7" y1="12" x2="17" y2="12" />
        <line x1="7" y1="16" x2="13" y2="16" />
      </>
    ),
  },
  code: {
    label: "JSON",
    glyph: (
      <>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </>
    ),
  },
  // Hand-drawn — no icon library in `packages/ui`, no new npm dependency. Braces,
  // not chevrons: `code` reads as "the step, as code"; this reads as "the
  // params, as a value" — distinct at a glance from the `<>` pair above it.
  "params-code": {
    label: "Params JSON",
    glyph: (
      <>
        <polyline points="9 4 7 4 7 10 5 12 7 14 7 20 9 20" />
        <polyline points="15 4 17 4 17 10 19 12 17 14 17 20 15 20" />
      </>
    ),
  },
  config: {
    label: "Node settings",
    glyph: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
  },
};

/** Every view, in the order the editor's tabs bar has always shown them. */
const ALL_CONFIG_VIEWS: ConfigView[] = ["props", "code", "params-code", "config"];

/**
 * The props / code / params-code / config view toggle, right-aligned in the
 * tabs bar. Disabled off the Configure tab (all four views represent the
 * action's config).
 *
 * `views` narrows it to a subset, in the order given — a fields ⇄ raw-JSON
 * property form (see `PropertyEntryForm`) passes `["props", "code"]`. There is
 * deliberately no second toggle component: one glyph set, one styling, one
 * pressed-state behaviour, however many views a host offers.
 */
export function ConfigViewToggle({
  view,
  onChange,
  disabled,
  views = ALL_CONFIG_VIEWS,
}: {
  view: ConfigView;
  onChange: (v: ConfigView) => void;
  disabled?: boolean;
  /** Which views to offer, in order. Defaults to all four. */
  views?: ConfigView[];
}) {
  const btn = (v: ConfigView) => (
    <button
      key={v}
      type="button"
      title={CONFIG_VIEW_GLYPHS[v].label}
      aria-label={CONFIG_VIEW_GLYPHS[v].label}
      aria-pressed={view === v}
      disabled={disabled}
      className={`w6w-icon-btn${view === v && !disabled ? " active" : ""}`}
      onClick={() => onChange(v)}
    >
      <Glyph>{CONFIG_VIEW_GLYPHS[v].glyph}</Glyph>
    </button>
  );
  return <div className="w6w-view-toggle">{views.map(btn)}</div>;
}

/**
 * Guided "add a step" flow. A sidebar toggles between **Apps** (pick app →
 * ensure a connection → pick action → fill params) and **Controls** — the
 * internal nodes: triggers, flow control (if/foreach/parallel/wait), and compute
 * (script/data). Emits a `BuiltStep` via `onAdd`.
 *
 * Data + IO come from `useW6WApi()`, so mount it under `<W6WUIProvider>`.
 */
export function StepBuilderModal({
  onClose,
  onAdd,
  onDraftChange,
  theme,
  appsOnly,
  title,
  workflowId,
  stepId,
  upstreamSteps = [],
  initialApp,
  initialAction,
  initialConnection,
  initialWith,
}: StepBuilderModalProps) {
  // Default to the apps the user already connected — no searching for the one
  // integration they use every day.
  const [tab, setTab] = useState<Tab>("connected");
  // When an app is selected the modal collapses to a single-app detail view:
  // the sidebar is hidden and the header switches to the app's name + icon.
  // Initialize with initialApp if provided to skip the app picker.
  const [selectedApp, setSelectedApp] = useState<AppSummary | null>(initialApp ?? null);
  // Same collapse for a chosen internal node (trigger / control / compute) — its
  // config form (dynamic ParamsForm over the node's schema) shows before adding.
  const [selectedNode, setSelectedNode] = useState<InternalNodeDef | null>(null);

  if (selectedNode) {
    return (
      <Modal
        title={selectedNode.label}
        titleIcon={<InternalIcon icon={selectedNode.icon} size={22} />}
        subtitle={
          <code>
            {selectedNode.app} · {selectedNode.action}
          </code>
        }
        onClose={onClose}
        size="xl"
        headerRight={
          <button
            type="button"
            className="w6w-btn w6w-btn-ghost"
            onClick={() => setSelectedNode(null)}
          >
            ← Back
          </button>
        }
      >
        <div className="w6w-stepbuilder-config">
          <ControlStepConfig
            node={selectedNode}
            onAdd={onAdd}
            onClose={onClose}
            onDraftChange={onDraftChange}
            workflowId={workflowId}
            upstreamSteps={upstreamSteps}
          />
        </div>
      </Modal>
    );
  }

  if (selectedApp) {
    return (
      <Modal
        title={selectedApp.displayName}
        subtitle={
          <>
            <code>{selectedApp.id}</code>
            {selectedApp.version && ` · v${selectedApp.version}`}
          </>
        }
        onClose={onClose}
        size="xl"
        titleIcon={
          <AppIcon
            src={selectedApp.iconSvg}
            srcDark={selectedApp.iconSvgDark}
            brandColor={selectedApp.brandColor}
            name={selectedApp.displayName}
            theme={theme}
            size={22}
          />
        }
      >
        <div className="w6w-stepbuilder-config">
          {/* App-switching lives in the Setup tab's "Change" (à la Zapier), not a
              top-right back button. */}
          <AppStepConfig
            appId={selectedApp.id}
            app={selectedApp}
            onAdd={onAdd}
            onClose={onClose}
            onDraftChange={onDraftChange}
            onChangeApp={() => setSelectedApp(null)}
            theme={theme}
            workflowId={workflowId}
            stepId={stepId}
            upstreamSteps={upstreamSteps}
            initialAction={initialAction}
            initialConnection={initialConnection}
            initialWith={initialWith}
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={title ?? "Add a step"} onClose={onClose} size="xl">
      <div className="w6w-stepbuilder">
        <nav className="w6w-stepbuilder-sidebar">
          <button
            type="button"
            className={`w6w-stepbuilder-tab${tab === "connected" ? " active" : ""}`}
            onClick={() => setTab("connected")}
          >
            Connected apps
          </button>
          <button
            type="button"
            className={`w6w-stepbuilder-tab${tab === "apps" ? " active" : ""}`}
            onClick={() => setTab("apps")}
          >
            Apps
          </button>
          <button
            type="button"
            className={`w6w-stepbuilder-tab${tab === "ai" ? " active" : ""}`}
            onClick={() => setTab("ai")}
          >
            AI
          </button>
          {!appsOnly && (
            <>
              <button
                type="button"
                className={`w6w-stepbuilder-tab${tab === "triggers" ? " active" : ""}`}
                onClick={() => setTab("triggers")}
              >
                Triggers
              </button>
              <button
                type="button"
                className={`w6w-stepbuilder-tab${tab === "controls" ? " active" : ""}`}
                onClick={() => setTab("controls")}
              >
                Controls
              </button>
              <button
                type="button"
                className={`w6w-stepbuilder-tab${tab === "utilities" ? " active" : ""}`}
                onClick={() => setTab("utilities")}
              >
                Utilities
              </button>
              <button
                type="button"
                className={`w6w-stepbuilder-tab${tab === "data" ? " active" : ""}`}
                onClick={() => setTab("data")}
              >
                Data
              </button>
            </>
          )}
        </nav>
        <div className="w6w-stepbuilder-content">
          {tab === "connected" ? (
            <ConnectedAppsFlow
              onSelectApp={setSelectedApp}
              onBrowseAll={() => setTab("apps")}
              theme={theme}
            />
          ) : tab === "apps" ? (
            <AppPicker onSelectApp={setSelectedApp} theme={theme} />
          ) : tab === "ai" ? (
            <AppPicker
              onSelectApp={setSelectedApp}
              theme={theme}
              filter={(a) => a.categories?.includes("ai") ?? false}
              searchPlaceholder="Search AI apps…"
              emptyMessage="No AI apps registered yet."
            />
          ) : tab === "triggers" ? (
            <TriggersFlow onSelect={setSelectedNode} />
          ) : tab === "controls" ? (
            <ControlsFlow onSelect={setSelectedNode} />
          ) : tab === "data" ? (
            <DataFlow onSelect={setSelectedNode} />
          ) : (
            <UtilitiesFlow onSelect={setSelectedNode} />
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Internal nodes tab (triggers, flow control, compute) ───────────────────

/** A flat, clickable list of internal nodes. Shared by Controls + Utilities. */
function NodeList({
  nodes,
  onSelect,
}: {
  nodes: InternalNodeDef[];
  onSelect: (node: InternalNodeDef) => void;
}) {
  return (
    <div className="w6w-stepbuilder-list">
      {nodes.map((n) => (
        <button
          key={`${n.app}:${n.action}`}
          type="button"
          className="w6w-stepbuilder-item"
          onClick={() => onSelect(n)}
        >
          <InternalIcon icon={n.icon} size={24} />
          <span className="w6w-stepbuilder-item-main">
            <strong>{n.label}</strong>
            <code className="w6w-muted w6w-small">
              {n.app} · {n.action}
            </code>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Triggers tab — entry nodes that start a workflow (manual, webhook, …). */
function TriggersFlow({ onSelect }: { onSelect: (node: InternalNodeDef) => void }) {
  const nodes = INTERNAL_NODES.filter((n) => n.group === "trigger");
  return (
    <div className="w6w-stack">
      <p className="w6w-muted w6w-small">
        Triggers start a workflow — run it manually or on an inbound webhook.
      </p>
      <NodeList nodes={nodes} onSelect={onSelect} />
    </div>
  );
}

/** Controls tab — engine-native flow control only (branch, loop, parallelize, wait). */
function ControlsFlow({ onSelect }: { onSelect: (node: InternalNodeDef) => void }) {
  const nodes = INTERNAL_NODES.filter((n) => n.group === "control");
  return (
    <div className="w6w-stack">
      <p className="w6w-muted w6w-small">
        Flow-control nodes branch, loop, parallelize, or pause the run.
      </p>
      <NodeList nodes={nodes} onSelect={onSelect} />
    </div>
  );
}

/** Utilities tab — compute + request nodes (script, HTTP, respond). The `@w6w/data`
 * node lives in its own **Data** tab, so exclude it here. */
function UtilitiesFlow({ onSelect }: { onSelect: (node: InternalNodeDef) => void }) {
  const nodes = INTERNAL_NODES.filter(
    (n) => n.group !== "control" && n.group !== "trigger" && n.app !== DATA_APP,
  );
  return (
    <div className="w6w-stack">
      <p className="w6w-muted w6w-small">
        Utilities run a script, call an HTTP(S) endpoint, or respond to a webhook.
      </p>
      <NodeList nodes={nodes} onSelect={onSelect} />
    </div>
  );
}

/** Data tab — the `@w6w/data` node: declare typed key/value variables for
 * downstream steps to reference. */
function DataFlow({ onSelect }: { onSelect: (node: InternalNodeDef) => void }) {
  const nodes = INTERNAL_NODES.filter((n) => n.app === DATA_APP);
  return (
    <div className="w6w-stack">
      <p className="w6w-muted w6w-small">
        Declare typed key/value variables for downstream steps to reference.
      </p>
      <NodeList nodes={nodes} onSelect={onSelect} />
    </div>
  );
}

/**
 * Config form for a chosen internal node — its schema rendered through the same
 * `ParamsForm` as app actions, seeded with the node's defaults. Emits the built
 * step on Add.
 */
export function ControlStepConfig({
  node,
  onAdd,
  onClose,
  onDraftChange,
  workflowId,
  upstreamSteps = [],
}: {
  node: InternalNodeDef;
  // biome-ignore lint/suspicious/noConfusingVoidType: see StepBuilderModalProps.onAdd, forwarded as-is.
  onAdd: (s: BuiltStep) => string | undefined | void;
  onClose: () => void;
  /** See {@link StepBuilderModalProps.onDraftChange}. */
  onDraftChange?: (id: string, step: BuiltStep) => void;
  workflowId?: string;
  /** The new step's known graph ancestors — see {@link StepBuilderModalProps.upstreamSteps}. */
  upstreamSteps?: ExpressionStepSource[];
}) {
  const [withValues, setWithValues] = useState<Record<string, unknown>>(() =>
    internalNodeDefaults(node.app, node.action),
  );
  // Internal nodes have no connection/action to pick, so there's no Setup tab —
  // just Configure + Test (flow-control nodes aren't testable standalone).
  const testable = !isControlApp(node.app);
  // The step-being-added's graph ancestors that carry a saved step-test, offered
  // as one-click seeds for the incoming state — the SAME pipeline `StepEditModal`
  // uses, so the Test tab here resolves `{{ steps.<id>.output.<field> }}` the
  // same way an existing step's Test tab does (T1.1.1). Only meaningful when the
  // builder was opened from a workflow canvas (`workflowId` present); the
  // Functions/Endpoints pickers pass no `workflowId` and no `upstreamSteps`.
  const seedSources = useSeedSources(workflowId ?? "", upstreamSteps, testable && !!workflowId);
  const testStartState = startStateFromSeeds(seedSources);
  const [tab, setTab] = useState<"configure" | "test">("configure");
  const [configView, setConfigView] = useState<ConfigView>("props");
  // Draft text backing the "code" (full-step, read-only) view.
  const [codeText, setCodeText] = useState("{}");
  // Draft text backing the "params-code" (params-only, writable) view.
  const [paramsCodeText, setParamsCodeText] = useState("{}");
  const [draftConfig, setDraftConfig] = useState<NodeConfig>({});
  const configComplete = requiredParamsFilled(node.params, withValues);

  // The id `onAdd` minted at commit time, once a control node's identity has
  // been committed to the graph this session. `null` until then (and forever,
  // for a caller that doesn't supply `onDraftChange` — the original one-shot
  // "Add step" behavior).
  const [committedId, setCommittedId] = useState<string | null>(null);
  const buildStep = (): BuiltStep => ({
    uses: { app: node.app, action: node.action },
    with: withValues,
    ...draftConfig,
  });

  // Mint — a control node has identity the instant it's picked (no Setup tab),
  // so commit it to the graph on mount, exactly once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mint fires once on mount only; buildStep/onAdd intentionally read fresh closure state without retriggering this effect.
  useEffect(() => {
    if (!onDraftChange) return;
    const id = onAdd(buildStep());
    if (id) setCommittedId(id);
  }, []);

  // Update — keep the already-committed node current on every subsequent field
  // change, instead of minting a duplicate via a second `onAdd` call.
  // biome-ignore lint/correctness/useExhaustiveDependencies: buildStep reads fresh closure state; only these fields should retrigger the update.
  useEffect(() => {
    if (!onDraftChange || committedId === null) return;
    onDraftChange(committedId, buildStep());
  }, [committedId, withValues, draftConfig]);

  const changeConfigView = (v: ConfigView) => {
    if (v === "code") setCodeText(stepToJson(buildStep()));
    else if (v === "params-code") setParamsCodeText(paramsToJson(buildStep()));
    setConfigView(v);
  };
  const add = () => onAdd(buildStep());

  return (
    <div className="w6w-stepconfig">
      <div className="w6w-tabsbar">
        <div className="w6w-subtabs">
          <button
            type="button"
            className={`w6w-subtab${tab === "configure" ? " active" : ""}`}
            onClick={() => setTab("configure")}
          >
            Configure
          </button>
          {testable && (
            <button
              type="button"
              disabled={!configComplete}
              title={configComplete ? undefined : "Fill the required fields first"}
              className={`w6w-subtab${tab === "test" ? " active" : ""}`}
              onClick={() => configComplete && setTab("test")}
            >
              Test
            </button>
          )}
        </div>
        <ConfigViewToggle
          view={configView}
          onChange={changeConfigView}
          disabled={tab !== "configure"}
        />
      </div>

      <div className="w6w-stepconfig-body">
        {tab === "configure" &&
          (configView === "props" ? (
            <ParamsForm params={node.params} values={withValues} onChange={setWithValues} />
          ) : configView === "code" ? (
            // Full step, read-only (D-3) — `stepToJson` is the ONE serializer,
            // shared with the two other code-view hosts.
            <JsonEditor
              value={codeText}
              onChange={() => {}}
              readOnly
              minHeight="240px"
              height="100%"
              aria-label="Step JSON"
            />
          ) : configView === "params-code" ? (
            <JsonEditor
              value={paramsCodeText}
              onChange={setParamsCodeText}
              minHeight="240px"
              height="100%"
              aria-label="Parameters JSON"
              onValidChange={(p) =>
                p &&
                typeof p === "object" &&
                !Array.isArray(p) &&
                setWithValues(p as Record<string, unknown>)
              }
            />
          ) : (
            <NodeConfigForm config={draftConfig} onChange={setDraftConfig} />
          ))}
        {tab === "test" &&
          testable &&
          (isTriggerApp(node.app) ? (
            <TriggerFillForm app={node.app} action={node.action} fields={withValues.fields} />
          ) : (
            <StepTestRun
              app={node.app}
              action={node.action}
              values={withValues}
              canRun={configComplete}
              state={testStartState}
            />
          ))}
      </div>

      {/* Footer — pinned to the modal bottom, outside the scroll area. */}
      <div className="w6w-modal-actions w6w-stepconfig-footer">
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        {tab === "configure" && testable ? (
          <button
            type="button"
            className="w6w-btn"
            disabled={!configComplete}
            onClick={() => setTab("test")}
          >
            Next →
          </button>
        ) : (
          <button type="button" className="w6w-btn" onClick={committedId !== null ? onClose : add}>
            {committedId !== null ? "Done" : "Add step"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Whether every required param has a usable value — gates the inline "Test run".
 * A required array (e.g. a `vars` table) may be empty (see the Data node); other
 * required fields must be non-empty.
 *
 * A param hidden by its own `showIf` is skipped, matching `ParamsForm`'s render
 * visibility — this is what lets `required` and `showIf` combine at all (e.g.
 * SendGrid's `contentValue`, required only when NOT using a dynamic template):
 * without it, a conditionally-required field would either block the gate in the
 * branch where it's moot, or (if left non-required to dodge that) never be
 * caught here and only surface as a raw runtime error from the app's own
 * `execute()` — the app was previously written the second way for exactly this
 * reason; that workaround was fixed alongside this once the gate learned `showIf`.
 */
export function requiredParamsFilled(
  params: ActionParam[],
  values: Record<string, unknown>,
): boolean {
  // Built once from the FULL top-level tree (not per-section) so a section
  // child's `showIf` can reference a sibling outside its own section — same
  // reasoning as `ParamsForm`'s `effective`.
  const flat = flattenParams(params);
  const effective = (key: string) =>
    values[key] !== undefined ? values[key] : flat.find((p) => p.key === key)?.default;

  const check = (list: ActionParam[]): boolean =>
    list.every((p) => {
      // A `section` is a layout-only container whose children write flat at this
      // level — recurse so a required child (e.g. a grouped Sender Email) still
      // gates. The section param itself carries no value.
      if (p.type === "section") return check(p.children ?? []);
      if (!p.required) return true;
      if (!isParamVisible(p, effective)) return true;
      const v = values[p.key] ?? p.default;
      if (v === undefined || v === null) return false;
      if (typeof v === "string") return v.trim() !== "";
      return true;
    });
  return check(params);
}

/**
 * Whether adding this step is gated on a **passing** saved test — the per-app
 * `testRequired` save-gate. Defaults to **required**; an app/node surface may
 * opt out by carrying `testRequired: false`.
 *
 * The flag is read defensively off the app/node surface because the core app
 * manifest does not carry a `testRequired` field yet (a recorded follow-up); an
 * absent flag therefore means **required**, so today every app step must pass a
 * test before it can be added.
 */
export function isTestRequired(surface: unknown): boolean {
  const flag = (surface as { testRequired?: unknown } | null | undefined)?.testRequired;
  return typeof flag === "boolean" ? flag : true;
}

type TestState =
  | { status: "running" }
  | { status: "done"; value: unknown; logs?: string[] }
  | { status: "error"; error: string; errorCode?: string; logs?: string[] };

/**
 * Where a test run should be persisted. When present, `StepTestRun` saves the
 * fixture (`saveStepTest`) and records the run's outcome (`recordStepTestRun`)
 * against the given workflow step after each invoke. `input` is the resolved
 * incoming state captured alongside the params (`values` → `with`). Absent in
 * the add-step builder (the step isn't in a workflow yet).
 */
export interface StepTestPersist {
  workflowId: string;
  stepId: string;
  input: Record<string, unknown>;
}

/** Imperative handle so a host (e.g. the step modal footer) can trigger the run. */
export interface StepTestRunHandle {
  run: () => void;
}

/**
 * Inline "Test run" — invokes the action/node with the current params (and, for
 * app actions, the chosen connection) so the user can try a step from inside the
 * builder before adding it. Pressable only once required fields are filled.
 *
 * When `persist` is supplied (the node editor's Test tab), each run also saves
 * the fixture and records the outcome server-side, so a step test becomes saved
 * and re-runnable. `hideRunButton` suppresses the inline button when the host
 * drives the run from elsewhere (the modal footer) via the imperative handle.
 */
export const StepTestRun = forwardRef<
  StepTestRunHandle,
  {
    app: string;
    action: string;
    connectionId?: string;
    values: Record<string, unknown>;
    canRun: boolean;
    hideRunButton?: boolean;
    persist?: StepTestPersist;
    /**
     * The run's start state — what the upstream steps last produced — so a
     * `values` entry written as `{{ steps.<id>.output.<field> }}` resolves
     * server-side instead of coming back empty. The host builds it (both the
     * node editor's Test tab and, since T1.1.1, the add-step builder's Test
     * tab seed it from the upstream fixtures, via `useSeedSources` +
     * `startStateFromSeeds`); absent only when the host itself has no upstream
     * steps to offer — the Functions/Endpoints pickers, which have no graph.
     */
    state?: StepStartState;
    /** Notified when the run starts/finishes so a host button can reflect it. */
    onBusyChange?: (busy: boolean) => void;
    /**
     * Notified with the outcome of each finished run (`true` = passed). Lets a
     * host satisfy the `testRequired` save-gate from an in-session test run.
     */
    onResult?: (passed: boolean) => void;
  }
>(function StepTestRun(
  {
    app,
    action,
    connectionId,
    values,
    canRun,
    hideRunButton,
    persist,
    state: startState,
    onBusyChange,
    onResult,
  },
  ref,
) {
  const api = useW6WApi();
  // Resolve document expressions against the workflow's selected project (the
  // editor provides it; undefined outside the editor → server default project).
  const project = useWorkflowProject();
  const [state, setState] = useState<TestState | null>(null);

  const run = async () => {
    if (!canRun || state?.status === "running") return;
    setState({ status: "running" });
    onBusyChange?.(true);
    let outcome: Exclude<TestState, { status: "running" }>;
    try {
      const result = await api.invokeAction(app, action, values, {
        ...(connectionId ? { connectionId } : {}),
        project,
        // Omitted when the host has no upstream state to offer, so the request
        // is unchanged for every caller that never had one.
        ...(startState ? { state: startState } : {}),
      });
      outcome = {
        status: "done",
        value: result.value,
        logs: (result as { logs?: string[] }).logs,
      };
    } catch (e) {
      const err = e as { message?: string; code?: string; logs?: string[] };
      outcome = {
        status: "error",
        error: err.message ?? String(e),
        errorCode: err.code,
        logs: err.logs,
      };
    }
    setState(outcome);
    onResult?.(outcome.status === "done");
    // Persist the fixture + record the outcome when the host targets a workflow
    // step. Best-effort: a failed save must never mask the run's own result.
    if (persist) {
      try {
        const saved = await api.saveStepTest(persist.workflowId, persist.stepId, {
          input: persist.input,
          with: values,
        });
        await api.recordStepTestRun(persist.workflowId, persist.stepId, {
          stepTestId: saved.id,
          status: outcome.status === "done" ? "succeeded" : "failed",
          input: persist.input,
          output: outcome.status === "done" ? outcome.value : undefined,
          error: outcome.status === "error" ? outcome.error : undefined,
        });
      } catch (err) {
        console.error("step test persist failed", err);
      }
    }
    onBusyChange?.(false);
  };

  useImperativeHandle(ref, () => ({ run }));

  const logs = state && state.status !== "running" ? state.logs : undefined;

  return (
    <div className="w6w-steptest">
      {!hideRunButton && (
        <div className="w6w-steptest-bar">
          <button
            type="button"
            className="w6w-btn w6w-btn-ghost"
            disabled={!canRun || state?.status === "running"}
            onClick={run}
          >
            {state?.status === "running" ? "Running…" : "▶ Test run"}
          </button>
          {!canRun && (
            <span className="w6w-muted w6w-small">Fill the required fields to test.</span>
          )}
        </div>
      )}
      {state?.status === "error" && (
        <div className="w6w-result w6w-error">
          {state.errorCode && (
            <div className="w6w-small" style={{ opacity: 0.75, marginBottom: 4 }}>
              <code>{state.errorCode}</code>
            </div>
          )}
          {state.error}
        </div>
      )}
      {state?.status === "done" && (
        <div className="w6w-testout">
          <div className="w6w-testout-label">Result (return value)</div>
          <pre
            className="w6w-result"
            style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto", margin: 0 }}
          >
            {JSON.stringify(state.value, null, 2)}
          </pre>
        </div>
      )}
      {logs && logs.length > 0 && (
        <div className="w6w-testout">
          <div className="w6w-testout-label">Console output</div>
          <pre
            className="w6w-result w6w-testout-console"
            style={{ whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", margin: 0 }}
          >
            {logs.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
});

// ── Connected apps tab (default) ─────────────────────────────────────────────

function ConnectedAppsFlow({
  onSelectApp,
  onBrowseAll,
  theme,
}: {
  onSelectApp: (app: AppSummary) => void;
  onBrowseAll: () => void;
  theme?: ThemeMode;
}) {
  const api = useW6WApi();
  const [connectedIds, setConnectedIds] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    api
      .listConnections()
      .then((conns) => !canceled && setConnectedIds(new Set(conns.map((c) => c.appId))))
      .catch((e) => !canceled && setError((e as Error).message));
    return () => {
      canceled = true;
    };
  }, [api]);

  if (error) {
    return (
      <div className="w6w-apppicker-host">
        <div className="w6w-result w6w-error">{error}</div>
      </div>
    );
  }
  if (connectedIds === null) {
    return (
      <div className="w6w-apppicker-host">
        <p className="w6w-muted w6w-small">Loading…</p>
      </div>
    );
  }

  return (
    <AppPicker
      onSelectApp={onSelectApp}
      theme={theme}
      search={false}
      filter={(a) => connectedIds.has(a.id)}
      emptyMessage="No connected apps yet. Browse all apps to add your first connection."
      emptyAction={
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onBrowseAll}>
          Browse all apps
        </button>
      }
    />
  );
}

export function AppStepConfig({
  appId,
  app,
  onAdd,
  onClose,
  onDraftChange,
  onChangeApp,
  theme,
  workflowId,
  stepId,
  upstreamSteps = [],
  initialAction,
  initialConnection,
  initialWith,
}: {
  appId: string;
  app?: AppSummary;
  // biome-ignore lint/suspicious/noConfusingVoidType: see StepBuilderModalProps.onAdd, forwarded as-is.
  onAdd: (s: BuiltStep) => string | undefined | void;
  onClose: () => void;
  /** See {@link StepBuilderModalProps.onDraftChange}. */
  onDraftChange?: (id: string, step: BuiltStep) => void;
  onChangeApp?: () => void;
  theme?: ThemeMode;
  workflowId?: string;
  stepId?: string;
  /** The new step's known graph ancestors — see {@link StepBuilderModalProps.upstreamSteps}. */
  upstreamSteps?: ExpressionStepSource[];
  /** Pre-selected action key, opens directly to Configure tab when provided with initialWith */
  initialAction?: string;
  /** Pre-selected connection id */
  initialConnection?: string;
  /** Pre-filled parameter values */
  initialWith?: Record<string, unknown>;
}) {
  const api = useW6WApi();
  const [auths, setAuths] = useState<AuthDef[] | null>(null);
  const [conns, setConns] = useState<ConnectionSummary[] | null>(null);
  const [actions, setActions] = useState<ActionDef[] | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [connectionId, setConnectionId] = useState<string>(initialConnection ?? "");
  const [actionKey, setActionKey] = useState<string>(initialAction ?? "");
  const [withValues, setWithValues] = useState<Record<string, unknown>>(initialWith ?? {});
  const [showConnModal, setShowConnModal] = useState(false);
  // Once a connection is chosen it renders as a static label; "Change" flips
  // back to the dropdown. No connection selected yet also forces the dropdown.
  const [changingConn, setChangingConn] = useState(false);
  // Setup (app + connection + action) / Configure (params) / Test — same tabs as
  // the node editor, so add + edit are consistent.
  // When initial values are provided, skip Setup and open directly to Configure.
  const [tab, setTab] = useState<StepConfigTab>(
    initialAction && initialWith ? "configure" : "setup"
  );
  // The Configure tab's four representations (form / full-step JSON /
  // params-only JSON / node settings).
  const [configView, setConfigView] = useState<ConfigView>("props");
  // Draft text backing the "code" (full-step, read-only) view.
  const [codeText, setCodeText] = useState("{}");
  // Draft text backing the "params-code" (params-only, writable) view.
  const [paramsCodeText, setParamsCodeText] = useState("{}");
  // Base node settings (retry / onError / notes) set on the Config view.
  const [draftConfig, setDraftConfig] = useState<NodeConfig>({});

  // Load auth methods, existing connections, and actions for the app in parallel.
  useEffect(() => {
    let canceled = false;
    setMetaError(null);
    Promise.all([api.getAppAuth(appId), api.listConnectionsForApp(appId), api.getAppActions(appId)])
      .then(([au, co, ac]) => {
        if (canceled) return;
        setAuths(au);
        setConns(co);
        setActions(ac);
        if (co.length > 0) setConnectionId(co[0].id);
      })
      .catch((e) => !canceled && setMetaError((e as Error).message));
    return () => {
      canceled = true;
    };
  }, [api, appId]);

  const refetchConns = async () => {
    const co = await api.listConnectionsForApp(appId);
    setConns(co);
    if (co.length > 0) setConnectionId((prev) => prev || co[0].id);
  };

  const availableAuths = (auths ?? []).filter((a) => a.available !== false);
  const needsConnection = availableAuths.length > 0;
  const hasConnection = (conns ?? []).length > 0;
  const selectedAction = (actions ?? []).find((a) => a.key === actionKey);
  // Alphabetical by display title (falling back to key) so the dropdown is
  // scannable regardless of the manifest's declaration order.
  const sortedActions = [...(actions ?? [])].sort((a, b) =>
    (a.title ?? a.key).localeCompare(b.title ?? b.key, undefined, { sensitivity: "base" }),
  );

  // Per-app `testRequired` save-gate — defaults to required, read off the app
  // surface. `testPassed` is satisfied either by an in-session passing test run
  // (below) or by a previously-saved passing test discovered via `listStepTests`
  // when the builder carries a workflow-step context.
  const testRequired = isTestRequired(app);
  const [testPassed, setTestPassed] = useState(false);
  useEffect(() => {
    if (!testRequired || !workflowId || !stepId) return;
    let canceled = false;
    api
      .listStepTests(workflowId, stepId)
      .then((tests) => {
        if (!canceled && tests.some((t) => t.lastRunStatus === "succeeded")) setTestPassed(true);
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [api, testRequired, workflowId, stepId]);

  // The step-being-added's graph ancestors that carry a saved step-test,
  // offered as one-click seeds for the incoming state — the SAME pipeline
  // `StepEditModal` uses, so the Test tab here resolves
  // `{{ steps.<id>.output.<field> }}` the same way an existing step's Test
  // tab does (T1.1.1). Only meaningful when the builder was opened from a
  // workflow canvas (`workflowId` present); the Functions/Endpoints pickers
  // pass no `workflowId` and no `upstreamSteps`.
  const seedSources = useSeedSources(workflowId ?? "", upstreamSteps, !!workflowId);
  const testStartState = startStateFromSeeds(seedSources);

  const connectionSatisfied = !needsConnection || (hasConnection && !!connectionId);
  // Setup is done when an action is picked and its connection (if any) is set;
  // Configure is done when the action's required params are filled.
  const setupComplete = !!actionKey && connectionSatisfied;
  const configComplete =
    setupComplete &&
    !!selectedAction &&
    requiredParamsFilled(selectedAction.params ?? [], withValues);
  // HITL-1 amendment: a passing test is required to *publish* (T4.2.1), not to
  // add the step to the graph — `testRequired`/`testPassed` still drive the
  // Test tab's own "test passed" messaging below.
  const canAdd = setupComplete;

  const selectedConn = (conns ?? []).find((c) => c.id === connectionId);
  // Show the dropdown only before a connection is picked or while changing it;
  // otherwise the selected connection reads as a compact label.
  const showConnPicker = changingConn || !connectionId;

  function buildStep(): BuiltStep {
    return {
      uses: {
        app: appId,
        action: selectedAction?.key ?? actionKey,
        ...(needsConnection && connectionId ? { connection: connectionId } : {}),
      },
      with: withValues,
      ...draftConfig,
    };
  }
  function add() {
    if (!selectedAction) return;
    onAdd(buildStep());
  }

  // The id `onAdd` minted at commit time, once Setup has completed this
  // session. `null` until then (and forever, for a caller that doesn't supply
  // `onDraftChange` — the original one-shot "Add step" behavior).
  const [committedId, setCommittedId] = useState<string | null>(null);

  // Mint — the moment Setup first completes (action + connection, if needed),
  // commit the WIP step to the graph, exactly once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: buildStep/onAdd intentionally read fresh closure state; only the mint gate should retrigger this effect.
  useEffect(() => {
    if (!onDraftChange || committedId !== null || !setupComplete) return;
    const id = onAdd(buildStep());
    if (id) setCommittedId(id);
  }, [onDraftChange, committedId, setupComplete]);

  // Update — keep the already-committed node current on every subsequent field
  // change, instead of minting a duplicate via a second `onAdd` call.
  // biome-ignore lint/correctness/useExhaustiveDependencies: buildStep reads fresh closure state; only these fields should retrigger the update.
  useEffect(() => {
    if (!onDraftChange || committedId === null) return;
    onDraftChange(committedId, buildStep());
  }, [committedId, withValues, draftConfig, connectionId]);

  const changeConfigView = (v: ConfigView) => {
    if (v === "code") setCodeText(stepToJson(buildStep()));
    else if (v === "params-code") setParamsCodeText(paramsToJson(buildStep()));
    setConfigView(v);
  };

  return (
    <div className="w6w-stepconfig">
      {/* Tabs bar — full width: Setup/Configure/Test on the left, the props/code/
          config view icons on the right (enabled only on the Configure tab). */}
      <div className="w6w-tabsbar">
        <div className="w6w-subtabs">
          <button
            type="button"
            className={`w6w-subtab${tab === "setup" ? " active" : ""}`}
            onClick={() => setTab("setup")}
          >
            Setup
          </button>
          <button
            type="button"
            disabled={!setupComplete}
            title={setupComplete ? undefined : "Complete Setup first"}
            className={`w6w-subtab${tab === "configure" ? " active" : ""}`}
            onClick={() => setupComplete && setTab("configure")}
          >
            Configure
          </button>
          <button
            type="button"
            disabled={!configComplete}
            title={configComplete ? undefined : "Fill the required fields first"}
            className={`w6w-subtab${tab === "test" ? " active" : ""}`}
            onClick={() => configComplete && setTab("test")}
          >
            Test
          </button>
        </div>
        <ConfigViewToggle
          view={configView}
          onChange={changeConfigView}
          disabled={tab !== "configure"}
        />
      </div>

      <div className="w6w-stepconfig-body">
        {/* Setup — app, connection, action. */}
        {tab === "setup" && (
          <div className="w6w-stack">
            {metaError && <div className="w6w-result w6w-error">{metaError}</div>}
            {auths === null && !metaError && <p className="w6w-muted w6w-small">Loading…</p>}

            {/* App — click Change to go back to the app picker. */}
            <div className="w6w-field">
              <span>App</span>
              <div className="w6w-conn-label">
                {app && (
                  <AppIcon
                    src={app.iconSvg}
                    srcDark={app.iconSvgDark}
                    brandColor={app.brandColor}
                    name={app.displayName}
                    theme={theme}
                    size={20}
                  />
                )}
                <span className="w6w-conn-label-name">{app?.displayName ?? appId}</span>
                {onChangeApp && (
                  <button
                    type="button"
                    className="w6w-btn w6w-btn-ghost w6w-btn-sm"
                    onClick={onChangeApp}
                  >
                    Change
                  </button>
                )}
              </div>
            </div>

            {/* Connection */}
            {auths !== null &&
              needsConnection &&
              (!hasConnection ? (
                <div className="w6w-result w6w-stepconfig-conn-empty">
                  <div style={{ marginBottom: 8 }}>
                    This app needs a connection before its actions can run.
                  </div>
                  <button type="button" className="w6w-btn" onClick={() => setShowConnModal(true)}>
                    Create connection
                  </button>
                </div>
              ) : showConnPicker ? (
                <label className="w6w-field">
                  <span>Connection</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select
                      value={connectionId}
                      onChange={(e) => {
                        setConnectionId(e.target.value);
                        setChangingConn(false);
                      }}
                      style={{ flex: 1 }}
                    >
                      {(conns ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.displayName || c.id} {c.state ? `(${c.state})` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="w6w-btn w6w-btn-ghost"
                      onClick={() => setShowConnModal(true)}
                    >
                      + New
                    </button>
                  </div>
                </label>
              ) : (
                <div className="w6w-field">
                  <span>Connection</span>
                  <div className="w6w-conn-label">
                    <span className="w6w-conn-label-name">
                      {selectedConn?.displayName || selectedConn?.id || connectionId}
                      {selectedConn?.state ? ` (${selectedConn.state})` : ""}
                    </span>
                    <button
                      type="button"
                      className="w6w-btn w6w-btn-ghost w6w-btn-sm"
                      onClick={() => setChangingConn(true)}
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      className="w6w-btn w6w-btn-ghost w6w-btn-sm"
                      onClick={() => setShowConnModal(true)}
                    >
                      + New
                    </button>
                  </div>
                </div>
              ))}

            {/* Action */}
            {actions !== null &&
              (actions.length === 0 ? (
                <p className="w6w-muted w6w-small">This app exposes no actions.</p>
              ) : (
                <label className="w6w-field">
                  <span>Action{actionKey ? "" : " *"}</span>
                  <select
                    value={actionKey}
                    onChange={(e) => {
                      setActionKey(e.target.value);
                      setWithValues({});
                      // A new action hasn't been tested — re-arm the save-gate.
                      setTestPassed(false);
                    }}
                  >
                    <option value="">— pick an action —</option>
                    {sortedActions.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.title ?? a.key} ({a.key})
                      </option>
                    ))}
                  </select>
                  {selectedAction?.description && (
                    <span className="w6w-hint">{selectedAction.description}</span>
                  )}
                </label>
              ))}
          </div>
        )}

        {/* Configure — the action's config, as a form (props), the full step
            (code), the params alone (params-code), or the base node settings
            (config). */}
        {tab === "configure" &&
          (!selectedAction ? (
            <p className="w6w-muted w6w-small">Pick an action in Setup first.</p>
          ) : configView === "props" ? (
            <ParamsForm
              params={selectedAction.params ?? []}
              values={withValues}
              onChange={setWithValues}
            />
          ) : configView === "code" ? (
            // Full step, read-only (D-3) — `stepToJson` is the ONE serializer,
            // shared with the two other code-view hosts.
            <JsonEditor
              value={codeText}
              onChange={() => {}}
              readOnly
              minHeight="240px"
              height="100%"
              aria-label="Step JSON"
            />
          ) : configView === "params-code" ? (
            <JsonEditor
              value={paramsCodeText}
              onChange={setParamsCodeText}
              minHeight="240px"
              height="100%"
              aria-label="Parameters JSON"
              onValidChange={(p) =>
                p &&
                typeof p === "object" &&
                !Array.isArray(p) &&
                setWithValues(p as Record<string, unknown>)
              }
            />
          ) : (
            <NodeConfigForm config={draftConfig} onChange={setDraftConfig} />
          ))}

        {/* Test — try the action with the current params. */}
        {tab === "test" &&
          (selectedAction ? (
            <StepTestRun
              app={appId}
              action={selectedAction.key}
              connectionId={needsConnection && connectionId ? connectionId : undefined}
              values={withValues}
              canRun={
                setupComplete && requiredParamsFilled(selectedAction.params ?? [], withValues)
              }
              state={testStartState}
              onResult={setTestPassed}
            />
          ) : (
            <p className="w6w-muted w6w-small">Pick an action in Setup first.</p>
          ))}
      </div>

      {/* Test-required note — always rendered while on the Test tab, as a
          sibling ABOVE the footer, so the footer's two buttons never move
          whether the note has text or not (the row's reserved min-height
          keeps both states geometrically identical). */}
      {tab === "test" && (
        <div className="w6w-stepconfig-testnote">
          {testRequired && !testPassed && (
            <span className="w6w-muted w6w-small">
              Not yet tested — a passing test is required before this step can be published.
            </span>
          )}
        </div>
      )}

      {/* Footer — pinned to the modal bottom. Each tab has a Next button; the
          last (Test) commits the step. */}
      <div className="w6w-modal-actions w6w-stepconfig-footer">
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        {tab === "test" ? (
          <button
            type="button"
            className="w6w-btn"
            disabled={committedId === null && !canAdd}
            onClick={committedId !== null ? onClose : add}
          >
            {committedId !== null ? "Done" : "Add step"}
          </button>
        ) : (
          <button
            type="button"
            className="w6w-btn"
            disabled={tab === "setup" ? !setupComplete : !configComplete}
            onClick={() => setTab(tab === "setup" ? "configure" : "test")}
          >
            Next →
          </button>
        )}
      </div>

      {showConnModal && (
        <AddConnectionModal
          theme={theme}
          initialAppId={appId}
          onClose={() => setShowConnModal(false)}
          onCreated={async ({ connectionId: id }) => {
            setShowConnModal(false);
            setConnectionId(id);
            setChangingConn(false);
            await refetchConns();
          }}
        />
      )}
    </div>
  );
}
