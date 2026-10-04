/**
 * The shared icon set behind `Icon` — one named entry per glyph, each recording
 * its own drawing attributes, because the sources do not agree on them.
 *
 * Every `body` is its source `<svg>`'s CHILDREN copied VERBATIM — paths,
 * polylines, per-element paint — from the file named in the entry's own comment
 * (the studio tree is the reference; nothing here was redrawn or re-derived). Two
 * sites drawing the identical glyph are ONE entry, and the comment names both
 * sites; two different glyphs for one meaning keep two distinguishable names
 * (`edit` vs `edit-2`, `history` vs `clock`, `file` vs `file-text`).
 *
 * The ONE exception is the theme toggle's three glyphs (`sun`/`moon`/
 * `circle-half`): their source draws text characters (`◐`/`☀︎`/`☾`), which have
 * no path data to copy, so those three are drawn here in the same Feather idiom
 * the rest of the set's outlines follow. They say so in their own comment too.
 *
 * Colour is always `currentColor` — the glyph inherits it from its context, and
 * the entry decides only WHICH paint it is drawn with (see `IconVariant`).
 */
import { type ReactNode, useId } from "react";

/**
 * Kebab-case, named for what the glyph DEPICTS or for its conventional meaning —
 * never for the studio component that happened to draw it, so a caller asks for
 * `icon="history"` rather than `icon="history-icon-tsx"`.
 */
export type IconName =
  | "edit"
  | "edit-2"
  | "delete"
  | "copy"
  | "check"
  | "close"
  | "history"
  | "clock"
  | "json"
  | "code"
  | "sync"
  | "cloud-download"
  | "eye"
  | "play"
  | "stop"
  | "warning"
  | "file-text"
  | "settings"
  | "github"
  | "user"
  | "users"
  | "logout"
  | "id-card"
  | "dashboard"
  | "pulse"
  | "workflow"
  | "globe"
  | "lambda"
  | "sliders"
  | "file"
  | "plug"
  | "grid"
  | "folder"
  | "git-branch"
  | "coin"
  | "building"
  | "server"
  | "price-tag"
  | "lang-node"
  | "terminal"
  | "lang-python"
  | "lang-curl"
  | "sun"
  | "moon"
  | "circle-half"
  | "layout"
  | "run"
  | "trash"
  | "maximize"
  | "form"
  | "braces"
  | "settings-2";

/**
 * Which attributes the shared `<svg>` root carries — i.e. how the glyph is
 * painted. The sources are not uniform, and forcing them into one shape would
 * change how they render:
 *
 *   - `fill`   — Material-style: a single `fill="currentColor"` path, no stroke.
 *   - `stroke` — Feather-style outline: `fill="none"`, `stroke="currentColor"`,
 *                round caps/joins, plus the source's own `strokeWidth`.
 *   - `mixed`  — the glyph paints each element itself (the language marks: a
 *                stroked outline next to filled dots, and `lang-python`'s mask),
 *                so the root carries NO paint attribute at all, exactly as its
 *                source did. Adding a root stroke here would fatten every dot;
 *                `layout`'s single path paints nothing either, its colour coming
 *                from the surrounding control button — again as its source did.
 */
export type IconVariant = "fill" | "stroke" | "mixed";

/** One glyph: its source `<svg>`'s viewBox, its paint variant, and its children. */
interface IconDef {
  viewBox: string;
  variant: IconVariant;
  /** `stroke` variants only — the source's own weight (2 for Feather, 1.75 for the rail glyphs). */
  strokeWidth?: number;
  /** The source `<svg>`'s children, verbatim. */
  body: ReactNode;
}

/**
 * `lang-python`'s body, split out as a component for one reason: its eye holes
 * are punched with a `<mask>`, and a shared mask id would collide the moment two
 * of these render on one page — so it takes its id from `useId`, exactly as
 * `CallFromCodeButton.tsx` does. Nothing else in the set needs an instance.
 */
