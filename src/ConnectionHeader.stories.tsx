import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectionHeader } from "./ConnectionHeader.tsx";

const meta = {
  title: "Data Display/ConnectionHeader",
  component: ConnectionHeader,
  args: {
    conn: {
      id: "c1",
      appId: "sendgrid",
      authKey: "apiKey",
      displayName: "Production SendGrid",
      state: "connected",
    },
    app: { displayName: "SendGrid", brandColor: "#1a82e2" },
  },
} satisfies Meta<typeof ConnectionHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A failed last test shows the `invalid` tag; `children` fill the actions slot. */
export const InvalidWithActions: Story = {
  args: {
    conn: {
      id: "c2",
      appId: "slack",
      authKey: "oauth",
      displayName: "",
      state: "needs_refresh",
      lastTestOk: false,
    },
    app: undefined,
    children: (
      <button type="button" className="w6w-btn w6w-btn-ghost">
        Test connection
      </button>
    ),
  },
};
