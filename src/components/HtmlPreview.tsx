/** Vendor HTML is hostile. NEVER dangerouslySetInnerHTML it; this is the only render path. */
export const HTML_PREVIEW_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

/** The CSP meta is FIRST so it is parsed into <head> before any payload byte. */
export function htmlPreviewSrcDoc(html: string): string {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}">${html}`;
}

export function HtmlPreview({ html }: { html: string }) {
  return (
    <iframe
      title="HTML preview"
      className="w6w-html-preview"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={htmlPreviewSrcDoc(html)}
    />
  );
}
