import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { fakeApi, neverResolves } from "../.storybook/fixtures.ts";
import { ParamsForm, type ParamsFormProps } from "./ParamsForm.tsx";
import { type W6WApi, W6WUIProvider } from "./provider.tsx";
import type { ActionParam, ParamOption, ResolveFieldsResult } from "./types.ts";

/** A mixed set — a required string, a number, a boolean and a select — enough
 *  to exercise every scalar widget `ParamField` dispatches to. */
const PARAMS: ActionParam[] = [
  { key: "name", label: "Name", type: "string", required: true },
  { key: "count", label: "Count", type: "number", default: 1 },
  { key: "enabled", label: "Enabled", type: "boolean", default: false },
  {
    key: "method",
    label: "Method",
    type: "select",
    options: [
      { value: "GET", label: "GET" },
      { value: "POST", label: "POST" },
    ],
    default: "GET",
  },
];

const VALUES: Record<string, unknown> = {
  name: "Ada Lovelace",
  count: 3,
  enabled: true,
  method: "POST",
};

// ---------------------------------------------------------------------------
// Form-resolved dynamic options (`options: { source: "resolveFields" }`).
//
// ParamsForm only fetches when the HOST supplies `W6WApi.resolveActionFields`
// (it reads it through `useOptionalW6WApi()`), so every story below mounts its
// own fake provider — the same `.storybook/fixtures.ts` `fakeApi()` the other
// stories use, with exactly one method overridden.
// ---------------------------------------------------------------------------

type ResolveFields = NonNullable<W6WApi["resolveActionFields"]>;

