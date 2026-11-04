'use strict';

/**
 * ProviderRegistry: turns stored provider records into live adapter objects and
 * keeps *runtime* status in memory only.
 *
 * Keeping status out of the config file is deliberate: a stale "connected"
 * badge after a restart or a network drop would be a lie.
 */

const { OpenRouterProvider } = require('./providers/openrouter.cjs');
const { OllamaProvider } = require('./providers/ollama.cjs');
const { OpenAIProvider } = require('./providers/openai.cjs');
const { OpenAICompatibleProvider } = require('./providers/openai-compatible.cjs');

const store = require('./store.cjs');
const { AiError, CODE, redact } = require('./errors.cjs');
const { assertSafeHost } = require('./ssrf.cjs');

const ADAPTERS = {
  openrouter: OpenRouterProvider,
  ollama: OllamaProvider,
  openai: OpenAIProvider,
  'openai-compatible': OpenAICompatibleProvider
};

const status = new Map(); // providerId -> {reachable, authenticated, checkedAt, lastError, lastSuccessAt, latencyMs, detail}
const modelCache = new Map(); // providerId -> {at, models}

function statusFor(id) {
  return status.get(id) || {
    reachable: null,
    authenticated: null,
    checkedAt: null,
    lastError: null,
    lastSuccessAt: null,
    latencyMs: null,
    detail: ''
  };
}

function patchStatus(id, patch) {
  status.set(id, { ...statusFor(id), ...patch, checkedAt: new Date().toISOString() });
  return status.get(id);
}

function invalidate(id) {
  status.delete(id);
  modelCache.delete(id);
}

function build(providerConfig) {
  const Adapter = ADAPTERS[providerConfig.type];
  if (!Adapter) throw new AiError(CODE.CONFIG, `chưa hỗ trợ loại ${providerConfig.type}`);
  const instance = new Adapter(providerConfig);
  // API key is injected at request time, never stored on the adapter itself.
  Object.defineProperty(instance, 'apiKey', {
    get: () => store.getApiKey(providerConfig.id),
    enumerable: false
  });
  return instance;
}

function getAdapter(id) {
  const cfg = store.getProvider(id);
  if (!cfg) throw new AiError(CODE.CONFIG, 'không tìm thấy nhà cung cấp');
  return build(cfg);
}

function list() {
  return store.getConfig().providers.map((p) => {
    const cfg = store.getProvider(p.id);
    return { ...store.publicProvider(cfg), status: statusFor(p.id) };
  });
}

/**
 * Three separate facts, never collapsed into one "connected" light:
 *   reachable     – the HTTP endpoint answered
 *   authenticated – credentials were accepted (or none required)
 *   canGenerate   – a real completion already succeeded once (tracked by caller)
 */
async function testConnection(id) {
  const cfg = store.getProvider(id);
  if (!cfg) throw new AiError(CODE.CONFIG, 'không tìm thấy nhà cung cấp');
  const adapter = build(cfg);
  const result = {
    providerId: id,
    providerName: cfg.name,
    type: cfg.type,
    reachable: false,
    authenticated: false,
    detail: '',
    latencyMs: null,
    meta: null
  };

  // Stage 0 — a provider that cannot possibly authenticate (no key for a
  // keyed host) is reported as NOT CONFIGURED instead of "offline", and we do
  // not send a pointless unauthenticated request to the vendor.
  const needsKey = cfg.type === 'openai' || cfg.type === 'openrouter';
  if (needsKey && !store.hasApiKey(id)) {
    const e = new AiError(CODE.CONFIG, 'chưa nhập API key', { providerId: id });
    patchStatus(id, { reachable: false, authenticated: false, lastError: e.message, detail: e.message });
    return { ...result, reachable: false, authenticated: false, notAttempted: true, detail: e.message, error: e.toJSON(), code: e.code };
  }

  // Stage 1 — reachability only.
  try {
    // Re-check the host at connect time too (DNS can change after saving).
    await assertSafeHost(cfg.baseUrl, { allowPrivate: cfg.type === 'ollama' });
    const health = await adapter.checkReachable();
    result.reachable = true;
    result.latencyMs = health.latencyMs ?? null;
    result.detail = health.detail || 'Endpoint phản hồi';
  } catch (err) {
    const e = err instanceof AiError ? err : new AiError(CODE.NETWORK, redact(err.message));
    patchStatus(id, { reachable: false, authenticated: false, lastError: e.message, detail: e.message, latencyMs: null });
    return { ...result, reachable: false, authenticated: false, detail: e.message, error: e.toJSON(), code: e.code };
  }

  // Stage 2 — credentials.
  try {
    const auth = await adapter.checkAuth();
    result.authenticated = auth.ok !== false;
    result.authDetail = auth.detail || '';
    if (auth.meta) result.meta = auth.meta;
    if (auth.latencyMs) result.latencyMs = auth.latencyMs;
  } catch (err) {
    const e = err instanceof AiError ? err : new AiError(CODE.UNKNOWN, redact(err.message));
    patchStatus(id, {
      reachable: true,
      authenticated: false,
      lastError: e.message,
      detail: e.message
    });
    return {
      ...result,
      authenticated: false,
      detail: `Kết nối được máy chủ nhưng xác thực thất bại: ${e.message}`,
      error: e.toJSON(),
      code: e.code
    };
  }

  patchStatus(id, {
    reachable: true,
    authenticated: true,
    lastError: null,
    lastSuccessAt: new Date().toISOString(),
    detail: result.authDetail || result.detail
  });

  return result;
}

async function listModels(id, { refresh = false } = {}) {
  const cfg = store.getProvider(id);
  if (!cfg) throw new AiError(CODE.CONFIG, 'không tìm thấy nhà cung cấp');
  const cached = modelCache.get(id);
  if (!refresh && cached && Date.now() - cached.at < 5 * 60 * 1000) {
    return { models: cached.models, cached: true, fetchedAt: new Date(cached.at).toISOString() };
  }
  const adapter = build(cfg);
  const models = await adapter.listModels();
  modelCache.set(id, { at: Date.now(), models });
  // Discovery succeeding does not imply auth; mark reachability only.
  patchStatus(id, { reachable: true, lastError: null });
  return { models, cached: false, fetchedAt: new Date().toISOString() };
}

async function generate(id, args) {
  const adapter = getAdapter(id);
  const cfg = store.getProvider(id);
  const model = args.model || cfg.model;
  try {
    const out = await adapter.generate({ ...args, model });
    patchStatus(id, {
      reachable: true,
      authenticated: true,
      lastError: null,
      lastSuccessAt: new Date().toISOString()
    });
    return { ...out, providerId: id, providerName: cfg.name, providerType: cfg.type };
  } catch (err) {
    const e = err instanceof AiError ? err : new AiError(CODE.UNKNOWN, redact(err.message));
    patchStatus(id, { lastError: e.message, ...(e.code === CODE.TIMEOUT || e.code === CODE.NETWORK ? { reachable: false } : {}) });
    throw e;
  }
}

module.exports = { ADAPTERS, list, getAdapter, testConnection, listModels, generate, statusFor, invalidate, modelCache };
