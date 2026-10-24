import type { Meta, StoryObj } from "@storybook/react-vite";
import { BudgetMeter } from "./BudgetMeter.tsx";

const meta: Meta<typeof BudgetMeter> = { title: "Components/BudgetMeter", component: BudgetMeter };
export default meta;

export const Default: StoryObj<typeof BudgetMeter> = {
  args: { label: "Model budget", used: 32_000, limit: 100_000 },
};

export const WithReserved: StoryObj<typeof BudgetMeter> = {
  args: { label: "Model budget", used: 32_000, limit: 100_000, reserved: 20_000 },
};

export const Formatted: StoryObj<typeof BudgetMeter> = {
  args: {
    label: "Spend this month",
    used: 4.25,
    limit: 10,
    format: (n: number) => `$${n.toFixed(2)}`,
  },
};

export const OverLimit: StoryObj<typeof BudgetMeter> = {
  args: { label: "Model budget", used: 118_000, limit: 100_000, reserved: 5_000 },
};
