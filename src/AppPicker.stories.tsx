import type { Meta, StoryObj } from "@storybook/react-vite";
import { SAMPLE_APPS, fakeApi, neverResolves } from "../.storybook/fixtures.ts";
import { AppPicker } from "./AppPicker.tsx";
import { W6WUIProvider } from "./provider.tsx";

const meta = {
  title: "Forms/AppPicker",
  component: AppPicker,
  decorators: [
    (Story) => (
      <W6WUIProvider api={fakeApi()}>
        <Story />
      </W6WUIProvider>
    ),
  ],
  args: {
    onSelectApp: () => {},
  },
} satisfies Meta<typeof AppPicker>;

export default meta;

type Story = StoryObj<typeof meta>;

/** No `apps` prop — the legacy eager `listApps()` fetch path (`listAppsPage`
 *  is omitted from the shared fixture, so this is always the path taken). */
export const Default: Story = {};

/** Caller already holds the list — the `apps` prop suppresses the fetch. */
export const Preloaded: Story = {
  args: { apps: SAMPLE_APPS },
};

/**
 * Host-supplied bridge support (`operations.complete` from the provider
 * descriptor): the first app reads "Bridge supported", the second an
 * "unsupported" chip whose `reason` is its text and title, every other app
 * carries no chip at all. The picker never derives this itself.
 */
export const BridgeSupport: Story = {
  args: {
    apps: SAMPLE_APPS,
    bridgeSupport: new Map<string, { supported: boolean; reason?: string }>(
      SAMPLE_APPS.slice(0, 2).map((app, index) =>
        index === 0
          ? [app.id, { supported: true }]
          : [app.id, { supported: false, reason: "no_connection" }],
      ),
    ),
  },
};

/** An empty, resolved catalog with a custom empty message. */
export const Empty: Story = {
  args: { apps: [], emptyMessage: "No apps registered yet." },
};

/** `listApps` never resolves — the "Loading apps…" state. */
export const Loading: Story = {
  decorators: [
    (Story) => (
      <W6WUIProvider api={fakeApi({ listApps: () => neverResolves() })}>
        <Story />
      </W6WUIProvider>
    ),
  ],
};

/** `listApps` rejects. */
export const LoadError: Story = {
  decorators: [
    (Story) => (
      <W6WUIProvider
        api={fakeApi({ listApps: () => Promise.reject(new Error("Failed to load apps.")) })}
      >
        <Story />
      </W6WUIProvider>
    ),
  ],
};

/** `loadPage` supplies the pages (the provider has no `listAppsPage`), with a Load more cursor. */
export const PagedLoader: Story = {
  args: {
    pageLimit: 3,
    loadPage: ({ cursor }) =>
      Promise.resolve(
        cursor
          ? { apps: SAMPLE_APPS.slice(3) }
          : { apps: SAMPLE_APPS.slice(0, 3), nextCursor: "page-2" },
      ),
  },
};

export const Light: Story = {
  args: { theme: "light" },
};

export const Dark: Story = {
  args: { theme: "dark" },
};
