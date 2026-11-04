'use strict';

/**
 * Any OpenAI-shaped endpoint (LM Studio, vLLM, LocalAI, Together, Groq, a
 * company gateway, ...). API key is optional because many self-hosted servers
 * accept none; the base URL is validated by the SSRF guard before we get here.
 */

const { OpenAIProvider } = require('./openai.cjs');
const { requestJson } = require('./base.cjs');
const { AiError, CODE } = require('../errors.cjs');

class OpenAICompatibleProvider extends OpenAIProvider {
  async listModels() {
    try {
      const { json } = await requestJson(this.url('models'), {
        headers: this.headers(this.apiKey),
        timeoutMs: this.timeoutMs,
        providerId: this.id
      });
      const rows = Array.isArray(json?.data) ? json.data : [];
      return rows
        .map((m) => ({ id: String(m.id || ''), name: String(m.name || m.id || '') }))
        .filter((m) => m.id)
        .sort((a, b) => a.id.localeCompare(b.id));
    } catch (err) {
      // Many gateways do not implement /models. That is not a configuration
      // error: the model can still be typed in manually.
      if (err.code === CODE.NOT_FOUND || err.code === CODE.UNSUPPORTED) {
        throw new AiError(CODE.UNSUPPORTED, 'máy chủ không cung cấp /models — hãy nhập tên model thủ công', {
          providerId: this.id
        });
      }
      throw err;
    }
  }

  async checkAuth() {
    if (!this.apiKey) {
      return { ok: true, detail: 'không dùng API key (máy chủ nội bộ/công khai)' };
    }
    const { latencyMs } = await requestJson(this.url('models'), {
      headers: this.headers(this.apiKey),
      timeoutMs: Math.min(this.timeoutMs, 15000),
      providerId: this.id
    });
    return { ok: true, latencyMs, detail: 'API key được chấp nhận' };
  }
}

module.exports = { OpenAICompatibleProvider };
