import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CredentialSummary } from "../types.ts";
import { CredentialPicker } from "./CredentialPicker.tsx";

const CONTRACT = "google-service-account.v1";
const cred = (id: string, name: string, email: string): CredentialSummary => ({
  id,
  name,
  contract: CONTRACT,
  status: "active",
  revision: 1,
  display: { email },
  private: false,
  connectionCount: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const meta = {
  title: "Forms/CredentialPicker",
  component: CredentialPicker,
  args: {
    credentials: [
      cred("cred_1", "Workspace automation", "automation@acme.iam.gserviceaccount.com"),
      cred("cred_2", "Reporting", "reports@acme.iam.gserviceaccount.com"),
    ],
    mode: "existing",
    onModeChange: () => {},
    selectedId: "cred_1",
    onSelect: () => {},
    contract: CONTRACT,
  },
} satisfies Meta<typeof CredentialPicker>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Use existing: stored credentials listed by name and non-secret display values. */
export const UseExisting: Story = {};

/** Create new chosen: the caller renders its own name + fields form beneath. */
export const CreateNew: Story = { args: { mode: "new" } };

/** Nothing stored yet: the Use existing choice is hidden. */
export const NoneStored: Story = { args: { credentials: [], mode: "new", canUseExisting: false } };
