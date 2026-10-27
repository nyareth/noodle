import katex from "katex";

/**
 * Turns the plain text stored in the question bank into safe HTML.
 *
 *  - Everything is HTML-escaped, so the wording is shown exactly as supplied (no Markdown, no raw HTML).
 *  - Blank lines separate paragraphs; single newlines are kept (CSS uses white-space: pre-wrap).
 *  - Lines starting with "- ", "* " or "1. " / "1) " become lists.
 *  - ```fenced``` blocks become <pre> code blocks.
 *  - Math: $...$ and \(...\) inline, $$...$$ and \[...\] as display (KaTeX). "$5 and $10" is NOT treated as math.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<![\s\\])\$(?!\d)/g;

function math(tex: string, display: boolean, raw: string): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      output: "htmlAndMathml",
      strict: "ignore",
      trust: false,
      maxSize: 20,
      maxExpand: 500,
    });
  } catch {
    return escapeHtml(raw); // not valid TeX: show it literally
  }
}

function inlineHtml(s: string): string {
  let out = "";
  let last = 0;
  for (const m of s.matchAll(MATH_RE)) {
    const idx = m.index ?? 0;
    out += escapeHtml(s.slice(last, idx));
    const raw = m[0];
    if (m[1] !== undefined) out += math(m[1], true, raw);
    else if (m[2] !== undefined) out += math(m[2], true, raw);
    else if (m[3] !== undefined) out += math(m[3], false, raw);
    else out += math(m[4], false, raw);
    last = idx + raw.length;
  }
  return out + escapeHtml(s.slice(last));
}

const UL = /^\s*[-*•]\s+(.*)$/;
const OL = /^\s*(\d{1,3})[.)]\s+(.*)$/;

function blocks(chunk: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${inlineHtml(para.join("\n"))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((i) => `<li>${inlineHtml(i)}</li>`).join("");
    out.push(list.ordered ? `<ol start="${list.start}">${items}</ol>` : `<ul>${items}</ul>`);
    list = null;
  };

  for (const line of chunk.split("\n")) {
    if (line.trim() === "") { flushPara(); flushList(); continue; }
    const ul = UL.exec(line);
    const ol = ul ? null : OL.exec(line);
    if (ul) {
      if (!list || list.ordered) { flushPara(); flushList(); list = { ordered: false, start: 1, items: [] }; }
      list.items.push(ul[1]);
    } else if (ol) {
      if (!list || !list.ordered) { flushPara(); flushList(); list = { ordered: true, start: Number(ol[1]), items: [] }; }
      list.items.push(ol[2]);
    } else if (list && /^\s+\S/.test(line)) {
      list.items[list.items.length - 1] += "\n" + line.trim(); // wrapped list item
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join("");
}

export function richTextToHtml(text: string): string {
  const src = text.replace(/\r\n?/g, "\n");
  const fence = /^```[^\n]*\n([\s\S]*?)\n?```[ \t]*$/gm;
  const parts: string[] = [];
  let last = 0;
  for (const m of src.matchAll(fence)) {
    const idx = m.index ?? 0;
    parts.push(blocks(src.slice(last, idx)));
    parts.push(`<pre class="qcode"><code>${escapeHtml(m[1])}</code></pre>`);
    last = idx + m[0].length;
  }
  parts.push(blocks(src.slice(last)));
  return parts.join("");
}

/** Inline-only variant for answer options and short fragments. */
export function optionHtml(text: string): string {
  return inlineHtml(text.replace(/\r\n?/g, "\n").trim());
}
