import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataEntryList } from "./DataEntryList.tsx";

const noop = () => {};

const meta: Meta<typeof DataEntryList> = {
  title: "Data Display/DataEntryList",
  component: DataEntryList,
  args: {
    rows: [
      { key: "greeting", version: 1, preview: "hello" },
      { key: "settings", version: 3, preview: '{"theme":"dark"}' },
    ],
    onOpen: noop,
    onDelete: noop,
    onSearch: noop,
    onNew: noop,
    onLoadMore: noop,
  },
};
export default meta;

type Story = StoryObj<typeof DataEntryList>;

export const Default: Story = {};

export const HasMore: Story = { args: { hasMore: true } };

export const Loading: Story = { args: { rows: [], loading: true } };

export const Empty: Story = { args: { rows: [] } };
