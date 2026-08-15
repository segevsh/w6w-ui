import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties } from "react";
import { CodeBlock } from "./CodeBlock.tsx";

/**
 * Snippets are written once, at module scope, so the sidebar reads as a list of
 * *behaviours* rather than a list of pasted code. Each is real output of the
 * thing it claims to show — the CLI line is a `@w6w/cli` invocation, the JSON is
 * a Function `impl` block — because a grammar only proves itself against text
 * that has the shapes the grammar is for.
 */
const SHELL = `# Invoke an endpoint from the CLI
w6w endpoint invoke ep_7fQ2 \\
  --payload '{"to":"ada@example.com","subject":"Welcome"}' \\
  --wait

echo "exit=$? env=$W6W_API_URL"`;

const JSON_SNIPPET = `{
  "id": "fn_01H8",
  "key": "send-customer-email",
  "impl": {
    "uses": { "app": "io.w6w.brevo", "action": "send-email" },
    "with": { "recipientEmail": { "$": "inputs.to" } },
    "outputMap": { "messageId": { "$": "output.id" } }
  },
  "enabled": true,
  "version": 3
}`;

const TYPESCRIPT = `import { createW6WApi } from "@w6w/sdk";

// One credential, every API behind it.
const w6w = createW6WApi({ baseUrl: process.env.W6W_API_URL, token });

export async function welcome(to: string) {
  const { messageId } = await w6w.invoke("send-customer-email", { to });
  return messageId;
}`;

const HTTP = `POST /invoke/ep_7fQ2
Authorization: Bearer <your key>

{ "to": "ada@example.com", "subject": "Welcome", "body": "<p>Hi Ada</p>" }`;

/** Long enough to overflow the container horizontally — the point of `wrap`. */
const LONG_LINE =
  `const resolved = await runtime.resolve({ app: "io.w6w.sendgrid", action: "send-mail", ` +
  `connection: "conn_01H8QK3M9V2R", params: { to, subject, body }, timeoutMs: 30_000 });`;

const meta = {
  title: "Components/CodeBlock",
  component: CodeBlock,
  // `fullscreen`: the preview decorator already paints `--w6w-bg` and pads the
  // canvas, and Storybook's own `padded` layout would add a second inset that
  // only shows up as an unexplained margin.
  parameters: { layout: "fullscreen" },
  argTypes: {
    language: {
      control: "select",
      options: [
        "plaintext",
        "bash",
        "shell",
        "json",
        "typescript",
        "tsx",
        "javascript",
        "jsx",
        "yaml",
        "sql",
        "markdown",
        "python",
        "go",
        "rust",
        "markup",
        "css",
      ],
    },
    wrap: { control: "boolean" },
    showLineNumbers: { control: "boolean" },
    copyable: { control: "boolean" },
    copiedMs: { control: { type: "number", min: 0, step: 250 } },
    maxHeight: { control: "text" },
    code: { control: "text" },
  },
  args: { code: TYPESCRIPT, language: "typescript" },
} satisfies Meta<typeof CodeBlock>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default call: source plus a grammar, nothing else.
 *
 * The copy button in the top-right corner is part of that default — click it
 * and it becomes a checkmark for 1500 ms, then reverts. It is positioned over
 * the corner rather than beside the block so it costs no layout width, and it
 * stays pinned there while the code scrolls under it (see `NoWrap`,
 * `Scrollable`).
 */
export const Default: Story = {};

/**
 * `plaintext` is the default `language`, and it is not a missing grammar — it
 * is the deliberate choice for output that has no syntax, like an HTTP request
 * or a log line.
 */
export const Plaintext: Story = {
  args: { code: HTTP, language: "plaintext" },
};

/**
 * Shell is the one grammar this component registers itself: `prism-react-renderer`
 * ships 50 languages and bash is not among them, so `CodeBlock.tsx` defines a
 * compact one covering comments, quoted strings, `$VAR`, flags, the
 * line-continuation backslash and the leading command word. `bash` and `sh`
 * are aliases of the same grammar — this story is what proves it is loaded.
 */
export const Shell: Story = {
  args: { code: SHELL, language: "bash" },
};

export const Json: Story = {
  args: { code: JSON_SNIPPET, language: "json" },
};

