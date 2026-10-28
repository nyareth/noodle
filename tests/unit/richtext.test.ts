import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, optionHtml, richTextToHtml } from "../../src/lib/richtext";

test("HTML in question text is shown literally, never executed", () => {
  const html = richTextToHtml('<img src=x onerror="alert(1)"> and <script>alert(2)</script>');
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.equal(escapeHtml(`"'&<>`), "&quot;&#39;&amp;&lt;&gt;");
  assert.ok(!optionHtml("<b>x</b>").includes("<b>"));
});

test("blank lines make paragraphs; list lines make lists", () => {
  const html = richTextToHtml("Intro line\n- first\n- second\n\nSecond paragraph");
  assert.equal(html, "<p>Intro line</p><ul><li>first</li><li>second</li></ul><p>Second paragraph</p>");
  assert.equal(richTextToHtml("1. one\n2. two"), '<ol start="1"><li>one</li><li>two</li></ol>');
});

test("code fences keep their text (escaped)", () => {
  assert.equal(richTextToHtml("```\n<b>x</b>\n```"), '<pre class="qcode"><code>&lt;b&gt;x&lt;/b&gt;</code></pre>');
});

test("TeX renders, currency does not", () => {
  assert.ok(richTextToHtml("Solve $x^2 + 1$").includes('class="katex"'));
  assert.ok(richTextToHtml("$$\\frac{1}{2}$$").includes("katex-display"));
  const money = richTextToHtml("It costs $5 and then $10.");
  assert.ok(!money.includes("katex"));
  assert.ok(money.includes("$5 and then $10."));
});

test("invalid TeX falls back to the literal text", () => {
  assert.ok(richTextToHtml("$\\notacommand{$").includes("$\\notacommand{$"));
});
