import { ConditionEditor } from "./ConditionEditor.tsx";
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
  const save = (next: RouterRoute[]) => onChange({ ...values, routes: next });
  const patch = (index: number, value: Partial<RouterRoute>) =>
    save(routes.map((r, i) => (i === index ? { ...r, ...value } : r)));
  const move = (index: number, delta: number) => {
    const next = [...routes];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    save(next);
  };
  return (
    <div className="w6w-stack">
      <p className="w6w-muted w6w-small">
        Routes are checked from top to bottom. Only the first match runs; the default route runs
        when none match.
      </p>
      {routes.map((route, index) => (
        <fieldset
          key={route.id}
          className="w6w-stack"
          disabled={readOnly}
          style={{
            border: "1px solid var(--w6w-border)",
            borderRadius: 8,
            padding: "var(--w6w-sp-3)",
          }}
        >
          <legend>{route.default ? "Default route" : `Route ${index + 1}`}</legend>
          <label className="w6w-field">
            <span>Port label</span>
            <input
              type="text"
              aria-label={`Route ${index + 1} label`}
              value={route.label ?? route.id}
              onChange={(e) => patch(index, { label: e.target.value })}
            />
          </label>
          {route.default ? (
            <p className="w6w-muted w6w-small">Used when every condition above is false.</p>
          ) : (
            <>
              <ConditionEditor
                values={{ condition: route.condition ?? false }}
                onChange={(next) => patch(index, { condition: next.condition })}
                readOnly={readOnly}
                purpose="router"
              />
              <div className="w6w-field-row">
                <button
                  type="button"
                  className="w6w-btn w6w-btn-sm"
                  disabled={readOnly || index === 0}
                  onClick={() => move(index, -1)}
                >
                  Move up
                </button>
                <button
                  type="button"
                  className="w6w-btn w6w-btn-sm"
                  disabled={readOnly || !routes[index + 1] || routes[index + 1].default}
                  onClick={() => move(index, 1)}
                >
                  Move down
                </button>
                <button
                  type="button"
                  className="w6w-btn w6w-btn-sm"
                  disabled={readOnly}
                  onClick={() => save(routes.filter((_, i) => i !== index))}
                >
                  Remove route
                </button>
              </div>
            </>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        className="w6w-btn"
        disabled={readOnly}
        onClick={() => {
          let n = 1;
          while (routes.some((r) => r.id === `route_${n}`)) n++;
          const route: RouterRoute = { id: `route_${n}`, label: `Route ${n}`, condition: false };
          const fallback = routes.filter((r) => r.default);
          save([...routes.filter((r) => !r.default), route, ...fallback]);
        }}
      >
        Add route
      </button>
    </div>
  );
}