/** The shared fake, plus the one optional member these stories exercise. */
function dynamicApi(resolve: ResolveFields): W6WApi {
  return fakeApi({ resolveActionFields: resolve });
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A host that OWNS the values — `ParamsForm` is fully controlled, and a
 * `refreshOn` dependency is only observable when a pick actually lands in
 * `values` (exactly how `StepEditModal`/`AppStepConfig` hold `step.with`).
 */
function DynamicDemo({ api, ...form }: { api: W6WApi } & ParamsFormProps) {
  const [values, setValues] = useState(form.values);
  return (
    <W6WUIProvider api={api}>
      <ParamsForm {...form} values={values} onChange={setValues} />
    </W6WUIProvider>
  );
}

const ANTHROPIC = {
  appId: "anthropic",
  actionKey: "create-message",
  connectionId: "c_anthropic",
  appName: "Anthropic",
};

/** What the Anthropic app's `resolveFields` hands back for `model`. */
const ANTHROPIC_MODELS: ParamOption[] = [
  { value: "claude-opus-4-5", label: "Claude Opus 4.5", description: "Deepest reasoning." },
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
];

const MODEL_PARAMS: ActionParam[] = [
  {
    key: "model",
    label: "Model",
    type: "string",
    required: true,
    placeholder: "Select a model…",
    options: { source: "resolveFields" },
  },
];

/** Same field, but the app declares that a value outside the list is allowed. */
const CUSTOM_MODEL_PARAMS: ActionParam[] = [
  {
    key: "model",
    label: "Model",
    type: "string",
    required: true,
    placeholder: "Select a model…",
    options: { source: "resolveFields" },
    config: { allowCustom: true },
  },
];

const loadedModels: ResolveFields = async () => {
  await wait(700);
  return { fields: { model: { options: ANTHROPIC_MODELS } } };
};

const ANTHROPIC_LOADED = dynamicApi(loadedModels);

/**
 * Fails the FIRST call and succeeds on Retry, so the story shows both halves of
 * A7: the per-field `role="alert"` line with its Retry button, and the recovery
 * when that button re-requests only this field.
 */
function ModelErrorDemo(form: ParamsFormProps) {
  const attempts = useRef(0);
  const [api] = useState(() =>
    dynamicApi(async () => {
      await wait(400);
      attempts.current += 1;
      if (attempts.current === 1) {
        return { fields: { model: { error: "Anthropic rejected the API key (401)" } } };
      }
      return { fields: { model: { options: ANTHROPIC_MODELS } } };
    }),
  );
  return <DynamicDemo api={api} {...form} />;
}

const EVENTBRITE = {
  appId: "eventbrite",
  actionKey: "create-event",
  connectionId: "c_eventbrite",
  appName: "Eventbrite",
};

/** The org list is plain static options — the native `<select>`, untouched. */
const ORG_PARAMS: ActionParam[] = [
  {
    key: "org",
    label: "Organisation",
    type: "string",
    required: true,
    default: "acme",
    options: [
      { value: "acme", label: "Acme Corp" },
      { value: "globex", label: "Globex Inc" },
    ],
  },
  {
    key: "organizer",
    label: "Organizer",
    type: "string",
    // Only re-asked when `org` is committed — an org pick is one `change` call.
    options: { source: "resolveFields", refreshOn: ["org"] },
  },
];

/** Eventbrite's organizers are per-org — the fake reads the pick out of `form`. */
const ORGANIZERS: Record<string, ParamOption[]> = {
  acme: [
    { value: "ada", label: "Ada Lovelace" },
    { value: "grace", label: "Grace Hopper" },
  ],
  globex: [{ value: "linus", label: "Linus Torvalds" }],
};

const loadOrganizers: ResolveFields = async (_appId, _actionKey, body) => {
  await wait(500);
  const org = String(body.form.org ?? "");
  const result: ResolveFieldsResult = { fields: { organizer: { options: ORGANIZERS[org] ?? [] } } };
  return result;
};

const EVENTBRITE_API = dynamicApi(loadOrganizers);

const meta = {
  title: "Forms/ParamsForm",
  component: ParamsForm,
  argTypes: {
    readOnly: { control: "boolean" },
  },
  args: {
    params: PARAMS,
    values: VALUES,
    onChange: () => {},
  },
} satisfies Meta<typeof ParamsForm>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A required string, a number, a boolean and a select, all with values set. */
export const Default: Story = {};

/** Every widget renders disabled/non-editable. */
export const ReadOnly: Story = {
  args: { readOnly: true },
};

/** No declared params — the "This action takes no parameters." fallback. */
export const Empty: Story = {
  args: { params: [], values: {} },
};

/** An optional `json` param: the `ƒx` sits inside the editor box, top-right. */
export const JsonParam: Story = {
  args: {
    params: [{ key: "payload", label: "Payload", type: "json" }],
    values: {},
  },
};

/**
 * In flight: the fake never settles, so the field stays `aria-busy` and the
 * Combobox reads "Loading…". Nothing is typeable yet — the choices are on
 * their way.
 */
export const ModelPickerLoading: Story = {
  args: { params: MODEL_PARAMS, values: {}, dynamic: ANTHROPIC },
  render: (args) => <DynamicDemo {...args} api={dynamicApi(() => neverResolves())} />,
};

/**
 * loading → loaded: one `init` call on mount, in flight for ~700ms, then the
 * returned models are the Combobox's choices. The stored model is in the list,
 * so nothing is flagged.
 */
export const ModelPickerLoaded: Story = {
  args: {
    params: MODEL_PARAMS,
    values: { model: "claude-sonnet-4-5" },
    dynamic: ANTHROPIC,
  },
  render: (args) => <DynamicDemo {...args} api={ANTHROPIC_LOADED} />,
};

/**
 * Error, then recovery: the first request fails per-field, so the field shows a
 * `role="alert"` line and a Retry button. Retry re-requests ONLY `model` (it is
 * not cached, and errors never are), and the second answer fills the list.
 */
export const ModelPickerError: Story = {
  args: { params: MODEL_PARAMS, values: {}, dynamic: ANTHROPIC },
  render: (args) => <ModelErrorDemo {...args} />,
};

/**
 * Custom value: the app allows a value outside the list (`config.allowCustom`),
 * so `claude-2.1-legacy` is kept and flagged — "Not in the list returned by
 * Anthropic" — instead of being silently dropped. Free text types straight into
 * the Combobox; it commits on blur/Enter, never per keystroke.
 */
export const ModelPickerCustomValue: Story = {
  args: {
    params: CUSTOM_MODEL_PARAMS,
    values: { model: "claude-2.1-legacy" },
    dynamic: ANTHROPIC,
  },
  render: (args) => <DynamicDemo {...args} api={ANTHROPIC_LOADED} />,
};

/**
 * Org → organizer: `organizer` declares `refreshOn: ["org"]`, so picking a
 * different organisation in the (static, native-select) org field issues ONE
 * `reason: "change"` call with `changed: ["org"]`, and the organizer list swaps
 * to that org's people. The org field itself is never re-asked.
 */
export const OrgToOrganizerRefetch: Story = {
  args: { params: ORG_PARAMS, values: {}, dynamic: EVENTBRITE },
  render: (args) => <DynamicDemo {...args} api={EVENTBRITE_API} />,
};

/**
 * Stale clear: `ada` is stored and valid for Acme, so init keeps it. Pick
 * "Globex Inc" and the returned list is Globex's — `ada` is not in it and this
 * field has no `allowCustom`, so it is CLEARED in the same commit's `onChange`
 * (D-6), never left behind pointing at an organizer of another org.
 */
export const OrgToOrganizerStaleValueCleared: Story = {
  args: { params: ORG_PARAMS, values: { organizer: "ada" }, dynamic: EVENTBRITE },
  render: (args) => <DynamicDemo {...args} api={EVENTBRITE_API} />,
};

/**
 * Org bound to an expression: the org is `{ $: … }`, so it cannot be sent as a
 * literal (D-5) — the organizer is never requested and falls back to free text
 * with "Options unavailable while Organisation is an expression". It stays
 * `ƒx`-bindable, so the author can still wire it to a step output.
 */
export const OrganizerWithOrgExpression: Story = {
  args: {
    params: ORG_PARAMS,
    values: { org: { $: "steps.eventbrite-connection.output.orgId" } },
    dynamic: EVENTBRITE,
  },
  render: (args) => <DynamicDemo {...args} api={EVENTBRITE_API} />,
};
