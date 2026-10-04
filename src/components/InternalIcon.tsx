/**
 * InternalIcon — an internal pseudo-app's glyph on a rounded tile, sized and
 * shaped to match `AppIcon`'s image tile so internal (`@w6w/*`) nodes and app
 * nodes read as the same family everywhere they appear (canvas, add-step
 * picker, edit modal). The glyph markup comes from the node def
 * (`InternalNodeDef.icon` / `internalNodeIcon`) — static, in-repo SVG (no user
 * input). It strokes with the accent color and tracks the active theme.
 *
 * Deliberately NOT the shared `Icon` (`./Icon.tsx`), despite owning an `<svg>`:
 * this is a DATA-DRIVEN per-app identity mark — its content is a markup string
 * off the node def, one glyph per internal app, not a fixed UI glyph with a name
 * in the set (`./icons.tsx`). Unifying them would mean changing
 * `InternalNodeDef` to carry a name instead of its markup, which is a data-model
 * change, not an icon migration.
 */
export function InternalIcon({ icon, size = 28 }: { icon: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 6,
        flexShrink: 0,
        background: "var(--w6w-icon-swatch, var(--w6w-panel-2))",
        color: "var(--w6w-accent)",
      }}
    >
      <svg
        width={Math.round(size * 0.6)}
        height={Math.round(size * 0.6)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static, in-repo SVG glyph markup (no user input)
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    </span>
  );
}
