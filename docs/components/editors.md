---
id: null
key: "components/editors"
title: "Editors"
section: "ui"
description: "Show highlighted code with CodeBlock, and edit JSON, YAML, JavaScript or Python with @w6w/ui's CodeMirror editors."
format: "markdown"
shared: true
sourceRepo: null
sourcePath: null
sourceSha: null
sourceRefSha: null
sourceUrl: null
syncedAt: null
createdAt: null
updatedAt: null
---

# Editors

One read-only block and three editors. All four are props-only and follow the current
[theme](/ui/theming/). `CodeBlock`'s syntax colors come from the `--w6w-code-*` tokens. The editors
use the general surface tokens (`--w6w-panel-2`, `--w6w-text`, `--w6w-border`, `--w6w-accent`)
with CodeMirror's light or dark highlighting.

## `CodeBlock`

Read-only, syntax-highlighted code with a copy button. It's the one component in the lightweight
`@w6w/ui/code` entrypoint, which leaves out the editors and the expression engine. Use that
entrypoint, with `@w6w/ui/code.css`, on a page that only shows code.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `code` | `string` | Required | The source, rendered verbatim. |
| `language` | `CodeLanguage` | `"plaintext"` | `bash`, `shell`, `json`, `typescript`, `tsx`, `javascript`, `jsx`, `yaml`, `sql`, `markdown`, `python`, `go`, `rust`, `markup`, `css` or `plaintext`. |
| `copyable` | `boolean` | `true` | The copy button. Turn it off when the block is server-rendered and never hydrated, or the button won't respond. |
| `wrap` | `boolean` | `false` | Soft-wrap long lines instead of scrolling sideways. |
| `showLineNumbers` | `boolean` | `false` | A line-number gutter. |
| `maxHeight` | `string` | None | Cap the height and scroll, such as `"320px"`. |
| `copiedMs` | `number` | `1500` | How long the copied checkmark shows. |
| `className`, `aria-label` | `string` | None | `className` lands on the `<pre>`. The label defaults to naming the language. |

```tsx
import { CodeBlock } from "@w6w/ui/code";
import "@w6w/ui/code.css";

<CodeBlock language="bash" code={`curl -H "Authorization: Bearer $W6W_TOKEN" https://<your-host>/apps`} />
```

`CodeBlock` is exported from the root `@w6w/ui` too, so you don't need a second import when you
already load the full library.

## `JsonEditor`

A JSON editor with parse errors marked inline.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `value` | `string` | Required | The text, which may be invalid JSON mid-edit. |
| `onChange` | `(value: string) => void` | Required | Every edit. |
| `onValidChange` | `(parsed: unknown) => void` | None | Fires with the parsed value whenever the text is valid JSON. Never fires while it's invalid. |
| `onValidityChange` | `({ valid, error? }) => void` | None | Fires on every edit, so you can disable a Save button while the JSON is broken. |
| `minHeight` | `string` | `"240px"` | |
| `maxHeight` | `string` | None | Scroll past this height. |
| `height` | `string` | None | A fixed height. `"100%"` fills a flex parent. |
| `copyable` | `boolean` | `false` | An in-box copy button. |
| `placeholder`, `readOnly`, `theme`, `aria-label` | | | |

```tsx
import { JsonEditor } from "@w6w/ui";

const [text, setText] = useState('{\n  "to": "team@example.com"\n}');
const [valid, setValid] = useState(true);

<JsonEditor value={text} onChange={setText} onValidityChange={(r) => setValid(r.valid)} minHeight="160px" />
<button className="w6w-btn" disabled={!valid} onClick={() => save(JSON.parse(text))}>Save</button>
```

## `YamlEditor`

The same editor for YAML: `value`, `onChange`, `placeholder`, `minHeight` (default `"240px"`),
`maxHeight`, `height`, `readOnly`, `theme`, `aria-label` and `copyable` (default off). It has no
validity callbacks: parse the text yourself when you need to.

```tsx
import { YamlEditor } from "@w6w/ui";

<YamlEditor value={yamlText} onChange={setYamlText} minHeight="320px" />
```

## `CodeEditor`

A plain code editor for script snippets, with optional highlighting.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `value`, `onChange` | `string`, `(value) => void` | Required | |
| `language` | `"javascript" \| "python"` | None | Highlighting and language-aware editing. Omit it for plain text. |
| `minHeight` | `string` | `"160px"` | |
| `maxHeight`, `height`, `placeholder`, `readOnly`, `theme`, `aria-label` | | | As on `JsonEditor`. |

```tsx
import { CodeEditor } from "@w6w/ui";

<CodeEditor language="javascript" value={script} onChange={setScript} aria-label="Script" />
```

## Where to next

- **[Theming](/ui/theming/)**: the color tokens, including `--w6w-code-*`.
- **[Forms](/ui/components/forms/)**: `PropertyEntryForm`, which pairs fields with a JSON view.
