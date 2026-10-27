import type { Meta, StoryObj } from "@storybook/react-vite";
import type { AuthField } from "../types.ts";
import { AuthFieldsForm } from "./AuthFieldsForm.tsx";

const FIELDS: AuthField[] = [
  { key: "apiKey", label: "API Key", type: "secret", required: true },
  { key: "domain", label: "Domain", type: "string", hint: "Your account subdomain." },
  { key: "sandbox", label: "Use sandbox", type: "boolean", default: false },
];

const VALUES: Record<string, unknown> = {
  apiKey: "sk_live_example",
  domain: "acme",
  sandbox: false,
};

const meta = {
  title: "Forms/AuthFieldsForm",
  component: AuthFieldsForm,
  args: { fields: FIELDS, values: VALUES, onChange: () => {} },
} satisfies Meta<typeof AuthFieldsForm>;

export default meta;

type Story = StoryObj<typeof meta>;

/** No enum/disabled axis on this component — one field per declared type
 *  (secret, string, boolean) covers its whole render surface. */
export const Default: Story = {};

/** Edit mode: nothing is seeded from `default`, secrets read "•••••• (unchanged)", blank = keep. */
export const EditMode: Story = {
  args: { mode: "edit", values: {} },
};

/** A `json` secret field is a masked plain textarea (a pasted key file), never an expression editor. */
export const JsonSecretTextarea: Story = {
  args: {
    fields: [
      {
        key: "serviceAccountKey",
        label: "Service account key",
        type: "json",
        secret: true,
        required: true,
        hint: "Paste the downloaded JSON key file.",
      },
      { key: "notes", label: "Notes", type: "text" },
    ],
    values: { serviceAccountKey: '{"client_email":"sa@example.iam"}', notes: "Shared with ops" },
  },
};
