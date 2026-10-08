import { useState } from "react";
import { ParamsForm } from "./ParamsForm.tsx";

const units = [
  ["s", "Seconds"],
  ["m", "Minutes"],
  ["h", "Hours"],
  ["d", "Days"],
  ["w", "Weeks"],
];
const durationPattern =
  /^(?=\d)(?:\d+w)?(?:\d+d)?(?:\d+h)?(?:\d+m)?(?:\d+(?:\.\d+)?s)?$|^P(?:\d+W)?(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/i;

/** Both input modes write the same duration field; switching never discards a compound value. */
export function WaitEditor({
  values,
  onChange,
  readOnly,
}: {
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const duration = values.duration ?? "1s";
  const single =
    typeof duration === "string" ? duration.match(/^(\d+(?:\.\d+)?)([smhdw])$/i) : null;
  const [lastUnit, setLastUnit] = useState("s");
  const [mode, setMode] = useState<"text" | "value">("text");
  const [target, setTarget] = useState<"duration" | "until">(values.until ? "until" : "duration");
  const invalid =
    typeof duration === "string" &&
    (!durationPattern.test(duration.trim()) || /^P$/i.test(duration.trim()));
  return (
    <div className="w6w-params-form">
      <label>
        Wait for
        <select
          aria-label="Wait for"
          disabled={readOnly}
          value={target}
          onChange={(e) => {
            const next = e.target.value as "duration" | "until";
            setTarget(next);
            onChange({
              ...values,
              duration: next === "duration" ? "1s" : "",
              until: "",
            });
          }}
        >
          <option value="duration">A duration</option>
          <option value="until">Until a timestamp</option>
        </select>
      </label>
      {target === "until" ? (
        <ParamsForm
          params={[
            {
              key: "until",
              label: "Until",
              type: "string",
              hint: "ISO-8601 timestamp, e.g. 2026-10-08T09:00:00Z.",
            },
          ]}
          values={values}
          onChange={onChange}
          readOnly={readOnly}
        />
      ) : (
        <>
          <label>
            Duration input
            <select
              aria-label="Duration input"
              disabled={readOnly}
              value={mode}
              onChange={(e) => {
                if (single) {
                  setLastUnit(single?.[2].toLowerCase() ?? lastUnit);
                }
                setMode(e.target.value as "text" | "value");
              }}
            >
              <option value="text">Shorthand</option>
              <option value="value" disabled={!single}>
                Value and unit
              </option>
            </select>
          </label>
          {mode === "value" ? (
            <div className="w6w-field-row">
              <label>
                Value
                <input
                  aria-label="Duration value"
                  type="number"
                  min="0"
                  step={(single?.[2].toLowerCase() ?? lastUnit) === "s" ? "any" : "1"}
                  disabled={readOnly}
                  value={single?.[1] ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...values,
                      duration: `${e.target.value}${single?.[2].toLowerCase() ?? lastUnit}`,
                    })
                  }
                />
              </label>
              <label>
                Unit
                <select
                  aria-label="Duration unit"
                  disabled={readOnly}
                  value={single?.[2].toLowerCase() ?? lastUnit}
                  onChange={(e) => {
                    setLastUnit(e.target.value);
                    onChange({
                      ...values,
                      duration: `${single?.[1] ?? ""}${e.target.value}`,
                    });
                  }}
                >
                  {units.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <ParamsForm
              params={[
                {
                  key: "duration",
                  label: "Duration",
                  type: "string",
                  default: "1s",
                  hint: "Use 30s, 1h30m30s, or 3d30s. Units: w, d, h, m, s, in that order. Uppercase and ISO-8601 also work. Value and unit is available for single-unit durations.",
                },
              ]}
              values={values}
              onChange={onChange}
              readOnly={readOnly}
            />
          )}
          {invalid && (
            <p role="alert">
              Enter a duration such as 30s or 1h30m30s, using units w, d, h, m, s in order.
            </p>
          )}
        </>
      )}
    </div>
  );
}