function PythonEyes() {
  const maskId = `w6w-py-eyes-${useId()}`;
  return (
    <>
      <title>Python</title>
      <mask id={maskId}>
        <rect x="0" y="0" width="24" height="24" fill="white" />
        <circle cx="9.1" cy="5.2" r="1" fill="black" />
        <circle cx="14.9" cy="18.8" r="1" fill="black" />
      </mask>
      <g mask={`url(#${maskId})`} fill="currentColor">
        <path d="M11.6 2.6c-3 0-4.9.7-4.9 2.6v2.2h5v.9H5.2C3.2 8.3 2 9.9 2 12v1.4c0 2 1.2 3.5 3.2 3.5h1.6v-2.5c0-2 1.6-3.6 3.6-3.6h4.3c1.6 0 2.9-1.3 2.9-2.9V5.2c0-1.8-1.8-2.6-4.8-2.6z" />
        <path d="M12.4 21.4c3 0 4.9-.7 4.9-2.6v-2.2h-5v-.9h6.5c2 0 3.2-1.6 3.2-3.6v-1.4c0-2-1.2-3.5-3.2-3.5h-1.6v2.5c0 2-1.6 3.6-3.6 3.6H9.3c-1.6 0-2.9 1.3-2.9 2.9v3.3c0 1.8 1.8 2.6 4.8 2.6z" />
      </g>
    </>
  );
}

