'use strict';

/**
 * Ollama adapter (local or LAN, e.g. http://10.0.0.142:11434).
 *
 * Uses the native Ollama API, not the OpenAI shim, so "model not pulled" can be
 * reported precisely: Ollama answers 404 with `model "x" not found, try pulling it`.
 */

const { BaseProvider, requestJson } = require('./base.cjs');
const { AiError, CODE } = require('../errors.cjs');

class OllamaProvider extends BaseProvider {
  healthUrl() {
    return this.url('api/version');
  }

  async checkReachable() {
    const { json, latencyMs } = await requestJson(this.url('api/version'), {
      timeoutMs: Math.min(this.timeoutMs, 8000),
      providerId: this.id
    });
    return { ok: true, latencyMs, detail: `Ollama ${json?.version || ''}`.trim() };
  }

  async checkAuth() {
    // Ollama has no accounts; reachability + version is the whole check.
    return { ok: true, detail: 'Ollama không dùng API key' };
  }

  async listModels() {
    const { json } = await requestJson(this.url('api/tags'), {
      timeoutMs: this.timeoutMs,
      providerId: this.id
    });
    const rows = Array.isArray(json?.models) ? json.models : [];
    return rows
      .map((m) => ({
        id: String(m.name || m.model || ''),
        name: String(m.name || m.model || ''),
        sizeBytes: Number(m.size) || null,
        parameterSize: m.details?.parameter_size || null,
        quantization: m.details?.quantization_level || null,
        family: m.details?.family || null,
        capabilities: Array.isArray(m.capabilities) ? m.capabilities : []
      }))
      .filter((m) => m.id)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async generate({ messages, model, temperature, maxTokens, timeoutMs, signal }) {
    const useModel = model || this.config.model;
    if (!useModel) throw new AiError(CODE.CONFIG, 'chưa chọn model Ollama', { providerId: this.id });

    const options = {};
    if (Number.isFinite(temperature)) options.temperature = temperature;
    if (Number.isFinite(maxTokens)) options.num_predict = maxTokens;

    try {
      const { json } = await requestJson(this.url('api/chat'), {
        method: 'POST',
        body: { model: useModel, messages, stream: false, options },
        // Local models can be slow on first load (cold start measured 9.4 s).
        timeoutMs: timeoutMs || Math.max(this.timeoutMs, 30000),
        signal,
        providerId: this.id
      });

      const text = json?.message?.content;
      if (typeof text !== 'string') {
        throw new AiError(CODE.BAD_RESPONSE, 'Ollama không trả về nội dung', { providerId: this.id });
      }
      return {
        text,
        model: json?.model || useModel,
        usage: this.normalizeUsage({
          prompt_eval_count: json?.prompt_eval_count,
          eval_count: json?.eval_count
        }),
        finishReason: json?.done_reason || null,
        timings: {
          totalMs: json?.total_duration ? Math.round(json.total_duration / 1e6) : null,
          loadMs: json?.load_duration ? Math.round(json.load_duration / 1e6) : null
        }
      };
    } catch (err) {
      if (err.code === CODE.NOT_FOUND || /not found|try pulling/i.test(err.detail || '')) {
        throw new AiError(CODE.MODEL_MISSING, `model "${useModel}" chưa được tải trên máy chủ Ollama`, {
          providerId: this.id
        });
      }
      throw err;
    }
  }
}

module.exports = { OllamaProvider };
