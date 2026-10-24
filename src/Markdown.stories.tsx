import type { Meta, StoryObj } from "@storybook/react-vite";
import { Markdown } from "./Markdown.tsx";

const RICH = `# Release notes

Ship **safely**: _emphasis_, \`inline code\`, and a [link](https://w6w.io).

- first item
- second item

> Notes can quote things.`;

/** Everything below is attacker-controlled input a note could carry — none of it may execute or load. */
const HOSTILE = `<script>alert(1)</script>

<img src=x onerror=alert(2)>

<iframe src="https://evil.example"></iframe>

<div onclick="alert(3)">raw html is dropped</div>

[javascript](javascript:alert(4)) · [JAVASCRIPT](JAVASCRIPT:alert(5)) · [data](data:text/html,x) · [vbscript](vbscript:x)

![tracking pixel](https://evil.example/pixel.png)

Safe links keep working: [https](https://w6w.io), [http](http://example.com), [mail](mailto:a@example.com).`;

const meta = {
  title: "Flow/Markdown",
  component: Markdown,
  parameters: { layout: "padded" },
  argTypes: { content: { control: "text" } },
  args: { content: RICH },
} satisfies Meta<typeof Markdown>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Ordinary markdown: headings, emphasis, code, lists, quotes and a safe link. */
export const Default: Story = {};

/**
 * The sanitizing sink: raw HTML is dropped, `javascript:`/`data:`/`vbscript:` links lose
 * their href, images are not rendered, and only http/https/mailto survive.
 */
export const Hostile: Story = { args: { content: HOSTILE } };

export const Empty: Story = { args: { content: "" } };
