'use strict';

/**
 * Official OpenAI adapter.
 *
 * A ChatGPT Plus/Pro subscription does NOT include API access: the API is billed
 * separately through platform.openai.com. This adapter therefore stays "chưa
 * cấu hình" until a real API key is supplied — it never pretends otherwise.
 */

const { BaseProvider, requestJson } = require('./base.cjs');
const { AiError, CODE } = require('../errors.cjs');

class OpenAIProvider extends BaseProvider {
  headers(apiKey) {
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  }

  healthUrl() {
    return this.url('models');
  }

  async listModels() {
    const apiKey = this.apiKey;
    if (!apiKey) throw new AiError(CODE.CONFIG, 'chưa có API key OpenAI', { providerId: this.id });
    const { json } = await requestJson(this.url('models'), {
      headers: this.headers(apiKey),
      timeoutMs: this.timeoutMs,
      providerId: this.id
    });
    const rows = Array.isArray(json?.data) ? json.data : [];
    return rows
      .map((m) => ({ id: String(m.id || ''), name: String(m.id || '') }))
      .filter((m) => m.id)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async checkAuth() {
    const apiKey = this.apiKey;
    if (!apiKey) throw new AiError(CODE.CONFIG, 'chưa có API key OpenAI', { providerId: this.id });
    const { latencyMs } = await requestJson(this.url('models'), {
      headers: this.headers(apiKey),
      timeoutMs: Math.min(this.timeoutMs, 15000),
      providerId: this.id
    });
    return { ok: true, latencyMs, detail: 'API key hợp lệ' };
  }

  async generate({ messages, model, temperature, maxTokens, timeoutMs, signal }) {
    const apiKey = this.apiKey;
    if (!apiKey) throw new AiError(CODE.CONFIG, 'chưa có API key OpenAI', { providerId: this.id });
    const useModel = model || this.config.model;
    if (!useModel) throw new AiError(CODE.CONFIG, 'chưa chọn model OpenAI', { providerId: this.id });

    const body = { model: useModel, messages };
    if (Number.isFinite(temperature)) body.temperature = temperature;
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

module.exports = { OpenAIProvider };
