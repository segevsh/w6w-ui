// Run: node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/Markdown.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, safeUrl } from "../Markdown.tsx";

const render = (content: string) => renderToStaticMarkup(createElement(Markdown, { content }));

const hrefOf = (html: string): string | null => {
  const a = /<a\b[^>]*>/.exec(html);
  if (!a) return null;
  const h = /\shref="([^"]*)"/.exec(a[0]);
  return h ? h[1] : null;
};

test("script tag is dropped (skipHtml)", () => {
  const html = render("hello <script>alert(1)</script> world\n\n<script>alert(2)</script>");
  assert.doesNotMatch(html, /<script/i);
});

test("iframe tag is dropped (skipHtml)", () => {
  const html = render('<iframe src="https://evil.example"></iframe>\n\ntext');
  assert.doesNotMatch(html, /<iframe/i);
});

test("raw <img onerror> produces no img tag and no on* attribute (skipHtml)", () => {
  const html = render("<img src=x onerror=alert(1)>\n\ntext <img src=x onerror=alert(2)> more");
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /\bonerror\s*=/i);
});

test("inline onclick in raw HTML yields no on* attribute (skipHtml)", () => {
  const html = render(
    '<div onclick="alert(1)">x</div>\n\n<a href="https://e" onclick="alert(2)">y</a>',
  );
  assert.doesNotMatch(html, /\bon[a-z]+\s*=/i);
  assert.doesNotMatch(html, /<div[^>]*>\s*x/i);
  assert.doesNotMatch(html, /<a\b/i);
});

test("javascript: link has no usable href (allowlist)", () => {
  const h = hrefOf(render("[x](javascript:alert(1))"));
  assert.ok(h === null || h === "", `href was ${h}`);
});

test("JAVASCRIPT: (uppercase) link has no usable href (allowlist)", () => {
  const h = hrefOf(render("[x](JAVASCRIPT:alert(1))"));
  assert.ok(h === null || h === "", `href was ${h}`);
});

test("data: link has no usable href (allowlist)", () => {
  const h = hrefOf(render("[x](data:text/html,<script>alert(1)</script>)"));
  assert.ok(h === null || h === "", `href was ${h}`);
});

test("vbscript: link has no usable href (allowlist)", () => {
  const h = hrefOf(render("[x](vbscript:msgbox(1))"));
  assert.ok(h === null || h === "", `href was ${h}`);
});

test("scheme obfuscated with a tab/entity still has no usable href (allowlist)", () => {
  for (const md of [
    "[x](java&#9;script:alert(1))",
    "[x](&#106;avascript:alert(1))",
    "[x]( javascript:alert(1))",
  ]) {
    const h = hrefOf(render(md));
    assert.ok(h === null || h === "", `${md} -> href ${h}`);
  }
});

test("relative and protocol-relative links are not kept (allowlist)", () => {
  assert.equal(safeUrl("/relative/path"), "");
  assert.equal(safeUrl("//evil.example/x"), "");
  assert.equal(safeUrl("not a url"), "");
  assert.equal(safeUrl("ftp://example.com/x"), "");
});

test("http, https and mailto hrefs are kept", () => {
  assert.equal(hrefOf(render("[x](http://example.com/a)")), "http://example.com/a");
  assert.equal(hrefOf(render("[x](https://example.com/a)")), "https://example.com/a");
  assert.equal(hrefOf(render("[x](mailto:a@example.com)")), "mailto:a@example.com");
  assert.equal(safeUrl("HTTPS://example.com"), "HTTPS://example.com");
});

test("links open in a new tab with noopener noreferrer nofollow", () => {
  const html = render("[x](https://example.com)");
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
});

test("markdown image renders no <img> (disallowedElements)", () => {
  const html = render("![a](https://e/x.png)");
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /x\.png/);
});

test("ordinary markdown still renders", () => {
  const html = render("# Title\n\n**bold** and `code`\n\n- a\n- b");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<li>a<\/li>/);
});
