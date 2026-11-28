import { useRef, useState } from "preact/hooks";
import { renderQuoteMarkdown } from "../../../shared/quote-markdown.mjs";

interface MarkdownFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  rows?: number;
  className?: string;
  placeholder?: string;
}

export function MarkdownField({
  label,
  value,
  onChange,
  required,
  disabled,
  maxLength,
  rows = 8,
  className = "",
  placeholder = "",
}: MarkdownFieldProps) {
  const [previewing, setPreviewing] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  function applyPrefix(prefix: string) {
    const el = areaRef.current;
    if (!el || disabled) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);

    if (selected) {
      const updated = selected
        .split("\n")
        .map((line) => (line.trim() ? `${prefix}${line}` : line))
        .join("\n");
      const next = before + updated + after;
      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start, start + updated.length);
      });
    } else {
      const needsNewline = before.length > 0 && !before.endsWith("\n");
      const insert = (needsNewline ? "\n" : "") + prefix;
      const next = before + insert + after;
      onChange(next);
      const pos = start + insert.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    }
  }

  function applyWrap(left: string, right = left, fallback = "text") {
    const el = areaRef.current;
    if (!el || disabled) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || fallback;
    const next = value.slice(0, start) + left + selected + right + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + left.length, start + left.length + selected.length);
    });
  }

  function insertDivider() {
    const el = areaRef.current;
    if (!el || disabled) return;
    const start = el.selectionStart ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(el.selectionEnd ?? start);
    const insert = (before.length && !before.endsWith("\n") ? "\n" : "") + "---\n";
    onChange(before + insert + after);
    const pos = start + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div class="ui-field quote-scope-field qmd-editor">
      <div class="qmd-header">
        <span class="qmd-label">{label}{required ? " *" : ""}</span>
        <div class="qmd-toolbar" role="toolbar" aria-label={`${label} formatting tools`}>
          {!previewing && (
            <>
              <button type="button" class="qmd-tool" title="Heading 1" disabled={disabled} onClick={() => applyPrefix("# ")}>H1</button>
              <button type="button" class="qmd-tool" title="Heading 2" disabled={disabled} onClick={() => applyPrefix("## ")}>H2</button>
              <button type="button" class="qmd-tool" title="Heading 3" disabled={disabled} onClick={() => applyPrefix("### ")}>H3</button>
              <span class="qmd-sep" aria-hidden="true" />
              <button type="button" class="qmd-tool" title="Bold" disabled={disabled} onClick={() => applyWrap("**", "**", "bold text")}><strong>B</strong></button>
              <button type="button" class="qmd-tool" title="Italic" disabled={disabled} onClick={() => applyWrap("*", "*", "italic text")}><em>I</em></button>
              <span class="qmd-sep" aria-hidden="true" />
              <button type="button" class="qmd-tool" title="Bullet list" disabled={disabled} onClick={() => applyPrefix("- ")}>• Bullets</button>
              <button type="button" class="qmd-tool" title="Dot list" disabled={disabled} onClick={() => applyPrefix("• ")}>◦ Dots</button>
              <button type="button" class="qmd-tool" title="Numbered list" disabled={disabled} onClick={() => applyPrefix("1. ")}>1. List</button>
              <span class="qmd-sep" aria-hidden="true" />
              <button type="button" class="qmd-tool" title="Checkbox" disabled={disabled} onClick={() => applyPrefix("- [ ] ")}>☐ Box</button>
              <button type="button" class="qmd-tool" title="Checked box" disabled={disabled} onClick={() => applyPrefix("- [x] ")}>☑ Checked</button>
              <button type="button" class="qmd-tool" title="Callout box" disabled={disabled} onClick={() => applyPrefix("> ")}>▭ Callout</button>
              <button type="button" class="qmd-tool" title="Horizontal divider" disabled={disabled} onClick={insertDivider}>— Line</button>
              <span class="qmd-sep" aria-hidden="true" />
            </>
          )}
          <button
            type="button"
            class={"qmd-tool qmd-preview-toggle" + (previewing ? " is-active" : "")}
            onClick={() => setPreviewing((v) => !v)}
          >
            {previewing ? "Edit Markdown" : "Preview"}
          </button>
        </div>
      </div>

      {previewing ? (
        <div
          class={"qmd-preview-pane " + className}
          dangerouslySetInnerHTML={{
            __html: value.trim()
              ? renderQuoteMarkdown(value)
              : '<p class="text-muted">Nothing entered yet.</p>',
          }}
        />
      ) : (
        <textarea
          ref={areaRef}
          class={"ui-input " + className}
          rows={rows}
          value={value}
          required={required}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          onInput={(e) => onChange(e.currentTarget.value)}
        />
      )}
    </div>
  );
}
