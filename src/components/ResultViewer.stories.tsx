import type { Meta, StoryObj } from "@storybook/react-vite";
import { ResultViewer } from "./ResultViewer.tsx";

/**
 * One value per story, chosen so the format sniffer lands on the format the
 * story is named after — the point of `ResultViewer` is that the host does not
 * have to say which one it has.
 */
const JSON_VALUE = {
  id: "exec_01H8QK",
  ok: true,
  action: "io.w6w.brevo/send-email",
  attempts: 2,
  steps: [
    { step: "request", ms: 118 },
    { step: "parse", ms: 4, nested: { deep: { leaf: "collapsed, but still in the DOM" } } },
  ],
};

const HTML_VALUE = `<!doctype html>
<html>
  <body>
    <h1>Invoice #1042</h1>
    <p>Paid — thanks!</p>
    <a href="https://w6w.io">Open the dashboard</a>
  </body>
</html>`;

const MARKDOWN_VALUE = `# Run report

Two steps ran, one of them after a retry.

- \`request\` — 118 ms
- \`parse\` — 4 ms

See [the API docs](https://w6w.io) for the response schema.`;

const XML_VALUE = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <status>ok</status>
  <id>1042</id>
</response>`;

const TEXT_VALUE = "Upstream returned 204 No Content; there is no body to show.";

const meta = {
  title: "Data Display/ResultViewer",
  component: ResultViewer,
  parameters: { layout: "padded" },
  args: { value: JSON_VALUE },
} satisfies Meta<typeof ResultViewer>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A parsed value: a collapsible tree, two levels open, with Expand/Collapse all. */
export const Json: Story = {};

/**
 * Vendor HTML. It renders ONLY inside `<iframe sandbox="">` — an opaque origin
 * with an injected `default-src 'none'` CSP — so the links and styles below
 * work inside the frame and nothing reaches the host page.
 */
export const Html: Story = { args: { value: HTML_VALUE } };

/** Markdown through the hardened `Markdown` renderer, with a Rendered/Source toggle. */
export const Markdown: Story = { args: { value: MARKDOWN_VALUE } };

/** XML is highlighted source, never rendered: there is no sandbox for an XML tree. */
export const Xml: Story = { args: { value: XML_VALUE } };

/** Anything unrecognised is plain text in a wrapping `<pre>`, with nothing to toggle. */
export const Text: Story = { args: { value: TEXT_VALUE } };
