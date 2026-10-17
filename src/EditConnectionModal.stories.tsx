import type { Meta, StoryObj } from "@storybook/react-vite";
import { SAMPLE_AUTHS, fakeApi, neverResolves } from "../.storybook/fixtures.ts";
import { EditConnectionModal } from "./EditConnectionModal.tsx";
import { W6WUIProvider } from "./provider.tsx";

const saved = {
  id: "c1",
  appId: "sendgrid",
  authKey: "apiKey",
  displayName: "Production SendGrid",
  state: "connected",
};

const meta = {
  title: "Modals/EditConnectionModal",
  component: EditConnectionModal,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <W6WUIProvider api={fakeApi({ updateConnection: async () => saved })}>
        <Story />
      </W6WUIProvider>
    ),
  ],
  args: {
    connection: {
      id: "c1",
      appId: "sendgrid",
      authKey: "apiKey",
      displayName: "Production SendGrid",
    },
    onClose: () => {},
    onSaved: () => {},
  },
} satisfies Meta<typeof EditConnectionModal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Credential fields start empty; blank means unchanged. */
export const Default: Story = {};

/** `getAppAuth` never resolves. */
export const Loading: Story = {
  decorators: [
    (Story) => (
      <W6WUIProvider
        api={fakeApi({ updateConnection: async () => saved, getAppAuth: () => neverResolves() })}
      >
        <Story />
      </W6WUIProvider>
    ),
  ],
};

/** The save rejects; the message shows, never the typed values. */
export const SaveError: Story = {
  decorators: [
    (Story) => (
      <W6WUIProvider
        api={fakeApi({
          updateConnection: () => Promise.reject(new Error("Could not update the connection.")),
        })}
      >
        <Story />
      </W6WUIProvider>
    ),
  ],
};

/** An OAuth connection can be renamed only. */
export const OAuth: Story = {
  decorators: [
    (Story) => (
      <W6WUIProvider
        api={fakeApi({
          updateConnection: async () => saved,
          getAppAuth: async () => [{ ...SAMPLE_AUTHS[0], type: "oauth2", fields: [] }],
        })}
      >
        <Story />
      </W6WUIProvider>
    ),
  ],
};

/** The adapter has no `updateConnection`: no Save button, a notice instead. */
export const NoUpdateSupport: Story = {
  decorators: [
    (Story) => (
      <W6WUIProvider api={fakeApi()}>
        <Story />
      </W6WUIProvider>
    ),
  ],
};

/** A built-in row has nothing to edit and the adapter is never called. */
export const BuiltIn: Story = {
  args: {
    connection: {
      id: "zerocred:sendgrid",
      appId: "sendgrid",
      authKey: "zero-credential",
      displayName: "SendGrid (built in)",
      builtIn: true,
    },
  },
};
