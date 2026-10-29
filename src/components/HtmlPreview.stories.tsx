import type { Meta, StoryObj } from "@storybook/react-vite";
import { HtmlPreview } from "./HtmlPreview.tsx";

/**
 * `HtmlPreview` is the only path in `@w6w/ui` that renders third-party HTML: an
 * `<iframe sandbox="">` (opaque origin, no scripts) whose `srcdoc` opens with a
 * `default-src 'none'` CSP meta as its first element, so the payload cannot
 * execute and cannot read or reach this page. Accepted residual: a click on a
 * link inside the frame navigates the frame itself.
 */
const DOCUMENT = `<!doctype html>
<html>
  <head>
    <style>
      body { font: 14px/1.5 system-ui, sans-serif; margin: 16px; }
      h1 { font-size: 1.25em; margin: 0 0 8px; }
    </style>
  </head>
  <body>
    <h1>Invoice #1042</h1>
    <p>Paid — thanks!</p>
    <a href="https://w6w.io">Open the dashboard</a>
  </body>
</html>`;

/**
 * A payload written to attack its host: script, an `onerror` handler, a remote
 * stylesheet and a beacon image. It renders, and none of it runs or loads — the
 * CSP meta is the first element of the `srcdoc`.
 */
const HOSTILE = `<h1>vendor page</h1>
<script>parent.postMessage("script-ran", "*")</script>
<img src="https://evil.example/beacon.png">
<img src="x" onerror="parent.postMessage('onerror-ran', '*')">
<link rel="stylesheet" href="https://evil.example/x.css">`;

const meta = {
  title: "Data Display/HtmlPreview",
  component: HtmlPreview,
  parameters: { layout: "padded" },
  args: { html: DOCUMENT },
} satisfies Meta<typeof HtmlPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

/** An ordinary vendor document, styled by its own inline `<style>`. */
export const Default: Story = {};

/** The same component against a hostile payload: it renders text, executes nothing. */
export const Hostile: Story = { args: { html: HOSTILE } };
