'use strict';

/**
 * AI activity log + aggregate statistics.
 *
 * Prompts and responses are deliberately NOT stored: a wedding MC may speak a
 * guest's name, and the log should not become a copy of the chat. Only routing
 * metadata, latency, token counts and error codes are kept.
 */

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, 'ai_usage.json');
const MAX_ENTRIES = 500;

let entries = [];
let saveTimer = null;

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      entries = Array.isArray(parsed.entries) ? parsed.entries.slice(0, MAX_ENTRIES) : [];
    }
  } catch {
    entries = [];
  }
  return entries;
}

function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ entries }, null, 2), 'utf8');
      fs.renameSync(tmp, FILE);
    } catch {}
  }, 800);
  if (saveTimer.unref) saveTimer.unref();
}

function record(entry) {
  const row = {
    ts: new Date().toISOString(),
    providerId: entry.providerId || null,
    providerName: entry.providerName || '',
    providerType: entry.providerType || '',
    model: entry.model || '',
    task: entry.task || '',
    durationMs: Math.max(0, Math.round(Number(entry.durationMs) || 0)),
    ok: Boolean(entry.ok),
    fallbackUsed: Boolean(entry.fallbackUsed),
    attempts: Number(entry.attempts) || 1,
    promptTokens: entry.usage?.promptTokens ?? null,
    completionTokens: entry.usage?.completionTokens ?? null,
    totalTokens: entry.usage?.totalTokens ?? null,
    errorCode: entry.errorCode || null,
    // Vietnamese summary only; never the raw provider body or the prompt.
    errorMessage: entry.errorMessage ? String(entry.errorMessage).slice(0, 200) : null
  };
  entries.unshift(row);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  persistSoon();
  return row;
}

function list(limit = 100) {
  const n = Math.max(1, Math.min(MAX_ENTRIES, Number(limit) || 100));
  return entries.slice(0, n);
}

function stats() {
  const total = entries.length;
  const ok = entries.filter((e) => e.ok).length;
  const failed = total - ok;
  const withFallback = entries.filter((e) => e.fallbackUsed).length;

  const byProvider = new Map();
  const byModel = new Map();
  let durationSum = 0;
  let durationCount = 0;
  let tokens = 0;

  for (const e of entries) {
    const pKey = e.providerId || 'unknown';
    const p = byProvider.get(pKey) || { providerId: pKey, name: e.providerName || pKey, requests: 0, failures: 0 };
    p.requests += 1;
    if (!e.ok) p.failures += 1;
    byProvider.set(pKey, p);

    if (e.model) {
      const m = byModel.get(e.model) || { model: e.model, requests: 0 };
      m.requests += 1;
      byModel.set(e.model, m);
    }
    if (Number.isFinite(e.durationMs) && e.durationMs > 0) {
      durationSum += e.durationMs;
      durationCount += 1;
    }
    if (Number.isFinite(e.totalTokens)) tokens += e.totalTokens;
  }

  const top = (map, n) => [...map.values()].sort((a, b) => b.requests - a.requests).slice(0, n);

  return {
    total,
    successful: ok,
    failed,
    fallbackUsed: withFallback,
    successRate: total ? Math.round((ok / total) * 1000) / 10 : null,
    avgDurationMs: durationCount ? Math.round(durationSum / durationCount) : null,
    totalTokens: tokens,
    providers: top(byProvider, 12),
    models: top(byModel, 8)
  };
}

function clear() {
  entries = [];
  persistSoon();
}

module.exports = { load, record, list, stats, clear, FILE };
