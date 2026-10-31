import { useState } from "react";
import { ConditionEditor } from "./ConditionEditor.tsx";
import { DeleteButton } from "./components/DeleteButton.tsx";
import { Icon } from "./components/Icon.tsx";
import { ROUTER_APP, type RouterRoute, internalNodeDefaults } from "./flow-types.ts";

export function RouterEditor({
  values,
  onChange,
  readOnly,
}: {
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const routes = (
    Array.isArray(values.routes) ? values.routes : internalNodeDefaults(ROUTER_APP, "route").routes
  ) as RouterRoute[];
  const conditions = routes.filter((r) => !r.default);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  // Keep existing fallback IDs, so editing a route never disconnects its fallback edge.
  const save = (next: RouterRoute[]) =>
    onChange({
      ...values,
      routes: [...next, ...routes.filter((r) => r.default)],
    });
  const patch = (id: string, value: Partial<RouterRoute>) =>
    save(conditions.map((r) => (r.id === id ? { ...r, ...value } : r)));
  const move = (id: string, to: number) => {
    const from = conditions.findIndex((r) => r.id === id);
    if (from < 0 || to < 0 || to >= conditions.length || from === to) return;
    const next = [...conditions];
    const [route] = next.splice(from, 1);
    next.splice(to, 0, route);
    save(next);
  };
  const rename = (route: RouterRoute) => {
    if (draftName.trim()) patch(route.id, { label: draftName.trim() });
    setRenaming(null);
  };
  return (
    <div className="w6w-router-editor">
      <p className="w6w-muted w6w-small">First match wins. Drag routes to change their order.</p>
      <div className="w6w-router-routes">
        {conditions.map((route, index) => (
          // Native drag events on the row accept drops from its keyboard-accessible grip.
          <div
            key={route.id}
            className={`w6w-router-route${dragged === route.id ? " is-dragging" : ""}${dropTarget === route.id ? " is-drop-target" : ""}`}
            data-route-id={route.id}
            onDragOver={(event) => {
              if (readOnly || !dragged || dragged === route.id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropTarget(route.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!readOnly && dragged) move(dragged, index);
              setDragged(null);
              setDropTarget(null);
            }}
          >
            <div className="w6w-router-route-heading">
              <button
                type="button"
                className="w6w-icon-btn w6w-router-grip"
                draggable={!readOnly}
                disabled={readOnly}
                aria-label={`Reorder ${route.label || route.id}`}
                title="Drag to reorder · arrow keys to move"
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", route.id);
                  const row = event.currentTarget.closest(".w6w-router-route");
                  if (row) event.dataTransfer.setDragImage(row, 16, 16);
                  setDragged(route.id);
                }}
                onDragEnd={() => {
                  setDragged(null);
                  setDropTarget(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                  event.preventDefault();
                  move(route.id, index + (event.key === "ArrowUp" ? -1 : 1));
                }}
              >
                <Icon name="grip" size={14} />
              </button>
              <span className="w6w-step-rename">
                {renaming === route.id && !readOnly ? (
                  <input
                    // biome-ignore lint/a11y/noAutofocus: inline rename is explicitly opened by the user
                    autoFocus
                    aria-label="Route name"
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={() => rename(route)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") rename(route);
                      if (event.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="w6w-router-route-name"
                    disabled={readOnly}
                    aria-label={`Rename ${route.label || route.id}`}
                    onClick={() => {
                      setDraftName(route.label || route.id);
                      setRenaming(route.id);
                    }}
                  >
                    {route.label || route.id}
                    {!readOnly && <Icon name="edit" size={12} />}
                  </button>
                )}
              </span>
              <DeleteButton
                label={`Remove ${route.label || route.id}`}
                disabled={readOnly}
                onClick={() => save(conditions.filter((r) => r.id !== route.id))}
              />
            </div>
            <ConditionEditor
              values={{ condition: route.condition ?? false }}
              onChange={(next) => patch(route.id, { condition: next.condition })}
              readOnly={readOnly}
              purpose="router"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="w6w-btn w6w-btn-ghost w6w-btn-sm w6w-router-add"
        disabled={readOnly}
        onClick={() => {
          let n = 1;
          while (routes.some((r) => r.id === `route_${n}`)) n++;
          save([...conditions, { id: `route_${n}`, label: `Route ${n}`, condition: false }]);
        }}
      >
        <span aria-hidden="true">+</span> Add route
      </button>
    </div>
  );
}
