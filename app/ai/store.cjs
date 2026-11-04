'use strict';

/**
 * Persistent AI settings.
 *
 * Two files, deliberately separated:
 *   ai_config.json   → provider definitions, model choice, fallback policy (no secrets)
 *   secrets.enc.json → AES-256-GCM ciphertext for each provider API key
 *
 * Transient per-request status (reachable/authenticated/errors) is never written
 * here; it lives in memory in the registry so a stale "connected" badge cannot
 * survive a restart by accident.
 */

const fs = require('node:fs');
const path = require('node:path');

const { encrypt, decrypt, maskSecret, encryptionSource } = require('./crypto.cjs');
const { openRouterKeyFromEnv } = require('./env.cjs');
const { assertSafeUrl } = require('./ssrf.cjs');
const { AiError, CODE } = require('./errors.cjs');

const DIR = __dirname;
const CONFIG_FILE = path.join(DIR, 'ai_config.json');
const SECRETS_FILE = path.join(DIR, 'secrets.enc.json');

const PROVIDER_TYPES = ['openrouter', 'ollama', 'openai', 'openai-compatible'];

const DEFAULT_CONFIG = {
  version: 1,
  providers: [],
  defaultProviderId: null,
  fallback: {
    enabled: true,
    providerId: null,
    model: '',
    maxAttempts: 2,
    timeoutMs: 20000
  },
  text: {
    enabled: false,          // opt-in: keeps live gift flow byte-identical by default
    temperature: 0.8,
    maxTokens: 120,
    timeoutMs: 6000,
    tasks: { gift_thankyou: true, marry_crown: true, guest_wish: false }
  },
  limits: { maxProviders: 12, maxPromptChars: 4000 }
};

let config = structuredClone(DEFAULT_CONFIG);
let secrets = {};
let freshInstall = false;

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function cleanString(v, max = 200) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function loadConfig() {
  freshInstall = !fs.existsSync(CONFIG_FILE);
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      config = {
        ...structuredClone(DEFAULT_CONFIG),
        ...parsed,
        fallback: { ...DEFAULT_CONFIG.fallback, ...(parsed.fallback || {}) },
        text: { ...DEFAULT_CONFIG.text, ...(parsed.text || {}), tasks: { ...DEFAULT_CONFIG.text.tasks, ...((parsed.text || {}).tasks || {}) } },
        limits: { ...DEFAULT_CONFIG.limits, ...(parsed.limits || {}) },
        providers: Array.isArray(parsed.providers) ? parsed.providers : []
      };
    }
  } catch (e) {
    console.error('[AI] Không đọc được ai_config.json, dùng mặc định:', e.message);
    config = structuredClone(DEFAULT_CONFIG);
  }
  return config;
}

function loadSecrets() {
  try {
    secrets = fs.existsSync(SECRETS_FILE) ? JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8')) : {};
  } catch {
    secrets = {};
  }
  return secrets;
}

function saveConfig() {
  const tmp = CONFIG_FILE + '.tmp';
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(tmp, CONFIG_FILE);
}

function saveSecrets() {
  const tmp = SECRETS_FILE + '.tmp';
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(secrets, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, SECRETS_FILE);
}

function getConfig() {
  return config;
}

function getProvider(id) {
  return config.providers.find((p) => p.id === id) || null;
}

/** Raw secret for server-side use only. Never serialise this into a response. */
function getApiKey(providerId) {
  const blob = secrets[providerId];
  if (!blob) return '';
  return decrypt(blob) || '';
}

function hasApiKey(providerId) {
  return Boolean(getApiKey(providerId));
}

/**
 * 'none'       no key stored
 * 'ok'         stored and decryptable
 * 'unreadable' stored but the master key changed → the admin must re-enter it
 */
function secretState(providerId) {
  const blob = secrets[providerId];
  if (!blob) return 'none';
  return decrypt(blob) ? 'ok' : 'unreadable';
}

/** Re-encrypt an unreadable OpenRouter key from .env, when one is available. */
function recoverApiKeyFromEnv(providerId) {
  const provider = getProvider(providerId);
  if (!provider || provider.type !== 'openrouter') return false;
  if (secretState(providerId) === 'ok') return false;
  const envKey = openRouterKeyFromEnv();
  if (!envKey) return false;
  setApiKey(providerId, envKey);
  return true;
}

