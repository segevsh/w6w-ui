import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ConnectionSummary } from "../types.ts";
import { ConnectionList } from "./ConnectionList.tsx";

const connections: ConnectionSummary[] = [
  {
    id: "c1",
    appId: "sendgrid",
    authKey: "apiKey",
    displayName: "Production SendGrid",
    state: "connected",
    app: { displayName: "SendGrid", brandColor: "#1a82e2" },
  },
  {
    id: "c2",
    appId: "slack",
    authKey: "oauth",
    displayName: "Team Slack",
    state: "needs_refresh",
    lastTestOk: false,
    app: { displayName: "Slack", brandColor: "#4a154b" },
  },
  {
    id: "zerocred:github",
    appId: "github",
    authKey: "zero-credential",
    displayName: "GitHub (built in)",
    state: "connected",
    builtIn: true,
    app: { displayName: "GitHub", brandColor: "#24292f" },
  },
];

const meta = {
  title: "Data Display/ConnectionList",
  component: ConnectionList,
  args: {
    connections,
    onOpen: () => {},
    onEdit: () => {},
    onDelete: () => {},
  },
} satisfies Meta<typeof ConnectionList>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The built-in row is a plain item: no link, Edit or Delete. */
export const Default: Story = {};

/** With `getHref` each openable row is a real anchor; Edit and Delete stay siblings of it. */
export const WithHref: Story = {
  args: { getHref: (id) => `#/connections/${id}` },
};

/** Read-only: no Edit or Delete buttons. */
export const ReadOnly: Story = {
  args: { onEdit: undefined, onDelete: undefined },
};

export const Busy: Story = {
  args: { busy: true },
};

export const Empty: Story = {
  args: { connections: [] },
};

export const LoadingWithError: Story = {
  args: { connections: [], loading: true, error: "Could not load connections." },
};
