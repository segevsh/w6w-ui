/**
 * Provider + hook that give every component a single, typed w6w API client.
 *
 * Consumers wrap their app once and every component under it can grab the
 * client via `useW6wApi()` — no more per-component callback prop drilling.
 *
 *   const api = createW6wApi({ baseUrl: "/api", token });
 *   <W6wUIProvider api={api}>...</W6wUIProvider>
 */
import { type ReactNode, createContext, useContext } from "react";
import type {
  ActionDef,
  ApiCallRecord,
  AppSummary,
  AuthDef,
  ConnectionSummary,
  SavedTest,
} from "./types.ts";

/**
 * A single tester-run summary from the unified `run_log` ledger, keyed to a
 * connection. Thin by design — the full result payload stays server-side in
 * `saved_test_runs`; this is the history row shown in the test screens.
 * `summary` is null when the run recorded no summary; `occurredAt` is ISO.
 */
export interface TestRunSummary {
  id: string;
  actionKey: string;
  ok: boolean;
  summary: string | null;
  occurredAt: string;
}

/**
 * A saved per-step test fixture — a reusable, project-owned named capture of a
 * workflow step's resolved incoming state (`input`) and its params (`with`),
 * keyed by `(workflowId, stepId)`. Mirrors the connection-scoped `SavedTest`,
 * re-keyed to a workflow step. `lastRun*` denormalizes the most recent run.
 */
export interface StepTest {
  id: string;
  workflowId: string;
  stepId: string;
  name: string | null;
  input: Record<string, unknown>;
  with: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /** When this fixture was last run (ISO), or null/undefined if never run. */
  lastRunAt?: string | null;
  /** The most recent run's status (e.g. `succeeded`/`failed`), or null. */
  lastRunStatus?: string | null;
  /** The most recent run's error payload, or null when it succeeded/never ran. */
  lastRunError?: unknown;
}

/**
 * The surface every w6w-io component may call. Grows as we add components;
 * new members are added at the end so consumer implementations only need to
 * grow when they want to use the new component.
 */
export interface W6wApi {
  /** List registered apps to pick from in the connection modal. */
  listApps(): Promise<AppSummary[]>;

  /** Load auth methods declared by an app's manifest, with availability flags. */
  getAppAuth(appId: string): Promise<AuthDef[]>;

  /** Create a non-OAuth connection with a user-supplied credential. */
  createConnection(
    appId: string,
    body: {
      authKey: string;
      credential: Record<string, unknown>;
      displayName?: string;
      profile?: Record<string, unknown>;
    },
  ): Promise<ConnectionSummary>;

  /**
   * Start an OAuth 2.0 flow. Server builds the provider's authorize URL and
   * returns it; the caller opens it in a popup and awaits the server's
   * callback message (see `startOAuthPopup`).
   */
  startAppOAuthFlow(
    appId: string,
    authKey: string,
    body: { displayName?: string },
  ): Promise<{ authorizationUrl: string }>;

  /** List the actions an app exposes, to pick from in the step builder. */
  getAppActions(appId: string): Promise<ActionDef[]>;

  /** List the connections that already exist for a given app. */
  listConnectionsForApp(appId: string): Promise<ConnectionSummary[]>;

  /** List every connection across apps — drives the "Connected apps" tab. */
  listConnections(): Promise<ConnectionSummary[]>;

  /**
   * Invoke a single action — used to test-run one step from the visual editor.
   * Pass `connectionId` to run with a stored connection's credential. Pass
   * `project` to resolve document expressions against the workflow's selected
   * project (omitted → the scope's default/starter project).
   *
   * `apiCalls` carries the outbound HTTP calls the action made (redacted); a
   * failed invoke rejects with an `ApiError` whose `body` holds the same field.
   */
  invokeAction(
    appId: string,
    actionKey: string,
    params: Record<string, unknown>,
    opts?: { connectionId?: string; project?: string },
  ): Promise<{ value: unknown; logs?: string[]; apiCalls?: ApiCallRecord[] }>;

  /** List the saved action-test inputs stored against a connection. */
  listSavedTests(connectionId: string): Promise<SavedTest[]>;

  /** Save a new set of action-test inputs against a connection. */
  createSavedTest(
    connectionId: string,
    body: { actionKey: string; name: string; values: Record<string, unknown> },
  ): Promise<SavedTest>;

  /** Rename a saved test or replace its stored input values. */
  updateSavedTest(
    connectionId: string,
    id: string,
    patch: { name?: string; values?: Record<string, unknown> },
  ): Promise<SavedTest>;

