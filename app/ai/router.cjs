'use strict';

/**
 * AIRequestRouter: one generation entry point with a bounded, explainable
 * retry/fallback policy.
 *
 * Rules (each has a test):
 *  - Authentication errors are NOT retried on the same provider (useless), but
 *    they may hand over to the fallback provider.
 *  - Invalid requests and user cancellation never fall back.
 *  - Total attempts are capped by fallback.maxAttempts, so no infinite loop.
 *  - The result always states which provider/model actually answered.
 */

const registry = require('./registry.cjs');
const store = require('./store.cjs');
const usageLog = require('./usage.cjs');
const { AiError, CODE, isRetryable, isFallbackAllowed, redact } = require('./errors.cjs');

function resolveProviderRef(ref) {
  if (!ref) return null;
  const cfg = store.getConfig();
  const byId = cfg.providers.find((p) => p.id === ref);
  if (byId) return byId;
  // Allow passing a type ("ollama") for convenience.
  return cfg.providers.find((p) => p.type === ref && p.enabled) || null;
}

function buildMessages({ prompt, systemPrompt }) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: String(systemPrompt) });
  const user = String(prompt == null ? '' : prompt);
  messages.push({ role: 'user', content: user });
  return messages;
}

/**
 * @param {object} req
 * @param {string} [req.task]
 * @param {string} req.prompt
 * @param {string} [req.systemPrompt]
 * @param {string} [req.provider]  provider id or type
 * @param {string} [req.model]
 * @param {number} [req.temperature]
 * @param {number} [req.maxTokens]
 * @param {number} [req.timeout]
 * @param {object} [req.metadata]
 * @param {AbortSignal} [req.signal]
 */
async function generateText(req = {}) {
  const startedAt = Date.now();
  const cfg = store.getConfig();
  const text = String(req.prompt == null ? '' : req.prompt);
  if (!text.trim()) throw new AiError(CODE.INVALID_REQUEST, 'prompt đang trống');
  if (text.length > cfg.limits.maxPromptChars) {
    throw new AiError(CODE.INVALID_REQUEST, `prompt vượt ${cfg.limits.maxPromptChars} ký tự`);
  }
  if (req.signal?.aborted) throw new AiError(CODE.CANCELLED, 'đã huỷ trước khi gửi');

  const primary = resolveProviderRef(req.provider) || resolveProviderRef(cfg.defaultProviderId);
  if (!primary) throw new AiError(CODE.CONFIG, 'chưa có nhà cung cấp AI nào được bật');

  // Candidate plan: primary first, then the configured fallback (if distinct).
  const candidates = [{ provider: primary, model: req.model || primary.model || '' }];
  const fb = cfg.fallback || {};
  if (fb.enabled && fb.providerId) {
    const fbProvider = resolveProviderRef(fb.providerId);
    const sameAsPrimary = fbProvider && fbProvider.id === primary.id;
    const distinctModel = !sameAsPrimary || (fb.model && fb.model !== candidates[0].model);
    if (fbProvider && fbProvider.enabled && distinctModel) {
      candidates.push({ provider: fbProvider, model: fb.model || fbProvider.model || '' });
    }
  }

  const maxAttempts = Math.max(1, Math.min(5, Number(fb.maxAttempts) || 2));
  const globalTimeout = Math.max(1000, Math.min(180000, Number(req.timeout) || Number(fb.timeoutMs) || 20000));
  const attempts = [];
  let budget = maxAttempts;
  let lastError = null;
  // When a fallback is configured, retrying the primary would eat the budget
  // and the fallback would never run. Prefer handing over instead.
  const hasFallback = candidates.length > 1;

  for (let ci = 0; ci < candidates.length && budget > 0; ci += 1) {
    const cand = candidates[ci];
    const pid = cand.provider.id;

    // Retry the same provider only for transient failures.
    for (let tryIdx = 0; tryIdx < 2 && budget > 0; tryIdx += 1) {
      if (req.signal?.aborted) throw new AiError(CODE.CANCELLED, 'đã huỷ theo yêu cầu');
      budget -= 1;
      const attemptStart = Date.now();
      try {
        const out = await registry.generate(pid, {
          messages: buildMessages(req),
          model: cand.model,
          temperature: Number.isFinite(req.temperature) ? req.temperature : undefined,
          maxTokens: Number.isFinite(req.maxTokens) ? req.maxTokens : undefined,
          timeoutMs: Math.min(globalTimeout, Number(cand.provider.timeoutMs) || globalTimeout),
          signal: req.signal
        });

        attempts.push({
          providerId: pid,
          providerName: cand.provider.name,
          model: out.model,
          ok: true,
          durationMs: Date.now() - attemptStart
        });

        const result = {
          ok: true,
          text: out.text,
          providerId: pid,
          providerName: cand.provider.name,
          providerType: cand.provider.type,
          model: out.model,
          usage: out.usage || null,
          finishReason: out.finishReason || null,
          latencyMs: Date.now() - startedAt,
          fallbackUsed: ci > 0,
          fallbackReason: ci > 0 ? (lastError ? lastError.code : null) : null,
          attempts
        };

        usageLog.record({
          providerId: pid,
          providerName: cand.provider.name,
          providerType: cand.provider.type,
          model: out.model,
          task: req.task || req.metadata?.task || 'generate',
          durationMs: result.latencyMs,
          ok: true,
          fallbackUsed: result.fallbackUsed,
          attempts: attempts.length,
          usage: out.usage || null
        });

        return result;
      } catch (err) {
        const e = err instanceof AiError ? err : new AiError(CODE.UNKNOWN, redact(err.message));
        lastError = e;
        attempts.push({
          providerId: pid,
          providerName: cand.provider.name,
          model: cand.model,
          ok: false,
          code: e.code,
          error: e.message,
          durationMs: Date.now() - attemptStart
        });

        if (e.code === CODE.CANCELLED || req.signal?.aborted) {
          usageLog.record({
            providerId: pid,
            providerName: cand.provider.name,
            providerType: cand.provider.type,
            model: cand.model,
            task: req.task || 'generate',
            durationMs: Date.now() - startedAt,
            ok: false,
            attempts: attempts.length,
            errorCode: CODE.CANCELLED,
            errorMessage: 'Yêu cầu đã bị huỷ'
          });
          throw new AiError(CODE.CANCELLED, 'đã huỷ theo yêu cầu', { providerId: pid });
        }

        // Retry only transient failures, only while budget allows, and only
        // when there is no fallback waiting to take over.
        if (isRetryable(e) && budget > 0 && tryIdx === 0 && !hasFallback) continue;
        break;
      }
    }

    // Decide whether a different provider may take over.
    if (lastError && !isFallbackAllowed(lastError)) break;
  }

  const err = lastError || new AiError(CODE.CONFIG, 'không có nhà cung cấp khả dụng');
  usageLog.record({
    providerId: attempts.at(-1)?.providerId || null,
    providerName: attempts.at(-1)?.providerName || '',
    providerType: primary.type,
    model: attempts.at(-1)?.model || primary.model,
    task: req.task || req.metadata?.task || 'generate',
    durationMs: Date.now() - startedAt,
    ok: false,
    fallbackUsed: attempts.length > 1,
    attempts: attempts.length,
    errorCode: err.code,
    errorMessage: err.message
  });

  err.attempts = attempts;
  throw err;
}

module.exports = { generateText, buildMessages, resolveProviderRef };
