import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataEntryEditor } from "./DataEntryEditor.tsx";

const noop = () => {};

const meta: Meta<typeof DataEntryEditor> = {
  title: "Forms/DataEntryEditor",
  component: DataEntryEditor,
  args: {
    kind: "kv",
    isNew: false,
    entryKey: "greeting",
    version: 2,
    expiresAt: null,
    text: "hello",
    onTextChange: noop,
    onKeyChange: noop,
    onSave: noop,
    onCancel: noop,
    onReload: noop,
  },
};
export default meta;

type Story = StoryObj<typeof DataEntryEditor>;

export const Default: Story = {};

export const Expiring: Story = { args: { expiresAt: "2026-12-31T00:00:00Z" } };

export const NewEntry: Story = { args: { isNew: true, newKey: "", text: "" } };

export const Document: Story = { args: { kind: "doc", text: '{\n  "theme": "dark"\n}' } };

export const WithError: Story = { args: { error: "Value must be a string." } };

export const Conflict: Story = { args: { conflict: true } };

export const Saving: Story = { args: { saving: true } };
