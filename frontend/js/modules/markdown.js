/**
 * Lightweight safe markdown → HTML for mentor replies.
 * Escapes HTML first, then applies a small subset: bold/italic, lists, headings, code, links.
 * Links are parsed from raw text and validated before attribute insertion (XSS-safe).
 */

import { safeHttpUrl } from "./safe-url.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInlineNoLinks(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^\w_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  return out;
}

function formatInline(text) {
  const raw = String(text ?? "");
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let result = "";
  let lastIndex = 0;
  let match;
  while ((match = re.exec(raw)) !== null) {
    result += formatInlineNoLinks(raw.slice(lastIndex, match.index));
    const label = escapeHtml(match[1]);
    const url = safeHttpUrl(match[2]);
    if (url) {
      // url already validated; escapeHtml is defense-in-depth (no quotes remain)
      result += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    } else {
      result += label;
    }
    lastIndex = match.index + match[0].length;
  }
  result += formatInlineNoLinks(raw.slice(lastIndex));
  return result;
}

function isHorizontalRule(line) {
  return /^(-{3,}|\*{3,}|_{3,})\s*$/.test(String(line || "").trim());
}

function isBlockBoundary(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return true;
  if (isHorizontalRule(trimmed)) return true;
  if (/^(#{1,3})\s+/.test(trimmed)) return true;
  if (/^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) return true;
  if (/^>\s?/.test(trimmed)) return true;
  return false;
}

/**
 * @param {string} markdown
 * @returns {string} sanitized HTML
 */
export function renderMarkdown(markdown) {
  const raw = String(markdown || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  const lines = raw.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      blocks.push('<hr class="md-hr" />');
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level + 2} class="md-h">${formatInline(heading[2].trim())}</h${level + 2}>`);
      i += 1;
      continue;
    }

    if (/^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && (ordered ? /^\d+\.\s+/.test(lines[i]) : /^[-*•]\s+/.test(lines[i]))) {
        const itemText = lines[i].replace(ordered ? /^\d+\.\s+/ : /^[-*•]\s+/, "");
        items.push(`<li>${formatInline(itemText)}</li>`);
        i += 1;
      }
      blocks.push(ordered ? `<ol class="md-list">${items.join("")}</ol>` : `<ul class="md-list">${items.join("")}</ul>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(`<blockquote class="md-quote">${formatInline(quote.join(" "))}</blockquote>`);
      continue;
    }

    const para = [];
    while (i < lines.length && !isBlockBoundary(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length) {
      blocks.push(`<p class="md-p">${formatInline(para.join(" "))}</p>`);
    }
  }

  return blocks.join("");
}

/** Plain text for typewriter — keeps readable spacing and --- separators. */
export function markdownToPlain(markdown) {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^\w*])\*([^*]+)\*/g, "$1$2")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^(-{3,}|\*{3,}|_{3,})\s*$/gm, "———")
    .replace(/^[-*•]\s+/gm, "• ")
    .trim();
}
