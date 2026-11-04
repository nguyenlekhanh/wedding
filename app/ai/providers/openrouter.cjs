'use strict';

/**
 * OpenRouter adapter.
 *
 * Important, verified against the live API: GET /models is PUBLIC — it returns
 * 200 with 400+ models even when the API key is invalid. Model discovery
 * therefore proves nothing about authentication. Auth is checked with GET /key,
 * which correctly answers 401 {"error":{"message":"User not found."}} for a bad
 * key. A provider is only "connected" after that probe succeeds.
 */

const { BaseProvider, requestJson } = require('./base.cjs');
const { AiError, CODE } = require('../errors.cjs');

class OpenRouterProvider extends BaseProvider {
  headers(apiKey) {
    const h = {
      'HTTP-Referer': 'http://localhost:3003',
      'X-Title': 'TiecCuoiLive'
    };
    if (apiKey) h.Authorization = `Bearer ${apiKey}`;
    return h;
  }

  healthUrl() {
    return this.url('models');
  }

  async listModels({ timeoutMs } = {}) {
    // Public endpoint: usable without a key, so this is discovery, not auth.
    const { json } = await requestJson(this.url('models'), {
      timeoutMs: timeoutMs || this.timeoutMs,
      providerId: this.id
    });
    const rows = Array.isArray(json?.data) ? json.data : [];
    return rows
      .map((m) => ({
        id: String(m.id || ''),
        name: String(m.name || m.id || ''),
        contextLength: Number(m.context_length) || null,
        promptPrice: m.pricing?.prompt != null ? String(m.pricing.prompt) : null,
        completionPrice: m.pricing?.completion != null ? String(m.pricing.completion) : null
      }))
      .filter((m) => m.id)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async checkAuth() {
    const apiKey = this.apiKey;
    if (!apiKey) throw new AiError(CODE.CONFIG, 'chưa có API key OpenRouter', { providerId: this.id });
    const { json, latencyMs } = await requestJson(this.url('key'), {
      headers: this.headers(apiKey),
      timeoutMs: Math.min(this.timeoutMs, 15000),
      providerId: this.id
    });
    const d = json?.data || {};
    return {
      ok: true,
      latencyMs,
      detail: 'API key hợp lệ',
      meta: {
        label: d.label || null,
        freeTier: d.is_free_tier ?? null,
        limit: d.limit ?? null,
        usage: d.usage ?? null
      }
    };
  }

  async generate({ messages, model, temperature, maxTokens, timeoutMs, signal }) {
    const apiKey = this.apiKey;
    if (!apiKey) throw new AiError(CODE.CONFIG, 'chưa có API key OpenRouter', { providerId: this.id });
    const useModel = model || this.config.model;
    if (!useModel) throw new AiError(CODE.CONFIG, 'chưa chọn model OpenRouter', { providerId: this.id });

    const body = {
      model: useModel,
      messages,
      temperature: Number.isFinite(temperature) ? temperature : 0.8
    };
    if (Number.isFinite(maxTokens)) body.max_tokens = maxTokens;

    const { json } = await requestJson(this.url('chat/completions'), {
      method: 'POST',
      headers: this.headers(apiKey),
      body,
      timeoutMs: timeoutMs || this.timeoutMs,
      signal,
      providerId: this.id
    });

    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new AiError(CODE.BAD_RESPONSE, 'không có nội dung trả về', { providerId: this.id });
    }
    return {
      text,
      model: json?.model || useModel,
      usage: this.normalizeUsage(json?.usage),
      finishReason: json?.choices?.[0]?.finish_reason || null
    };
  }
}

module.exports = { OpenRouterProvider };
