import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ExecutionListItem } from "./ExecutionList.tsx";
import { ExecutionList } from "./ExecutionList.tsx";

const ITEMS: ExecutionListItem[] = [
  {
    id: "run_01J8Z3K4",
    kind: "function",
    callableName: "fetch-contact",
    status: "succeeded",
    startedAt: "2026-09-22T10:00:00Z",
    durationMs: 1254,
  },
  {
    id: "run_01J8Z3K5",
    kind: "workflow",
    callableName: "welcome-email",
    status: "running",
    startedAt: "2026-09-22T10:02:11Z",
    durationMs: null,
  },
  {
    id: "run_01J8Z3K6",
    kind: "endpoint",
    callableName: "POST /v1/contacts",
    status: "failed",
    startedAt: "2026-09-21T18:44:02Z",
    durationMs: 125400,
  },
  {
    id: "run_01J8Z3K7",
    kind: "workflow",
    callableName: "nightly-sync",
    status: "canceled",
    startedAt: "2026-09-21T03:00:00Z",
    durationMs: 60000,
  },
  {
    id: "run_01J8Z3K8",
    kind: "function",
    callableName: "send-welcome-email",
    status: "queued",
    startedAt: "2026-09-21T02:59:58Z",
    durationMs: null,
  },
];

const meta = {
  title: "Executions/ExecutionList",
  component: ExecutionList,
  args: { items: ITEMS },
} satisfies Meta<typeof ExecutionList>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The project-wide view: the callable's name is the title, its kind and start
 * time the subtitle. */
export const ProjectWide: Story = {
  args: { showCallable: true },
};

/** The per-callable view: the callable is already known from the page, so the
 * title is the start time and the subtitle is the run id. The second row is
 * selected (`selectedId`), which is what makes it `aria-pressed`. */
export const PerCallable: Story = {
  args: { selectedId: "run_01J8Z3K5", onSelect: () => {} },
};

export const Empty: Story = {
  args: { items: [] },
};

/** `loading` with an empty page renders the loading branch instead. */
export const Loading: Story = {
  args: { items: [], loading: true },
};

/** The pager renders off the callbacks alone: `Prev` is disabled because this
 * page is the first, `Next` is not. */
export const WithPager: Story = {
  args: {
    items: ITEMS,
    showCallable: true,
    selectedId: "run_01J8Z3K6",
    onSelect: () => {},
    hasPrev: false,
    hasNext: true,
    onPrev: () => {},
    onNext: () => {},
  },
};
