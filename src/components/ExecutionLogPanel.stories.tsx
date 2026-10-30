import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ExecutionLogStep } from "./ExecutionLogPanel.tsx";
import { ExecutionLogPanel } from "./ExecutionLogPanel.tsx";

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
  {
    id: "step-5",
    label: "Archive record",
    status: "skipped",
  },
];

const meta = {
  title: "Executions/ExecutionLogPanel",
  component: ExecutionLogPanel,
  args: { steps: STEPS },
} satisfies Meta<typeof ExecutionLogPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { steps: [] },
};

/** `emptyLabel` overrides the default "No nodes have run yet." text. */
export const CustomEmptyLabel: Story = {
  args: { steps: [], emptyLabel: "This workflow hasn't run yet." },
};

/** All 5 `StepStatus` values, including a `failed` step. */
export const Populated: Story = {};

/** `onDismiss` grows a header row with a dismiss control. */
export const Dismissible: Story = {
  args: { onDismiss: () => {} },
};

/** A failed step's `error` reads without expanding its row — with and without input. */
export const FailedStep: Story = {
  args: {
    steps: [
      STEPS[0],
      {
        id: "step-2",
        label: "Send welcome email",
        status: "failed",
        startedAt: "2026-09-22T10:00:01Z",
        finishedAt: "2026-09-22T10:00:02Z",
        input: { to: "" },
        error: { code: "execute_error", message: "`toEmail` is required" },
      },
      {
        id: "step-3",
        label: "Notify Slack",
        status: "failed",
        startedAt: "2026-09-22T10:00:02Z",
        finishedAt: "2026-09-22T10:00:02Z",
        error: { message: "Slack returned 403: channel_not_found" },
      },
    ],
  },
};

/** `runError` with no steps — the run failed before any step ran. */
export const RunFailedBeforeAnyStep: Story = {
  args: {
    steps: [],
    runError: { code: "plan_invalid", message: "Step `notify` references unknown step `fetch`." },
    onDismiss: () => {},
  },
};

/** `stepErrors` — failures the run recorded and moved past, listed above the steps. */
export const RecordedStepErrors: Story = {
  args: {
    steps: [STEPS[0], { ...STEPS[1], status: "skipped", input: undefined }],
    stepErrors: [
      {
        stepId: "step-2",
        label: "Send welcome email",
        error: { code: "rate_limited", message: "Mail provider rate limit hit; continued." },
      },
      { stepId: "step-6", error: { message: "Webhook timed out after 30s; continued." } },
    ],
  },
};

const FOREACH_ITERATIONS = (failAt: number | null): ExecutionLogStep["iterations"] =>
  [0, 1, 2, 3, 4, 5].map((index) => {
    const failed = index === failAt;
    return {
      index,
      status: failed ? ("failed" as const) : ("succeeded" as const),
      ...(failed ? { failedNodeId: "update_event_ticket_1" } : {}),
      steps: [
        {
          id: "map_ticket_1",
          label: "Map ticket",
          status: "succeeded" as const,
          input: { ticket: `t${index}` },
          output: { mapped: `m${index}` },
        },
        {
          id: "update_event_ticket_1",
          label: "Update ticket",
          status: failed ? ("failed" as const) : ("succeeded" as const),
          input: { id: `t${index}` },
          ...(failed
            ? { error: { code: "E_TICKET", message: `Ticket t${index} no longer exists` } }
            : {}),
        },
      ],
    };
  });

/** A For each that ran 6 iterations, all succeeded — the last is preselected. */
export const ForEachIterations: Story = {
  args: {
    steps: [
      {
        id: "f0",
        label: "Each ticket",
        status: "succeeded",
        iterations: FOREACH_ITERATIONS(null),
        iterationsTotal: 6,
        iterationsFailed: 0,
      },
    ],
  },
};

/** Iteration 3 failed in the second body step — the summary points at it and it is preselected. */
export const ForEachIterationFailed: Story = {
  args: {
    steps: [
      {
        id: "f0",
        label: "Each ticket",
        status: "failed",
        iterations: FOREACH_ITERATIONS(3),
        iterationsTotal: 6,
        iterationsFailed: 1,
      },
    ],
  },
};
