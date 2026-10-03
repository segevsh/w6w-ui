import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ExecutionDetailValue } from "./ExecutionDetail.tsx";
import { ExecutionDetail } from "./ExecutionDetail.tsx";
import type { ExecutionLogStep } from "./ExecutionLogPanel.tsx";

const STEPS: ExecutionLogStep[] = [
  {
    id: "step-1",
    label: "Fetch contact",
    status: "succeeded",
    startedAt: "2026-09-22T10:00:00Z",
    finishedAt: "2026-09-22T10:00:01Z",
    input: { contactId: "c_123" },
    output: { email: "ada@example.com" },
  },
  {
    id: "step-2",
    label: "Send welcome email",
    status: "failed",
    startedAt: "2026-09-22T10:00:01Z",
    finishedAt: "2026-09-22T10:00:02Z",
    input: { to: "ada@example.com" },
  },
  {
    id: "step-3",
    label: "Notify Slack",
    status: "running",
    startedAt: "2026-09-22T10:00:02Z",
  },
  {
    id: "step-4",
    label: "Log completion",
    status: "pending",
  },
];

const SUCCEEDED: ExecutionDetailValue = {
  id: "run_01J8Z3K4",
  kind: "function",
  callableName: "fetch-contact",
  status: "succeeded",
  startedAt: "2026-09-22T10:00:00Z",
  finishedAt: "2026-09-22T10:00:01.254Z",
  durationMs: 1254,
  input: { contactId: "c_123", includeArchived: false },
  output: { id: "c_123", email: "ada@example.com" },
};

const FAILED: ExecutionDetailValue = {
  id: "run_01J8Z3K5",
  kind: "endpoint",
  callableName: "POST /v1/contacts",
  status: "failed",
  startedAt: "2026-09-21T18:44:02Z",
  finishedAt: "2026-09-21T18:44:03.4Z",
  durationMs: 1400,
  input: { email: "not-an-email" },
  error: { code: "INVALID_EMAIL", message: 'Invalid value for "email".' },
};

const WORKFLOW: ExecutionDetailValue = {
  id: "run_01J8Z3K6",
  kind: "workflow",
  callableName: "welcome-email",
  status: "running",
  startedAt: "2026-09-22T10:02:11Z",
  finishedAt: null,
  durationMs: null,
  input: { userId: "u_42" },
  steps: STEPS,
};

const meta = {
  title: "Components/ExecutionDetail",
  component: ExecutionDetail,
  args: { execution: SUCCEEDED },
} satisfies Meta<typeof ExecutionDetail>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A successful function call: input and output, no error section, no steps. */
export const FunctionCall: Story = {};

/** A failed endpoint call: the run-level error renders as JSON beside the
 * failed pill. */
export const FailedWithError: Story = {
  args: { execution: FAILED },
};

/** A workflow run: the per-step list sits above the run's own input, and the
 * run is still going (`Finished`/`Duration` read `—`). `onOpenInEditor` is what
 * renders the "Open in visual editor" button, so both callbacks are wired here
 * — this is the story that shows the header's controls. */
export const WorkflowRun: Story = {
  args: { execution: WORKFLOW, onOpenInEditor: () => {}, onClose: () => {} },
};

/** Loading: no execution yet, so the detail says so rather than rendering an
 * empty shell. */
export const Loading: Story = {
  args: { execution: null, loading: true },
};

/** A failed fetch: the error is a view-level alert and the execution is `null`. */
export const LoadFailed: Story = {
  args: {
    execution: null,
    errorMessage: "Could not load this execution.",
    onClose: () => {},
  },
};
