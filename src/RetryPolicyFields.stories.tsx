import type { Meta, StoryObj } from "@storybook/react-vite";
import { RetryPolicyFields, type RetryPolicyValue } from "./RetryPolicyFields.tsx";

const SET: RetryPolicyValue = { maxAttempts: 3, delayMs: 1000, backoff: "exponential" };

const meta = {
  title: "Forms/RetryPolicyFields",
  component: RetryPolicyFields,
  args: { value: undefined, onChange: () => {} },
} satisfies Meta<typeof RetryPolicyFields>;

export default meta;

type Story = StoryObj<typeof meta>;

/** `value` undefined — unchecked, no Attempts/Delay/Backoff row. */
export const Unchecked: Story = {};

/** `value` set — the Attempts/Delay (ms)/Backoff row shows. */
export const Checked: Story = {
  args: { value: SET },
};

/** Every control renders disabled/non-editable. */
export const ReadOnly: Story = {
  args: { value: SET, readOnly: true },
};

/** A Function's retry policy — the helper line names the function call. */
export const FunctionTarget: Story = {
  args: { value: SET, target: "function" },
};

/** An Endpoint's retry policy. */
export const EndpointTarget: Story = {
  args: { value: SET, target: "endpoint" },
};

/** A whole-workflow-run retry policy. */
export const WorkflowTarget: Story = {
  args: { value: SET, target: "workflow" },
};
