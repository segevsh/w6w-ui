// picker-layout browser-gate harness entry. Mounts the REAL AddConnectionModal /
// StepBuilderModal (compiled from the source tree under test) into a real
// Chromium page via a plain <W6wUIProvider api={...}> stub — no network layer,
// no jsdom. Copied into `<tree>/src/__picker_layout_entry.tsx` and bundled with
// packages/ui's own esbuild by run.sh; the relative imports below therefore
// resolve against the tree under test ($UI_SRC), so a mutated copy of `src`
// changes what this renders.
import { createRoot } from "react-dom/client";
import { AddConnectionModal } from "./AddConnectionModal.tsx";
import { StepBuilderModal } from "./StepBuilderModal.tsx";
import { W6wUIProvider } from "./provider.tsx";

const params = new URLSearchParams(location.search);
const N = Number(params.get("n") || "60");
const CONN = Number(params.get("conn") || "0");
const mode = params.get("mode") || "ok"; // ok | loading | error | empty
const cmode = params.get("cmode") || "ok"; // ok | loading | error
const NOAI = params.get("noai") === "1";
const DELAY = Number(params.get("delay") || "0");
// Selects which real component to mount. Seeded into the page HTML as
// `window.__V__` before this bundle runs (mirrors the discovery rig's `?v=`) —
// one surface per page load, never both, so the two <dialog>s never stack in
// the browser's top layer.
const surface = (window as any).__V__ === "add" ? "add" : "step";

// Mixed catalog: every 3rd vendor app carries `categories: ["ai"]`, so the AI
// tab and the Apps tab are provably different subsets of the same list (I7),
// and a substring search ("App 1") can tell an alphabetical sort apart from a
// numeric one. Plus one reserved `@w6w/*` id that must never surface in any
// picker even when it is "connected" (the internal-exclusion probe for I8c).
function apps(n: number) {
  const out: Array<{ id: string; displayName: string; version: string; categories: string[] }> =
    [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `vendor-app-${i}`,
      displayName: `App ${i}`,
      version: "1.0.0",
      categories: !NOAI && i % 3 === 0 ? ["ai"] : ["crm"],
    });
  }
  if (n > 0) {
    out.push({
      id: "@w6w/http",
      displayName: "HTTP",
      version: "1.0.0",
      categories: NOAI ? ["crm"] : ["ai"],
    });
  }
  return out;
}

const wait = <T,>(v: T) =>
  DELAY > 0 ? new Promise<T>((r) => setTimeout(() => r(v), DELAY)) : Promise.resolve(v);

const listApps = () => {
  if (mode === "loading") return new Promise<never>(() => {});
  if (mode === "error") return Promise.reject(new Error("boom: catalog unreachable"));
  if (mode === "empty") return Promise.resolve([]);
  return wait(apps(N));
};

// Connections: the first CONN vendor apps, plus `@w6w/http` always "connected"
// so the internal-exclusion path is exercised on the connected list too (I8c).
const listConnections = () => {
  if (cmode === "loading") return new Promise<never>(() => {});
  if (cmode === "error") return Promise.reject(new Error("boom: connections unreachable"));
  const cs: Array<{ id: string; appId: string }> = [];
  for (let i = 0; i < CONN; i++) cs.push({ id: `c${i}`, appId: `vendor-app-${i}` });
  cs.push({ id: "cint", appId: "@w6w/http" });
  return wait(cs);
};

// Everything StepBuilderModal / AddConnectionModal might reach for beyond
// listApps/listConnections returns an inert empty array — neither component
// calls anything else on the render paths this gate exercises.
const api: unknown = new Proxy(
  { listApps, listConnections },
  {
    get(t: Record<string, unknown>, k: string) {
      if (k in t) return t[k];
      return () => Promise.resolve([]);
    },
  },
);

const el =
  surface === "add" ? (
    <AddConnectionModal onClose={() => {}} onCreated={() => {}} />
  ) : (
    <StepBuilderModal onClose={() => {}} onAdd={() => undefined} />
  );

const mount = document.getElementById("root");
if (!mount) throw new Error("no #root to mount into");
// biome-ignore lint/suspicious/noExplicitAny: the harness stub is intentionally untyped against W6wApi.
createRoot(mount).render(<W6wUIProvider api={api as any}>{el}</W6wUIProvider>);
(window as unknown as { __mounted: boolean }).__mounted = true;
