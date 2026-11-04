'use strict';

/**
 * AIProviderManager — the single public surface for the rest of the app.
 *
 * Everything else (server routes, wedding MC, future features) talks to this
 * object and never to a provider SDK or endpoint directly.
 */

const store = require('./store.cjs');
const registry = require('./registry.cjs');
const router = require('./router.cjs');
const usageLog = require('./usage.cjs');
const { AiError, CODE } = require('./errors.cjs');

class AIProviderManager {
  constructor() {
    store.loadConfig();
    store.loadSecrets();
    usageLog.load();
    if (store.isFreshInstall()) this.seedDefaultProviders();
    this.recoverSecrets();
  }

  /**
   * A master-key change (or a .env rewrite that drops LLM_SECRETS_MASTER_KEY)
   * leaves stored blobs undecryptable. When .env still carries an OpenRouter
   * key we re-encrypt from it; otherwise the provider is marked "unreadable"
   * so the dashboard asks for the key again instead of silently showing none.
   */
  recoverSecrets() {
    for (const p of store.getConfig().providers) {
      try {
        if (store.recoverApiKeyFromEnv(p.id)) {
          console.warn('[AI] Đã nạp lại API key từ .env cho "' + p.name + '" (khoá mã hoá cũ không còn đọc được).');
        } else if (store.secretState(p.id) === 'unreadable') {
          console.warn('[AI] Khoá đã lưu của "' + p.name + '" không giải mã được — cần nhập lại trong bảng điều khiển.');
        }
      } catch (e) {
        console.error('[AI] recoverSecrets:', e.message);
      }
    }
  }

  /**
   * First run: register the providers this machine actually has something for
   * (an OpenRouter key in .env and a LAN Ollama), plus an empty OpenAI slot so
   * the admin sees exactly which one still needs credentials.
   */
  seedDefaultProviders() {
    const seeds = [
      {
        type: 'openrouter',
        name: 'OpenRouter',
        baseUrl: process.env.REACTIVE_AI_BASE_URL || 'https://openrouter.ai/api/v1',
        model: process.env.REACTIVE_AI_MODEL || '',
        timeoutMs: 30000
      },
      {
        type: 'ollama',
        name: 'Ollama (LAN 10.0.0.142)',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://10.0.0.142:11434',
        model: '',
        timeoutMs: 60000
      },
      {
        type: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        timeoutMs: 30000
      }
    ];
    for (const seed of seeds) {
      try {
        store.addProvider(seed);
      } catch (e) {
        console.error('[AI] Không tạo được nhà cung cấp mặc định', seed.type, '-', e.message);
      }
    }
  }

  // ---------------- providers ----------------
  listProviders() {
    const cfg = store.getConfig();
    return {
      providers: registry.list(),
      defaultProviderId: cfg.defaultProviderId,
      fallback: { ...cfg.fallback },
      text: { ...cfg.text, tasks: { ...cfg.text.tasks } },
      secretsEncryption: store.snapshot().secretsEncryption
    };
  }

  addProvider(input) {
    const p = store.addProvider(input);
    registry.invalidate(p.id);
    return store.publicProvider(p);
  }

  updateProvider(id, patch) {
    const p = store.updateProvider(id, patch);
    registry.invalidate(id);
    return store.publicProvider(p);
  }

  removeProvider(id) {
    const ok = store.removeProvider(id);
    registry.invalidate(id);
    return ok;
  }

  enableProvider(id) {
    return this.updateProvider(id, { enabled: true });
  }

  disableProvider(id) {
    return this.updateProvider(id, { enabled: false });
  }

  setDefaultProvider(id) {
    store.setDefaultProvider(id);
    return this.listProviders();
  }

  setFallbackProvider(id, model) {
    return store.setFallbackProvider(id, model);
  }

  updateFallback(patch) {
    return store.updateFallback(patch);
  }

  updateTextSettings(patch) {
    return store.updateTextSettings(patch);
  }

  // ---------------- checks ----------------
  async testConnection(id) {
    return registry.testConnection(id);
  }

  async listModels(id, opts) {
    return registry.listModels(id, opts);
  }

  /** Real generation against ONE provider, used by the dashboard test button. */
  async testGeneration(id, { prompt, model, maxTokens } = {}) {
    const cfg = store.getProvider(id);
    if (!cfg) throw new AiError(CODE.CONFIG, 'không tìm thấy nhà cung cấp');
    const startedAt = Date.now();
    const out = await registry.generate(id, {
      messages: router.buildMessages({
        prompt: prompt || 'Chào bạn! Hãy trả lời đúng một câu: "Xin chào từ tiệc cưới".',
        systemPrompt: 'Bạn là trợ lý ngắn gọn. Trả lời bằng tiếng Việt, tối đa 25 từ.'
      }),
      model: model || cfg.model,
      temperature: 0.7,
      maxTokens: maxTokens || 64,
      // Respect the provider's own timeout: a test that silently ignores a
      // configured 1.2s limit would never reveal a timeout problem.
      timeoutMs: cfg.timeoutMs
    });
    const latencyMs = Date.now() - startedAt;

    usageLog.record({
      providerId: id,
      providerName: cfg.name,
      providerType: cfg.type,
      model: out.model,
      task: 'test_generation',
      durationMs: latencyMs,
      ok: true,
      attempts: 1,
      usage: out.usage || null
    });

    return {
      ok: true,
      text: out.text,
      providerId: id,
      providerName: cfg.name,
      providerType: cfg.type,
      model: out.model,
      latencyMs,
      usage: out.usage || null,
      finishReason: out.finishReason || null,
      timings: out.timings || null
    };
  }

  // ---------------- generation ----------------
  generateText(req) {
    return router.generateText(req);
  }

  // ---------------- status / statistics ----------------
  getProviderStatus(id) {
    if (id) return { providerId: id, ...registry.statusFor(id) };
    const out = {};
    for (const p of store.getConfig().providers) out[p.id] = registry.statusFor(p.id);
    return out;
  }

  getUsageStatistics() {
    return { stats: usageLog.stats(), entries: usageLog.list(100) };
  }

  clearUsage() {
    usageLog.clear();
    return true;
  }

  /** Used by the wedding flow to decide whether AI text is worth a request. */
  isTextGenerationEnabled(task) {
    const t = store.getConfig().text;
    if (!t.enabled) return false;
    if (!task) return true;
    return t.tasks?.[task] !== false;
  }

  getTextSettings() {
    return { ...store.getConfig().text, tasks: { ...store.getConfig().text.tasks } };
  }
}

/** Process-wide singleton. */
const manager = new AIProviderManager();

module.exports = { manager, AIProviderManager, AiError, CODE };
