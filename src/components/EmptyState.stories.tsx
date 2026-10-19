import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "./EmptyState.tsx";

const meta: Meta<typeof EmptyState> = { title: "Components/EmptyState", component: EmptyState };
export default meta;

export const WithAction: StoryObj<typeof EmptyState> = {
  args: {
    title: "No functions yet",
    children: "Create your first function to get started.",
    action: <button type="button">Create function</button>,
  },
};
