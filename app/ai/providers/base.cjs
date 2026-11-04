'use strict';

/**
 * Shared plumbing for every provider adapter: one fetch wrapper, one timeout
 * policy, one place where HTTP failures become AiError codes.
 */

const { AiError, CODE, fromHttp, redact } = require('../errors.cjs');
const { joinUrl } = require('../ssrf.cjs');

const DEFAULT_TIMEOUT = 20000;

/** Combine the caller's cancellation signal with our own timeout. */
function withTimeout(timeoutMs, signal) {
  const controller = new AbortController();
  // Named reason, so the catch block can tell "our timeout fired" apart from a
  // real network failure (fetch rejects with this very object as the reason).
  const timeoutReason = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  const timeout = setTimeout(() => controller.abort(timeoutReason), Math.max(500, timeoutMs || DEFAULT_TIMEOUT));
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else {
      const onAbort = () => controller.abort(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      controller.signal.addEventListener('abort', () => signal.removeEventListener('abort', onAbort), { once: true });
    }
  }
  return { signal: controller.signal, done: () => clearTimeout(timeout) };
}

async function requestJson(url, { method = 'GET', headers = {}, body, timeoutMs, signal, providerId } = {}) {
  const guard = withTimeout(timeoutMs, signal);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: guard.signal
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const err = fromHttp(res.status, json || text, {
        providerId,
        retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : null
      });
      // Keep a short, redacted excerpt so the dashboard can explain the failure
      // without leaking the key or dumping a huge HTML error page.
      const excerpt = redact(String(text || '').replace(/\s+/g, ' ').slice(0, 180));
      if (excerpt) err.detail = `${err.detail} · ${excerpt}`;
      throw err;
    }

    return { json, text, status: res.status, latencyMs: Date.now() - started };
  } catch (err) {
    if (err instanceof AiError) throw err;
    const isTimeout = err?.name === 'TimeoutError' || /timed? ?out/i.test(err?.message || '');
    if (err?.name === 'AbortError' || isTimeout || /aborted/i.test(err?.message || '')) {
      if (signal?.aborted) throw new AiError(CODE.CANCELLED, 'đã huỷ', { providerId });
      throw new AiError(CODE.TIMEOUT, `quá ${Math.round((timeoutMs || DEFAULT_TIMEOUT) / 1000)}s`, { providerId });
    }
    throw new AiError(CODE.NETWORK, redact(err?.message || 'kết nối thất bại').slice(0, 160), { providerId });
  } finally {
    guard.done();
  }
}

class BaseProvider {
  constructor(config) {
    this.config = config || {};
  }

  get id() {
    return this.config.id;
  }

  get type() {
    return this.config.type;
  }

  get name() {
    return this.config.name;
  }

  get timeoutMs() {
    return Number(this.config.timeoutMs) || DEFAULT_TIMEOUT;
  }

  /** @returns {Promise<Array<{id:string,name:string}>>} */
  async listModels() {
    throw new AiError(CODE.UNSUPPORTED, 'nhà cung cấp này không hỗ trợ tải danh sách model');
  }

  /** Authentication-only probe. Returns {ok, detail}. */
  async checkAuth() {
    return { ok: true, detail: 'không hỗ trợ kiểm tra riêng' };
  }

  /** Reachability-only probe (no credentials). */
  async checkReachable() {
    const url = this.healthUrl ? this.healthUrl() : this.config.baseUrl;
    const { latencyMs } = await requestJson(url, { timeoutMs: Math.min(this.timeoutMs, 8000), providerId: this.id });
    return { ok: true, latencyMs };
  }

  async generate() {
    throw new AiError(CODE.UNSUPPORTED, 'nhà cung cấp này chưa hỗ trợ tạo văn bản');
  }

  /** Chat payload shared by the OpenAI-shaped providers. */
  buildMessages({ prompt, systemPrompt }) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: String(systemPrompt) });
    messages.push({ role: 'user', content: String(prompt == null ? '' : prompt) });
    return messages;
  }

  normalizeUsage(usage) {
    if (!usage || typeof usage !== 'object') return null;
    const promptTokens = usage.prompt_tokens ?? usage.prompt_eval_count ?? null;
    const completionTokens = usage.completion_tokens ?? usage.eval_count ?? null;
    const totalTokens = usage.total_tokens ?? (
      Number.isFinite(promptTokens) && Number.isFinite(completionTokens) ? promptTokens + completionTokens : null
    );
    return { promptTokens, completionTokens, totalTokens };
  }

  healthUrl() {
    return this.config.baseUrl;
  }

  url(pathname) {
    return joinUrl(this.config.baseUrl, pathname);
  }
}

module.exports = { BaseProvider, requestJson, withTimeout, DEFAULT_TIMEOUT };