  /** Delete a saved test by id. */
  deleteSavedTest(connectionId: string, id: string): Promise<void>;

  /**
   * Record the outcome of an action-test run against a connection. Appends a
   * run-log row server-side; when `savedTestId` is present the saved test's
   * `lastRun*` fields are updated too. POSTs to `/connections/:connId/test-runs`.
   */
  recordTestRun(
    connId: string,
    body: {
      savedTestId?: string | null;
      actionKey: string;
      ok: boolean;
      summary?: string;
      result?: unknown;
    },
  ): Promise<void>;

  /**
   * List a connection's recent tester-run history from the unified `run_log`
   * ledger (`GET /connections/:connId/test-runs` → the `.runs` array). Powers
   * the run-history list in the test screens, complementing the per-test
   * `lastRun*` badge with the full ledger.
   *
   * OPTIONAL: consumers that don't render history (or haven't wired it up yet)
   * may omit it, so a missing member never poisons their typecheck. Callers
   * MUST guard on its presence before invoking.
   */
  listTestRuns?(connectionId: string): Promise<TestRunSummary[]>;

  /**
   * Save a reusable per-step test fixture against a workflow step. Captures the
   * resolved incoming state (`input`) and the step's params (`with`); the server
   * stores both verbatim, project-owned. Mirrors `createSavedTest`, re-keyed from
   * a connection to a `(workflowId, stepId)`. POSTs to
   * `/workflows/:workflowId/steps/:stepId/tests`.
   */
  saveStepTest(
    workflowId: string,
    stepId: string,
    body: { name?: string; input: Record<string, unknown>; with: Record<string, unknown> },
  ): Promise<StepTest>;

  /**
   * Record the outcome of a step-test run so every run (saved or ad-hoc) is
   * logged authoritatively server-side. The run row mirrors `node_executions`
   * (status/input/output/error). When `stepTestId` is present the fixture's
   * `lastRun*` fields are updated too. Mirrors `recordTestRun`, re-keyed to a
   * workflow step. POSTs to `/workflows/:workflowId/steps/:stepId/test-runs`.
   */
  recordStepTestRun(
    workflowId: string,
    stepId: string,
    body: {
      stepTestId?: string | null;
      status: string;
      input?: unknown;
      output?: unknown;
      error?: unknown;
    },
  ): Promise<void>;

  /**
   * List the saved test fixtures for a workflow step (project-owned, not
   * subject-filtered). Added now so the ui-only incoming-state picker and
   * test-gate tasks need no further studio change. Mirrors `listSavedTests`,
   * re-keyed to a `(workflowId, stepId)`. GETs
   * `/workflows/:workflowId/steps/:stepId/tests`.
   */
  listStepTests(workflowId: string, stepId: string): Promise<StepTest[]>;
}

const Ctx = createContext<W6wApi | null>(null);

export interface W6wUIProviderProps {
  api: W6wApi;
  children: ReactNode;
}

/** Provides the w6w API client to every component under it. */
export function W6wUIProvider({ api, children }: W6wUIProviderProps) {
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/**
 * Access the w6w API client. Throws a helpful error if used outside a
 * `<W6wUIProvider>` — the common mistake is forgetting to wrap the app root.
 */
export function useW6wApi(): W6wApi {
  const api = useContext(Ctx);
  if (!api) {
    throw new Error(
      "useW6wApi must be used inside <W6wUIProvider>. " +
        "Wrap your app root with <W6wUIProvider api={api}>...</W6wUIProvider>.",
    );
  }
  return api;
}

/**
 * The workflow's currently-selected project id, provided by the editor so an
 * ad-hoc test-invoke resolves document expressions against that project (not the
 * scope's default/starter project). `undefined` — no project provided — keeps the
 * server's default-project behavior. Deliberately not throwing when absent: test
 * panels render outside the editor too (e.g. connection screens).
 */
const WorkflowProjectCtx = createContext<string | undefined>(undefined);

/** Scopes test-invokes under it to `project`; the editor wraps its body with this. */
export function WorkflowProjectProvider({
  project,
  children,
}: {
  project?: string;
  children: ReactNode;
}) {
  return <WorkflowProjectCtx.Provider value={project}>{children}</WorkflowProjectCtx.Provider>;
}

/** The selected workflow project id in scope, or `undefined` outside the editor. */
export function useWorkflowProject(): string | undefined {
  return useContext(WorkflowProjectCtx);
}
