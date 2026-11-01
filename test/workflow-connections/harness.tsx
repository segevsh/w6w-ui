import { useState } from "react";
import { createRoot } from "react-dom/client";
import { WorkflowFlowEditor } from "../../src/WorkflowFlowEditor.tsx";
import { W6WUIProvider } from "../../src/provider.tsx";
const initial = {
  manifestVersion: "2",
  id: "wf_preview",
  name: "Shared connections",
  nodes: [
    {
      id: "find_webhook",
      uses: { app: "eventbrite", action: "list", connection: "conn_a" },
      position: { x: 70, y: 100 },
    },
    {
      id: "create_webhook",
      uses: { app: "eventbrite", action: "create", connection: "conn_b" },
      position: { x: 330, y: 100 },
    },
    {
      id: "get_event",
      uses: { app: "eventbrite", action: "get", connection: "conn_b" },
      position: { x: 600, y: 100 },
    },
    {
      id: "other_app",
      uses: { app: "other", action: "run", connection: "conn_other" },
      position: { x: 70, y: 300 },
    },
  ],
  edges: [],
};
const app = { id: "eventbrite", displayName: "Eventbrite" };
const actions = [
  {
    key: "list",
    title: "List webhooks",
    params: [{ key: "note", label: "Note", type: "string" }],
  },
  { key: "create", title: "Create webhook", params: [] },
  { key: "get", title: "Get event", params: [] },
];
const conns = [{
  id: "conn_a",
  appId: "eventbrite",
  displayName: "Segev account",
  state: "connected",
}, {
  id: "conn_b",
  appId: "eventbrite",
  displayName: "Eventbrite account",
  state: "connected",
}];
const methods = {
  getAppActions: async () => actions,
  listConnectionsForApp: async () => conns,
  getAppAuth: async () => [{ key: "token", type: "bearer" }],
  listApps: async () => [app],
  getApp: async () => app,
  invokeAction: async (app, action, params, options) => {
    window.__invoke = options;
    return { output: { ok: true } };
  },
};
const api = new Proxy(methods, {
  get: (t, k) =>
    k in t
      ? t[k]
      : ["listAppsPage", "listAppsByIds", "listSubscriptionsForWorkflow"]
          .includes(k)
      ? undefined
      : () => Promise.resolve([]),
});
function App() {
  const [value, setValue] = useState(initial);
  const [key, setKey] = useState(0);
  window.__value = value;
  window.__reload = () => setKey((k) => k + 1);
  return (
    <W6WUIProvider theme="light" api={api as any}>
      <div style={{ width: 1100, height: 740 }}>
        <WorkflowFlowEditor
          key={key}
          value={value as any}
          onChange={(v) => setValue(v as any)}
          height="100%"
          apps={[app] as any}
        />
      </div>
    </W6WUIProvider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
