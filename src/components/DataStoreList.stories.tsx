import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DataStore } from "../data-stores/data-store-view.ts";
import { DataStoreList } from "./DataStoreList.tsx";

const base = {
  description: "",
  project: "p1",
  createdBy: "u1",
  createdAt: "2026-01-01T00:00:00Z",
} as const;

const stores: DataStore[] = [
  {
    ...base,
    id: "ds_1",
    name: "feature-flags",
    kind: "kv",
    schema: {},
    entryCount: 12,
    sizeBytes: 2048,
    updatedAt: "2026-10-01T09:30:00Z",
  },
  {
    ...base,
    id: "ds_2",
    name: "webhook-payloads",
    kind: "doc",
    schema: {},
    entryCount: 340,
    sizeBytes: 1_572_864,
    updatedAt: "2026-10-12T14:05:00Z",
  },
  {
    ...base,
    id: "ds_3",
    name: "customers",
    kind: "table",
    schema: { columns: [{ name: "email", type: "string", required: true }], key: "email" },
    entryCount: 1,
    sizeBytes: 300,
    updatedAt: "2026-10-20T08:00:00Z",
  },
];

const meta = {
  title: "Data Display/DataStoreList",
  component: DataStoreList,
  args: { stores, onOpen: () => {}, onEdit: () => {}, onArchive: () => {} },
} satisfies Meta<typeof DataStoreList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** With `getHref` each row is a real anchor; Edit and Archive stay siblings of it. */
export const WithHref: Story = {
  args: { getHref: (id) => `#/data/${id}` },
};

/** Read-only: no Edit or Archive column. */
export const ReadOnly: Story = {
  args: { onEdit: undefined, onArchive: undefined },
};

/** The host's own size formatter replaces the default `2.0 KiB` style. */
export const CustomSize: Story = {
  args: { formatSize: (b) => `${b} bytes` },
};

export const Busy: Story = {
  args: { busy: true },
};

export const Empty: Story = {
  args: { stores: [] },
};

export const LoadingWithError: Story = {
  args: { stores: [], loading: true, error: "Could not load data stores." },
};
