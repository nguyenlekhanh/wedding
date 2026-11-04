'use strict';

/**
 * Minimal .env reader (no dependency, no dotenv package).
 *
 * Rules that matter for this project:
 *  - Never overwrite a variable that already exists in process.env.
 *  - Never log or return raw values beyond a redacted summary.
 *  - The project keeps its .env at the repository root, one level above app/.
 */

const fs = require('node:fs');
const path = require('node:path');

function parseEnv(text) {
  const out = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnvFile(file) {
  const target = file || path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(target)) return { loaded: false, applied: 0, keys: [] };
  let parsed = {};
  try {
    parsed = parseEnv(fs.readFileSync(target, 'utf8'));
  } catch {
    return { loaded: false, applied: 0, keys: [] };
  }
  const keys = [];
  let applied = 0;
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      applied += 1;
      keys.push(key);
    }
  }
  return { loaded: true, applied, keys };
}

// The project's .env has used several spellings over time, including a typo
// (REACTIVE_AI_OPENROUER_API_KEY). All of them must keep working.
const KEY_CANDIDATES = [
  'OPENROUTER_API_KEY',
  'REACTIVE_AI_API_KEY',
  'REACTIVE_AI_OPENROUER_API_KEY',
  'REACTIVE_AI_OPENROUTER_API_KEY'
];

function openRouterKeyFromEnv() {
  for (const name of KEY_CANDIDATES) {
    const v = process.env[name];
    if (v && String(v).trim().length > 10) return String(v).trim();
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (/^REACTIVE_AI_.*API_?KEY$/i.test(name) && value && String(value).trim().length > 10) {
      return String(value).trim();
    }
  }
  return '';
}

/** Names only — never values — so a caller can report which var was used. */
function openRouterKeyVarName() {
  for (const name of KEY_CANDIDATES) {
    const v = process.env[name];
    if (v && String(v).trim().length > 10) return name;
  }
  return '';
}

module.exports = { loadEnvFile, parseEnv, openRouterKeyFromEnv, openRouterKeyVarName };
