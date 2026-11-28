const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);

function renderInline(raw) {
  let s = escapeHtml(raw);
  // Inline code
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold + italic
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Strikethrough
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return s;
}

/**
 * Safely renders full quote Markdown (headings, bullets, dots, numbered lists,
 * checkboxes, callout boxes, dividers, bold/italic/code) to sanitized HTML.
 * All raw HTML is escaped first so no script or tag injection is possible.
 */
export function renderQuoteMarkdown(input) {
  const text = String(input ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return "";

  const lines = text.split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line
    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(?:---+|\*\*\*+|___+)$/.test(trimmed)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // Headings (#, ##, ###)
    const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length + 2; // h3, h4, h5 inside quote doc
      const tag = `h${Math.min(level, 6)}`;
      out.push(`<${tag} class="qmd-h${hMatch[1].length}">${renderInline(hMatch[2])}</${tag}>`);
      i++;
      continue;
    }

    // Callout / Box (> ...)
    if (/^>\s?/.test(trimmed)) {
      const boxLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        boxLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        `<div class="qmd-box">${boxLines.map((l) => (l ? `<p>${renderInline(l)}</p>` : "")).join("")}</div>`,
      );
      continue;
    }

    // Checkboxes (- [ ] / - [x] / ☐ / ☑)
    if (/^(?:[-*]\s+\[[ xX]\]|[☐☑])\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^(?:[-*]\s+\[[ xX]\]|[☐☑])\s+/.test(lines[i].trim())) {
        const t = lines[i].trim();
        const checked = /^[-*]\s+\[[xX]\]|^☑/.test(t);
        const body = t.replace(/^(?:[-*]\s+\[[ xX]\]|[☐☑])\s+/, "");
        items.push(
          `<li class="qmd-check${checked ? " is-checked" : ""}"><span class="qmd-box-mark" aria-hidden="true">${checked ? "☑" : "☐"}</span><span>${renderInline(body)}</span></li>`,
        );
        i++;
      }
      out.push(`<ul class="qmd-checklist">${items.join("")}</ul>`);
      continue;
    }

    // Bullets or Dots (- , * , • )
    if (/^(?:[-*•])\s+/.test(trimmed)) {
      const isDots = /^•\s+/.test(trimmed);
      const items = [];
      while (i < lines.length && /^(?:[-*•])\s+/.test(lines[i].trim())) {
        const body = lines[i].trim().replace(/^(?:[-*•])\s+/, "");
        items.push(`<li>${renderInline(body)}</li>`);
        i++;
      }
      out.push(`<ul class="${isDots ? "qmd-dots" : "qmd-bullets"}">${items.join("")}</ul>`);
      continue;
    }

    // Numbered list (1. )
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const body = lines[i].trim().replace(/^\d+\.\s+/, "");
        items.push(`<li>${renderInline(body)}</li>`);
        i++;
      }
      out.push(`<ol class="qmd-numbered">${items.join("")}</ol>`);
      continue;
    }

    // Paragraph (collect consecutive plain lines)
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(?:---+|\*\*\*+|___+)$/.test(lines[i].trim()) &&
      !/^#{1,3}\s+/.test(lines[i].trim()) &&
      !/^>\s?/.test(lines[i].trim()) &&
      !/^(?:[-*•])\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^[☐☑]\s+/.test(lines[i].trim())
    ) {
      para.push(renderInline(lines[i].trim()));
      i++;
    }
    out.push(`<p>${para.join("<br>")}</p>`);
  }

  return `<div class="qmd">${out.join("")}</div>`;
}