function setApiKey(providerId, raw) {
  if (raw === null) {
    if (secrets[providerId]) {
      delete secrets[providerId];
      saveSecrets();
    }
    return;
  }
  const key = String(raw || '').trim();
  if (!key) return; // empty string means "leave the saved key alone"
  secrets[providerId] = encrypt(key);
  saveSecrets();
}

function migrateApiKey(fromId, toId) {
  if (fromId === toId || !secrets[fromId]) return;
  secrets[toId] = secrets[fromId];
  delete secrets[fromId];
  saveSecrets();
}

function dropApiKey(providerId) {
  if (secrets[providerId]) {
    delete secrets[providerId];
    saveSecrets();
  }
}

function normalizeProvider(input, { existing = null } = {}) {
  const type = cleanString(input.type || existing?.type, 32);
  if (!PROVIDER_TYPES.includes(type)) {
    throw new AiError(CODE.CONFIG, `loại nhà cung cấp không hợp lệ: ${type || '(trống)'}`);
  }
  const name = cleanString(input.name ?? existing?.name ?? '', 60) || `Provider ${type}`;

  // Ollama lives on the LAN by design; every other type must be a public host.
  const allowPrivate = type === 'ollama';
  let baseUrl = cleanString(input.baseUrl ?? existing?.baseUrl ?? '', 400);
  if (!baseUrl) {
    if (type === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';
    else if (type === 'openai') baseUrl = 'https://api.openai.com/v1';
    else if (type === 'ollama') baseUrl = 'http://10.0.0.142:11434';
    else throw new AiError(CODE.CONFIG, 'cần nhập API Base URL');
  }
  assertSafeUrl(baseUrl, { allowPrivate });
  // A trailing /v1 on Ollama is a common mistake; strip it so /api/* stays correct.
  if (type === 'ollama') baseUrl = baseUrl.replace(/\/v1\/?$/, '');

  return {
    id: existing?.id || input.id,
    type,
    name,
    baseUrl,
    model: cleanString(input.model ?? existing?.model ?? '', 120),
    timeoutMs: clampInt(input.timeoutMs ?? existing?.timeoutMs, 1000, 180000, 20000),
    enabled: input.enabled === undefined ? (existing ? existing.enabled !== false : true) : Boolean(input.enabled),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function addProvider(input) {
  loadSecrets();
  if (config.providers.length >= config.limits.maxProviders) {
    throw new AiError(CODE.INVALID_REQUEST, `đã đạt giới hạn ${config.limits.maxProviders} nhà cung cấp`);
  }
  const draft = normalizeProvider(input);
  const id = cleanString(input.id, 40) || `pv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  if (config.providers.some((p) => p.id === id)) {
    throw new AiError(CODE.INVALID_REQUEST, 'id nhà cung cấp đã tồn tại');
  }
  const provider = normalizeProvider({ ...input, id }, { existing: { ...draft, id } });
  provider.id = id;
  config.providers.push(provider);
  // API key: an env-derived key can seed the provider, but only when the admin
  // typed nothing (the environment value is never echoed back).
  if (input.apiKey && String(input.apiKey).trim()) {
    setApiKey(id, input.apiKey);
  } else if (provider.type === 'openrouter') {
    const envKey = openRouterKeyFromEnv();
    if (envKey) setApiKey(id, envKey);
  }
  if (!config.defaultProviderId && provider.enabled) config.defaultProviderId = id;
  saveConfig();
  return provider;
}

function updateProvider(id, patch) {
  const existing = getProvider(id);
  if (!existing) throw new AiError(CODE.INVALID_REQUEST, 'không tìm thấy nhà cung cấp');
  const merged = normalizeProvider({ ...patch, id }, { existing });
  const idx = config.providers.findIndex((p) => p.id === id);
  config.providers[idx] = merged;

  // Secret handling: absent → keep, '' → keep, null → delete, value → replace.
  if (Object.prototype.hasOwnProperty.call(patch, 'apiKey')) {
    if (patch.apiKey === null) dropApiKey(id);
    else if (String(patch.apiKey).trim()) setApiKey(id, patch.apiKey);
  }

  if (!merged.enabled && config.defaultProviderId === id) {
    const next = config.providers.find((p) => p.enabled);
    config.defaultProviderId = next ? next.id : null;
  }
  if (!merged.enabled && config.fallback.providerId === id) config.fallback.providerId = null;

  saveConfig();
  return merged;
}

function removeProvider(id) {
  const before = config.providers.length;
  config.providers = config.providers.filter((p) => p.id !== id);
  if (config.providers.length === before) throw new AiError(CODE.INVALID_REQUEST, 'không tìm thấy nhà cung cấp');
  if (config.defaultProviderId === id) {
    const next = config.providers.find((p) => p.enabled);
    config.defaultProviderId = next ? next.id : null;
  }
  if (config.fallback.providerId === id) {
    config.fallback.providerId = null;
    config.fallback.model = '';
  }
  dropApiKey(id);
  saveConfig();
  return true;
}

function setDefaultProvider(id) {
  const p = getProvider(id);
  if (!p) throw new AiError(CODE.INVALID_REQUEST, 'không tìm thấy nhà cung cấp');
  if (!p.enabled) throw new AiError(CODE.INVALID_REQUEST, 'nhà cung cấp đang bị tắt');
  config.defaultProviderId = id;
  saveConfig();
  return true;
}

function setFallbackProvider(id, model) {
  if (id) {
    const p = getProvider(id);
    if (!p) throw new AiError(CODE.INVALID_REQUEST, 'không tìm thấy nhà cung cấp dự phòng');
  }
  config.fallback.providerId = id || null;
  config.fallback.model = cleanString(model || '', 120);
  saveConfig();
  return config.fallback;
}

function updateFallback(patch = {}) {
  const f = config.fallback;
  if (patch.enabled !== undefined) f.enabled = Boolean(patch.enabled);
  if (patch.maxAttempts !== undefined) f.maxAttempts = clampInt(patch.maxAttempts, 1, 5, 2);
  if (patch.timeoutMs !== undefined) f.timeoutMs = clampInt(patch.timeoutMs, 1000, 180000, 20000);
  if (patch.providerId !== undefined) f.providerId = cleanString(patch.providerId, 40) || null;
  if (patch.model !== undefined) f.model = cleanString(patch.model, 120);
  saveConfig();
  return f;
}

function updateTextSettings(patch = {}) {
  const t = config.text;
  if (patch.enabled !== undefined) t.enabled = Boolean(patch.enabled);
  if (patch.temperature !== undefined) t.temperature = Math.max(0, Math.min(2, Number(patch.temperature) || 0));
  if (patch.maxTokens !== undefined) t.maxTokens = clampInt(patch.maxTokens, 16, 800, 120);
  if (patch.timeoutMs !== undefined) t.timeoutMs = clampInt(patch.timeoutMs, 1000, 30000, 6000);
  if (patch.tasks && typeof patch.tasks === 'object') {
    t.tasks = { ...t.tasks, ...patch.tasks };
  }
  saveConfig();
  return t;
}

/** Public view: masked keys only, never the ciphertext either. */
function publicProvider(p) {
  const key = getApiKey(p.id);
  return {
    id: p.id,
    type: p.type,
    name: p.name,
    baseUrl: p.baseUrl,
    model: p.model,
    timeoutMs: p.timeoutMs,
    enabled: p.enabled,
    hasApiKey: Boolean(key),
    apiKeyMasked: key ? maskSecret(key) : '',
    keySource: key ? (secrets[p.id] ? 'saved' : 'env') : 'none',
    secretState: secretState(p.id),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

function snapshot() {
  return {
    version: config.version,
    providers: config.providers.map(publicProvider),
    defaultProviderId: config.defaultProviderId,
    fallback: { ...config.fallback },
    text: { ...config.text, tasks: { ...config.text.tasks } },
    limits: { ...config.limits },
    secretsEncryption: encryptionSource()
  };
}

module.exports = {
  PROVIDER_TYPES,
  DEFAULT_CONFIG,
  CONFIG_FILE,
  SECRETS_FILE,
  loadConfig,
  loadSecrets,
  isFreshInstall: () => freshInstall,
  getConfig,
  getProvider,
  getApiKey,
  hasApiKey,
  secretState,
  recoverApiKeyFromEnv,
  setApiKey,
  dropApiKey,
  migrateApiKey,
  addProvider,
  updateProvider,
  removeProvider,
  setDefaultProvider,
  setFallbackProvider,
  updateFallback,
  updateTextSettings,
  publicProvider,
  snapshot,
  saveConfig
};