/** The set. Entries are grouped for readability; `iconNames` is this object's own order. */
export const icons: Record<IconName, IconDef> = {
  /**
   * ui/src/components/EditButton.tsx (the two-path Feather pencil) — also drawn by `WorkflowFlowEditor.tsx`.
   */
  edit: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </>
    ),
  },
  /**
   * studio/src/pages/FunctionsPage.tsx — byte-identical to `EndpointsPage.tsx`'s pencil, and NOT the `edit` above: this one is Feather `edit-2`, a bare outline with no baseline.
   */
  "edit-2": {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      </>
    ),
  },
  /**
   * ui/src/components/DeleteButton.tsx — byte-identical to `studio/src/pages/AppsPage.tsx`'s `TrashIcon`.
   */
  delete: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </>
    ),
  },
  /**
   * ui/src/components/Copyable.tsx — the same glyph `studio/src/components/CallFromCodeButton.tsx` copies around.
   */
  copy: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>
    ),
  },
  /**
   * ui/src/components/Copyable.tsx — the copy affordance's "copied" state.
   */
  check: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <polyline points="20 6 9 17 4 12" />
      </>
    ),
  },
  /**
   * Feather `x` — the dismiss glyph for the `✕`/`×` characters studio's close and
   * remove buttons drew as text until now (T2), so those read as a drawing rather
   * than a font's idea of one. Drawn here rather than copied: the sources had no
   * `<svg>` to lift the paths from.
   */
  close: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </>
    ),
  },
  /**
   * studio/src/components/HistoryIcon.tsx — Material `query_stats`: a chart line under a magnifier.
   */
  history: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M19.88 18.47c.44-.7.7-1.51.7-2.39 0-2.49-2.01-4.5-4.5-4.5s-4.5 2.01-4.5 4.5 2.01 4.5 4.49 4.5c.88 0 1.7-.26 2.39-.7L21.58 23 23 21.58l-3.12-3.11zm-3.8.11c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zm-.36-8.5c-.74.02-1.45.18-2.1.45l-.55-.83-3.8 6.18-3.01-3.52-3.63 5.81L1 17l5-8 3 3.5L13 6l2.72 4.08zm2.59.5c-.64-.28-1.33-.45-2.05-.49L21.38 2 23 3.18l-4.69 7.4z" />
      </>
    ),
  },
  /**
   * studio/src/ui/rail/SettingsTool.tsx (the rail's "Version history" button) — a second glyph for the history MEANING; kept beside `history` under its own name because the two do not look alike.
   */
  clock: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15.5 14" />
      </>
    ),
  },
  /**
   * studio/src/components/JsonToggle.tsx — curly braces, the raw-JSON toggle.
   */
  json: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <path d="M8 3c-1.5 0-2 .8-2 2v3c0 1-.5 1.5-2 1.5v1c1.5 0 2 .5 2 1.5v3c0 1.2.5 2 2 2" />
        <path d="M16 3c1.5 0 2 .8 2 2v3c0 1 .5 1.5 2 1.5v1c-1.5 0-2 .5-2 1.5v3c0 1.2-.5 2-2 2" />
      </>
    ),
  },
  /**
   * studio/src/components/CallFromCodeButton.tsx — `< />`; byte-identical to `studio/src/ui/rail/CodeTool.tsx`'s `CodeToolIcon`.
   */
  code: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </>
    ),
  },
  /**
   * studio/src/components/SyncButton.tsx — Feather `refresh-cw`; byte-identical to `studio/src/pages/AppsPage.tsx`'s `RefreshIcon`.
   */
  sync: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </>
    ),
  },
  /**
   * studio/src/pages/AppsPage.tsx — a cloud with a down arrow: "re-fetch fresh from the remote".
   */
  "cloud-download": {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <path d="M8 17l4 4 4-4" />
        <path d="M12 12v9" />
        <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
      </>
    ),
  },
  /**
   * studio/src/pages/AppsPage.tsx — inspect.
   */
  eye: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  /**
   * studio/src/pages/WorkflowsPage.tsx — the run button.
   */
  play: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <polygon points="5 3 19 12 5 21 5 3" />
      </>
    ),
  },
  /**
   * studio/src/pages/WorkflowsPage.tsx — the stop button's filled square.
   */
  stop: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <rect x="5" y="5" width="14" height="14" rx="1" />
      </>
    ),
  },
  /**
   * studio/src/ui/rail/ErrorHandlingTool.tsx — Feather `alert-triangle`.
   */
  warning: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>
    ),
  },
  /**
   * studio/src/ui/rail/SettingsTool.tsx — a document with text lines (Feather `file-text`), the export/edit-JSON affordance. Distinct from `file` below, which has a folded corner and no lines.
   */
  "file-text": {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — gear; byte-identical to `ui/rail/AliasesTool.tsx`'s and `ui/rail/SettingsTool.tsx`'s own copies.
   */
  settings: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M10.09 2.18h3.82l-.47 2.76 2.53 1.06 1.62-2.29 2.7 2.7-2.29 1.62 1.06 2.53 2.76-.47v3.82l-2.76-.47-1.06 2.53 2.29 1.62-2.7 2.7-1.62-2.29-2.53 1.06.47 2.76h-3.82l.47-2.76-2.53-1.06-1.62 2.29-2.7-2.7 2.29-1.62-1.06-2.53-2.76.47v-3.82l2.76.47 1.06-2.53-2.29-1.62 2.7-2.7 1.62 2.29 2.53-1.06-.47-2.76ZM12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — the GitHub mark; byte-identical to `studio/src/pages/RepositoryPage.tsx`'s `GitHubMark` (which renders it at 16px, the header at 18px — hence `size`).
   */
  github: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.04 1.78 2.72 1.26 3.38.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.06.78 2.15v3.18c0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — one person, the user chip.
   */
  user: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — two overlapping people, the team roster. Deliberately separate from `user`.
   */
  users: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C16 16 13 14 9 14Zm8.5-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2c-.7 0-1.36.1-1.96.3 1.2.98 1.96 2.4 1.96 4.2V20h5v-1.5c0-2.2-2.4-4-5-4Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — an exit door and arrow.
   */
  logout: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M4 3h9v2H6v14h7v2H4V3Zm10.3 4.3 1.4-1.4L21.8 12l-6.1 6.1-1.4-1.4 3.7-3.7H9v-2h9l-3.7-3.7Z" />
      </>
    ),
  },
  /**
   * studio/src/components/SessionButton.tsx — an ID badge for the current session.
   */
  "id-card": {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-3 8c0-2 2-3 3-3s3 1 3 3H4Zm10-8h6v2h-6V8Zm0 4h6v2h-6v-2Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — 2x2 panels, the account dashboard. Distinct from `grid`, whose four cells are equal.
   */
  dashboard: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M3 3h8v6H3V3Zm0 8h8v10H3V11Zm10 4h8v6h-8v-6Zm0-12h8v10h-8V3Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — a heartbeat trace, the reliability board.
   */
  pulse: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M2 11h4.4l2-5 3.4 12 3-9 1.8 2H22v2h-6.4l-1-1.2-3.4 10.2-3.4-12-1 3H2v-2Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — three step boxes and their edges.
   */
  workflow: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M2 3h7v7H2V3Zm13 0h7v7h-7V3ZM9 5.5h6v2H9v-2ZM15 15h7v7h-7v-7Zm2.5-5h2v5h-2v-5Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — a globe, an Endpoint being a web address. Stroked at 1.75, the rail's own weight.
   */
  globe: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 1.75,
    body: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.4 2.4 3.8 5.8 3.8 9s-1.4 6.6-3.8 9c-2.4-2.4-3.8-5.8-3.8-9s1.4-6.6 3.8-9Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — a lambda, reusable functions.
   */
  lambda: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M14 3a3 3 0 0 0-3 3v3H8v2h3v4a1 1 0 0 1-1 1H8v2h2a3 3 0 0 0 3-3v-4h3V9h-3V6a1 1 0 0 1 1-1h2V3h-2Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — three adjustable tracks (secrets AND variables; a padlock was rejected, it names only the security half). The knob dots are filled over the stroked tracks.
   */
  sliders: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 1.75,
    body: (
      <>
        <path d="M3 6h9M17 6h4M3 12h4M11 12h10M3 18h13M20 18h1" />
        <circle cx="13" cy="6" r="2.25" fill="currentColor" stroke="none" />
        <circle cx="7.5" cy="12" r="2.25" fill="currentColor" stroke="none" />
        <circle cx="16.5" cy="18" r="2.25" fill="currentColor" stroke="none" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — a document with a folded corner, the JSON document store.
   */
  file: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V7h3.5L13 3.5ZM8 12h8v2H8v-2Zm0 4h8v2H8v-2Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — a power plug, external connections.
   */
  plug: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M8 2h2v4H8V2Zm6 0h2v4h-2V2ZM6 6h12v4a4 4 0 0 1-4 4h-1v5h-2v-5h-1a4 4 0 0 1-4-4V6Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — 2x2 equal squares, the app catalog.
   */
  grid: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — stacked folders, projects.
   */
  folder: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M3 5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm2 2v10h14V7H5Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — a branching line, a bound git repository.
   */
  "git-branch": {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — a ring, API tokens.
   */
  coin: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — a building, tenant administration.
   */
  building: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17h4v2H3v-2h2Zm2-15v2h2V6H7Zm0 4v2h2v-2H7Zm0 4v2h2v-2H7Zm4-8v2h2V6h-2Zm0 4v2h2v-2h-2Zm0 4v2h2v-2h-2Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — stacked server units, the Installation panel.
   */
  server: {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M4 4h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3 3.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM4 13h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Zm3 3.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx — a price tag with a dollar mark, the plan + invoices.
   */
  "price-tag": {
    viewBox: "0 0 24 24",
    variant: "fill",
    body: (
      <>
        <path d="M12.41 2H4a2 2 0 0 0-2 2v8.41a2 2 0 0 0 .59 1.41l9 9a2 2 0 0 0 2.82 0l7.59-7.59a2 2 0 0 0 0-2.82l-9-9A2 2 0 0 0 12.41 2ZM7 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm4.5 8.5-1-1L15 11l1 1-4.5 4.5Z" />
      </>
    ),
  },
  /**
   * studio/src/components/CallFromCodeButton.tsx — the Node mark, named for what it depicts.
   */
  "lang-node": {
    viewBox: "0 0 24 24",
    variant: "mixed",
    body: (
      <>
        <title>Node</title>
        <path
          d="M12 2.4 20.4 7.2v9.6L12 21.6 3.6 16.8V7.2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M9.4 15.4V8.9l5.2 6.2V8.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  /**
   * studio/src/components/CallFromCodeButton.tsx — a terminal with a `>_` prompt, the CLI tab.
   */
  terminal: {
    viewBox: "0 0 24 24",
    variant: "mixed",
    body: (
      <>
        <title>CLI</title>
        <rect
          x="2.6"
          y="4.4"
          width="18.8"
          height="15.2"
          rx="2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <polyline
          points="6.8 9.6 9.8 12 6.8 14.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="12.4"
          y1="15"
          x2="17"
          y2="15"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </>
    ),
  },
  /**
   * studio/src/components/CallFromCodeButton.tsx — the Python mark (see `PythonEyes` below, which owns its mask id).
   */
  "lang-python": {
    viewBox: "0 0 24 24",
    variant: "mixed",
    body: <PythonEyes />,
  },
  /**
   * studio/src/components/CallFromCodeButton.tsx — curl's swoosh over a request in flight.
   */
  "lang-curl": {
    viewBox: "0 0 24 24",
    variant: "mixed",
    body: (
      <>
        <title>curl</title>
        <path
          d="M3 15.5c2.4 0 3.6-2.2 5.1-4.6C9.8 8.2 11.3 5.5 14 5.5c2.6 0 4 2 4 4.2 0 2.1-1.4 3.6-3.2 3.6-1.5 0-2.5-1-2.5-2.2 0-1.1.8-1.9 1.8-1.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="4.4" cy="18.6" r="1.5" fill="currentColor" />
        <circle cx="20" cy="18.6" r="1.5" fill="currentColor" />
        <line
          x1="7.4"
          y1="18.6"
          x2="17"
          y2="18.6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeDasharray="0.1 3.6"
        />
      </>
    ),
  },
  /**
   * studio/src/components/Layout.tsx's theme toggle — the three glyphs that
   * button draws for its three states. It used to draw the text characters
   * `◐`/`☀︎`/`☾`, which no shared set can hold: a text glyph is not a drawn
   * shape, and `IconButton` names its glyph instead. Feather-style outline
   * (`strokeWidth` 2, like the rest of the Feather-derived entries) so all
   * three read as one family at 16px. `circle-half`'s filled half is the
   * "system" state — half light, half dark.
   */
  sun: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    body: (
      <>
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </>
    ),
  },
  moon: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    body: (
      <>
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
      </>
    ),
  },
  "circle-half": {
    viewBox: "0 0 24 24",
    variant: "mixed",
    body: (
      <>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 3a9 9 0 0 1 0 18V3Z" fill="currentColor" />
      </>
    ),
  },
  /**
   * ui/src/WorkflowFlowEditor.tsx's `AutoLayoutIcon` — the auto-layout control's
   * three-box hierarchy (one parent over two children), on a `0 0 24 24` box.
   *
   * `mixed` — rooted in the "the root adds NO paint" half of that variant, which
   * this glyph needs literally: its source `<svg>` carried no paint attribute at
   * all, and neither does its path, so a `fill="currentColor"` on the root would
   * NOT be the source's markup and a `fill="none" stroke=…` root would render
   * NOTHING at all here. The colour comes from the context — the path sits inside
   * a `@xyflow/react` control button whose `svg { fill: currentColor }` paints it
   * (`@xyflow/react/dist/style.css`), exactly as it does today.
   */
  layout: {
    viewBox: "0 0 24 24",
    variant: "mixed",
    body: (
      <>
        <path d="M9 3h6v6H9zM11 9h2v2h-2zM4 11h16v2H4zM4 13h2v2H4zM18 13h2v2h-2zM2 15h6v6H2zM16 15h6v6h-6z" />
      </>
    ),
  },
  /**
   * ui/src/WorkflowFlowEditor.tsx's node-toolbar "Test-run this step" button — a
   * play triangle, but NOT `play` above: its points are its own (14 wide × 16
   * tall against `play`'s 14 × 18), so it keeps its own entry rather than being
   * redrawn to match.
   */
  run: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <polygon points="6 4 20 12 6 20 6 4" />
      </>
    ),
  },
  /**
   * ui/src/WorkflowFlowEditor.tsx's node-toolbar delete button — Feather `trash`
   * (lid + body, no inner lines); distinct from `delete` above, which is the
   * fuller 4-shape `trash-2`.
   */
  trash: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </>
    ),
  },
  /**
   * ui/src/ParamsForm.tsx's JSON field — "Open in full view": Feather
   * `maximize-2`, the two diagonal expand arrows.
   */
  maximize: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </>
    ),
  },
  /**
   * ui/src/StepBuilderModal.tsx's `CONFIG_VIEW_GLYPHS.props` — a bordered panel
   * with three text lines: the step's field form. Distinct from `file-text`,
   * which is a document with a folded corner.
   */
  form: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="7" y1="8" x2="17" y2="8" />
        <line x1="7" y1="12" x2="17" y2="12" />
        <line x1="7" y1="16" x2="13" y2="16" />
      </>
    ),
  },
  /**
   * ui/src/StepBuilderModal.tsx's `CONFIG_VIEW_GLYPHS["params-code"]` — square
   * braces, the params as a VALUE. A second glyph for the braces meaning beside
   * `json` (whose curved `<path>` braces it does not share); its own name rather
   * than a redraw, so the two views stay tellable apart at 15px.
   */
  braces: {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <polyline points="9 4 7 4 7 10 5 12 7 14 7 20 9 20" />
        <polyline points="15 4 17 4 17 10 19 12 17 14 17 20 15 20" />
      </>
    ),
  },
  /**
   * ui/src/StepBuilderModal.tsx's `CONFIG_VIEW_GLYPHS.config` — Feather
   * `settings`, the node-settings gear. Distinct from `settings` above (the
   * filled Material gear Layout.tsx draws): this one is the stroked outline.
   */
  "settings-2": {
    viewBox: "0 0 24 24",
    variant: "stroke",
    strokeWidth: 2,
    body: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
  },
};

/**
 * Every name in the set, in the object's curated order — what the gallery story
 * renders and what `Icon.test.ts` walks. Derived from `icons` rather than
 * repeated, so it cannot drift from what `Icon` can actually draw.
 */
export const iconNames: readonly IconName[] = Object.keys(icons) as IconName[];
