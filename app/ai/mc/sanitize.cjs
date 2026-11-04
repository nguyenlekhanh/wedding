'use strict';

/**
 * Sanitising layer for anything the MC will say, and anything a guest types.
 *
 * Two different threats:
 *  1. Model output must be plain spoken dialogue — no markdown, URLs, code or
 *     "instructions" that could look like commands to an operator.
 *  2. Guest comments are untrusted input fed to a model (prompt injection).
 *     We strip control characters, cap the length and defuse classic injection
 *     phrases, and the prompt itself frames comments strictly as data.
 */

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) (instructions|prompts|rules)/i,
  /disregard (all )?(previous|prior|above)/i,
  /system prompt/i,
  /you are now/i,
  /act as (an? )?(admin|developer|system)/i,
  /(reveal|print|show) (your|the) (prompt|instructions|api key|key)/i,
  /new instructions?:/i,
  /<\|.*?\|>/g
];

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+/gi;
const MD_RE = /[*_`#>~|]+/g;
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;

function stripControl(text) {
  // Tabs/newlines become spaces; other control chars are dropped.
  return String(text == null ? '' : text)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, '');
}

function collapse(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/** Neutralise prompt-injection attempts while keeping the rest of the remark. */
function defuseInjection(text) {
  let out = stripControl(text);
  for (const re of INJECTION_PATTERNS) out = out.replace(re, ' ');
  return collapse(out);
}

/**
 * Turn a model reply into a single speakable line.
 * Returns '' when nothing safe is left.
 */
function sanitizeSpoken(raw, maxChars = 180) {
  let text = stripControl(raw)
    .replace(/```[\s\S]*?```/g, ' ')          // code fences
    .replace(/`[^`]*`/g, ' ')                 // inline code
    .replace(URL_RE, ' ')                     // links (never speak a URL)
    .replace(/<[^>]*>/g, ' ')                 // tags
    .replace(/^\s*(mc|assistant|host|system)\s*:\s*/i, '')
    .replace(/\b(assistant|system|user)\s*:\s*/gi, ' ')
    .replace(MD_RE, ' ')
    .replace(EMOJI_RE, ' ')
    .replace(/["“”„«»]/g, '')                 // TTS reads quotes awkwardly
    .replace(/\s*[-–—]{2,}\s*/g, ', ')
    .replace(/\s+([,.!?;:])/g, '$1');

  text = collapse(text);

  // Keep at most two sentences: MC lines must stay short.
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 2) text = sentences.slice(0, 2).join(' ');
  if (text.length > maxChars) {
    const cut = text.slice(0, maxChars);
    const lastStop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
    text = lastStop > 40 ? cut.slice(0, lastStop + 1) : cut.replace(/[,;\s]+\S*$/, '') + '.';
  }
  // A line that is only punctuation is not worth speaking.
  return /[\p{L}\p{N}]/u.test(text) ? text.trim() : '';
}

/** Guest comment → safe short data string for the prompt. */
function sanitizeGuestText(raw, max = 120) {
  const defused = defuseInjection(raw);
  return defused.length > max ? defused.slice(0, max) : defused;
}

/** Guest display name → safe short label (no newlines, no brace placeholders). */
function sanitizeName(raw, max = 40) {
  const name = collapse(stripControl(raw))
    .replace(/[{}<>`]/g, '')
    .slice(0, max);
  return name || 'a guest';
}

function isInjection(raw) {
  const text = String(raw || '');
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

/** Cheap similarity for duplicate suppression (token Jaccard). */
function similarity(a, b) {
  const norm = (s) => new Set(String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean));
  const A = norm(a);
  const B = norm(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

module.exports = {
  sanitizeSpoken,
  sanitizeGuestText,
  sanitizeName,
  defuseInjection,
  isInjection,
  similarity,
  collapse
};
