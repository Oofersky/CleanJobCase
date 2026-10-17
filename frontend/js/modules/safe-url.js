/**
 * Allow only http(s) URLs safe for href attributes / navigation.
 * Rejects javascript:, data:, and attribute-breakout characters.
 */

export function safeHttpUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const href = parsed.href;
  // Block characters that break out of quoted HTML attributes after entity decode
  if (/["'<>`\\\s]/.test(href)) return null;
  return href;
}
