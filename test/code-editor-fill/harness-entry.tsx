// code-editor-fill browser-gate harness entry. Mounts the REAL code views
// (compiled from the source tree under test) into a real Chromium page, one
// case per page load, picked by `?case=`. Copied into
// `<tree>/src/__code_editor_fill_entry.tsx` and bundled by run.sh, so the
// relative imports below resolve against the tree under test ($UI_SRC).
import { type ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";
import { CodeEditor } from "./CodeEditor.tsx";
import { JsonEditor } from "./JsonEditor.tsx";
import { YamlEditor } from "./YamlEditor.tsx";
import { DataEntryEditor } from "./components/DataEntryEditor.tsx";

// The screenshot's document: four lines, one far wider than the modal, so a
// horizontal scrollbar exists and its position can be measured.
const SHORT_DOC = JSON.stringify(
  {
    body: `<!DOCTYPE html>\n<html lang="en">\n<head>\n${"<meta charset=\"UTF-8\">\n".repeat(20)}`,
    subject: "order confirmation {{ order.orderNumber }}",
  },
  null,
  2,
);
const TALL_DOC = JSON.stringify(
  Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`key${i}`, i])),
  null,
  2,
);
const TALL_TEXT = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n");

function Doc({ text }: { text: string }) {
  return (
    <DataEntryEditor
      kind="doc"
      isNew={false}
      entryKey="order-confirmation-email"
      text={text}
      onTextChange={() => {}}
      onKeyChange={() => {}}
      onDelete={() => {}}
      onSave={() => {}}
      onCancel={() => {}}
      onReload={() => {}}
    />
  );
}

function Controlled(props: { render: (v: string, set: (v: string) => void) => ReactNode; init: string }) {
  const [v, setV] = useState(props.init);
  return <>{props.render(v, setV)}</>;
}

const CASES: Record<string, () => ReactNode> = {
  // F1/F2 — the Data page Document modal (min/max-height box, no definite height).
  "doc-short": () => <Doc text={SHORT_DOC} />,
  "doc-tall": () => <Doc text={TALL_DOC} />,
  // F3 — CodeEditor at its default 160px min-height, one line of content.
  "code-min": () => (
    <div style={{ width: 480, padding: 24 }}>
      <Controlled init="const x = 1;" render={(v, s) => <CodeEditor value={v} onChange={s} />} />
    </div>
  ),
  // F4 — YamlEditor at its default 240px min-height.
  "yaml-min": () => (
    <div style={{ width: 480, padding: 24 }}>
      <Controlled init="a: 1" render={(v, s) => <YamlEditor value={v} onChange={s} />} />
    </div>
  ),
  // F5 — a fixed-height inline editor keeps its height and scrolls inside.
  fixed: () => (
    <div style={{ width: 480, padding: 24 }}>
      <Controlled init={TALL_TEXT} render={(v, s) => <CodeEditor value={v} onChange={s} height="120px" minHeight="80px" />} />
    </div>
  ),
  // F6 — content-sized up to maxHeight (ParamsForm's inline json field), then scrolls.
  capped: () => (
    <div className="w6w-field" style={{ width: 480, padding: 24 }}>
      <Controlled
        init={TALL_DOC}
        render={(v, s) => <JsonEditor value={v} onChange={s} minHeight="34px" maxHeight="260px" />}
      />
    </div>
  ),
  // F7 — height="100%" in the full-view JSON body (a definite-height flex column).
  fullview: () => (
    <div style={{ width: 640, padding: 24 }}>
      <div className="w6w-json-fullview">
        <Controlled init='{"a": 1}' render={(v, s) => <JsonEditor value={v} onChange={s} height="100%" />} />
      </div>
    </div>
  ),
  // F8 — the expression modal's JSON compose pane in a definite-height flex column.
  exprmodal: () => (
    <div style={{ width: 640, height: 420, display: "flex", flexDirection: "column" }}>
      <div className="w6w-exprmodal-json">
        <Controlled init='{"a": 1}' render={(v, s) => <JsonEditor value={v} onChange={s} height="100%" />} />
      </div>
    </div>
  ),
};

const name = new URLSearchParams(location.search).get("case") ?? "";
const Case = CASES[name];
if (!Case) throw new Error(`unknown case: ${name}`);
const mount = document.getElementById("root");
if (!mount) throw new Error("no #root to mount into");
createRoot(mount).render(<Case />);
(window as unknown as { __mounted: boolean }).__mounted = true;
