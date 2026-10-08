import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  /** `auto` picks a native `<select>` for short lists, a combobox for long ones. */
  mode?: "select" | "combobox" | "auto";
  /** true (default): typing only filters; value changes by picking. false: free text is a value. */
  forceSelection?: boolean;
  /** Estimated option height in px, used by `auto` mode. Default 32. */
  optionHeight?: number;
  className?: string;
}

/** Combobox is chosen when the list would take more than 60% of the viewport. */
export function shouldUseCombobox(
  count: number,
  optionHeight: number,
  viewportHeight: number,
): boolean {
  return count * optionHeight > 0.6 * viewportHeight;
}

/** Case-insensitive substring match on label and value. */
export function filterOptions(options: ComboboxOption[], query: string): ComboboxOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
  );
}

const LIST_STYLE: CSSProperties = {
  position: "absolute",
  zIndex: 50,
  left: 0,
  right: 0,
  top: "100%",
  maxHeight: 240,
  overflowY: "auto",
  margin: 0,
  padding: 4,
  listStyle: "none",
  background: "var(--w6w-surface, #fff)",
  border: "1px solid var(--w6w-border, #ccc)",
  borderRadius: 6,
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
};

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  "aria-label": ariaLabel,
  mode = "auto",
  forceSelection = true,
  optionHeight = 32,
  className,
}: ComboboxProps) {
  const useBox =
    mode === "combobox" ||
    (mode === "auto" &&
      shouldUseCombobox(
        options.length,
        optionHeight,
        typeof window === "undefined" ? 0 : window.innerHeight,
      ));

  const id = useId();
  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? (forceSelection ? "" : value);
  const [text, setText] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(selectedLabel);
  }, [selectedLabel]);

  const shown = useMemo(
    () => (filtering ? filterOptions(options, text) : options),
    [options, text, filtering],
  );

  if (!useBox) {
    return (
      <select
        className={className}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      >
        {placeholder !== undefined && value === "" && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  const optId = (i: number) => `${id}-opt-${i}`;

  const close = () => {
    setOpen(false);
    setFiltering(false);
  };

  const pick = (o: ComboboxOption) => {
    setText(o.label);
    onChange(o.value);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && shown[active]) {
        e.preventDefault();
        pick(shown[active]);
      } else if (!forceSelection) {
        onChange(text);
        close();
      }
    } else if (e.key === "Escape") {
      if (open) e.stopPropagation();
      setText(selectedLabel);
      close();
    }
  };

  const onBlur = () => {
    if (forceSelection) setText(selectedLabel);
    else if (text !== value) onChange(text);
    close();
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <input
        type="text"
        role="combobox"
        className={className}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? optId(active) : undefined}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setFiltering(true);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      {open && (
        <div
          id={`${id}-list`}
          // biome-ignore lint/a11y/useFocusableInteractive lint/a11y/useSemanticElements: ARIA popup, focus stays on the input via aria-activedescendant
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          style={LIST_STYLE}
        >
          {shown.map((o, i) => (
            <div
              key={o.value}
              id={optId(i)}
              // biome-ignore lint/a11y/useFocusableInteractive lint/a11y/useSemanticElements: ARIA popup, focus stays on the input via aria-activedescendant
              role="option"
              tabIndex={-1}
              aria-selected={o.value === value}
              style={{
                padding: "6px 8px",
                cursor: "pointer",
                borderRadius: 4,
                background: i === active ? "var(--w6w-hover, rgba(127,127,127,0.18))" : undefined,
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {o.label}
            </div>
          ))}
          {shown.length === 0 && (
            <div role="presentation" style={{ padding: "6px 8px", opacity: 0.6 }}>
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}