/**
 * `showLineNumbers` puts a gutter down the left. Off by default.
 *
 * The digits are excluded from the text TWICE OVER, because the two ways a
 * reader takes code out of the page are separate paths and each needs its own
 * guard:
 *
 *   - **The copy button** writes the `code` prop's own string, never the DOM,
 *     so the gutter is not something it could pick up in the first place.
 *   - **A mouse drag** reads the DOM, so the gutter carries `user-select: none`
 *     (`_code.scss`) — drag across these lines and the numbers stay unselected.
 *     `aria-hidden` keeps them out of the accessibility tree for the same
 *     reason: they are presentation, not content.
 *
 * Each line is its own flex row so the number sits BESIDE the text rather than
 * inside the flow — a number inside the flow would be caught by both paths.
 */
export const WithLineNumbers: Story = {
  args: { code: JSON_SNIPPET, language: "json", showLineNumbers: true },
};

/**
 * Off by default: for code, a horizontal scrollbar preserves the line structure
 * the author intended. Compare with `NoWrap` below — same source, same width.
 */
export const Wrapped: Story = {
  args: { code: LONG_LINE, language: "typescript", wrap: true },
};

export const NoWrap: Story = {
  args: { code: LONG_LINE, language: "typescript", wrap: false },
};

/** Caps the height and scrolls past it, for a snippet in a panel that must not
 *  push the rest of the page down. */
export const Scrollable: Story = {
  args: {
    code: [TYPESCRIPT, JSON_SNIPPET, SHELL].join("\n\n"),
    language: "typescript",
    maxHeight: "220px",
    showLineNumbers: true,
  },
};

/**
 * The copy affordance is `<Copyable readOnly>`, so on a code block a click
 * anywhere in the box copies too — not just the button. Dragging to select does
 * NOT copy; the box-click handler bails when there is a live selection inside
 * it, so selecting a few lines by hand still works.
 *
 * The clipboard write needs a secure context: it works on the Storybook dev
 * server (localhost counts as one) and over https, and is a silent no-op on a
 * plain-http host — which is why the checkmark is the confirmation rather than
 * an assumption.
 */
export const Copyable: Story = {
  args: { code: SHELL, language: "bash", copyable: true, showLineNumbers: true },
};

/**
 * `copiedMs` tunes how long the checkmark holds before reverting to the copy
 * glyph. Default is 1500 ms — the value every other copy control in the tree
 * uses. This one holds for 5 s so the reverting state is easy to watch.
 */
export const SlowRevert: Story = {
  args: { code: SHELL, language: "bash", copiedMs: 5000 },
};

/**
 * `copyable={false}` for the one case that needs it: a block rendered WITHOUT
 * hydration. The marketing site's `Snippet.astro` renders this component at
 * build time with no `client:` directive, so the button's click listener would
 * never attach — and a dead click target is worse than no button at all.
 */
export const WithoutCopyButton: Story = {
  args: { code: HTTP, language: "plaintext", copyable: false },
};

/**
 * Every colour is a `--w6w-code-*` custom property, so a host restyles the
 * highlighter with CSS and no JS — this story overrides four of them inline to
 * show that a consumer needs nothing from this package to do it.
 */
export const CustomPalette: Story = {
  args: { code: TYPESCRIPT, language: "typescript" },
  decorators: [
    (Story) => (
      <div
        style={
          {
            "--w6w-code-keyword": "#c586c0",
            "--w6w-code-string": "#ce9178",
            "--w6w-code-function": "#dcdcaa",
            "--w6w-code-comment": "#6a9955",
          } as CSSProperties
        }
      >
        <Story />
      </div>
    ),
  ],
};

/**
 * All the supported grammars at once — the fastest way to see a token colour
 * change land everywhere, and to catch a language whose highlighting has gone
 * flat after a theme edit.
 */
export const Languages: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "16px" }}>
      {(
        [
          ["typescript", TYPESCRIPT],
          ["json", JSON_SNIPPET],
          ["bash", SHELL],
          ["yaml", "services:\n  api:\n    image: denoland/deno:2.1.4 # pinned\n    ports: [8000]"],
          ["sql", "select id, key from functions where enabled = true order by created_at desc;"],
          ["python", 'from w6w import Client\n\nclient = Client(token=token)\nprint("ok")'],
          ["css", ".w6w-code-block {\n  background: var(--w6w-panel-2);\n}"],
        ] as const
      ).map(([language, code]) => (
        <div key={language}>
          <div className="w6w-muted w6w-small" style={{ marginBottom: "4px" }}>
            {language}
          </div>
          <CodeBlock code={code} language={language} />
        </div>
      ))}
    </div>
  ),
};
