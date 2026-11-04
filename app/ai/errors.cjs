'use strict';

/**
 * One error vocabulary for every provider.
 *
 * The dashboard shows `message` (Vietnamese). The router uses `code` to decide
 * whether a retry or a fallback is allowed, so error classification lives here
 * instead of being sprinkled through the adapters.
 */

const CODE = {
  AUTH: 'auth',                 // bad / missing / expired API key
  FORBIDDEN: 'forbidden',       // key valid but not allowed to use this model
  NOT_FOUND: 'model_not_found',
  MODEL_MISSING: 'model_not_downloaded', // Ollama: model listed but not pulled
  RATE_LIMIT: 'rate_limit',
  QUOTA: 'quota',
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  INVALID_REQUEST: 'invalid_request',
  CONTEXT_LENGTH: 'context_length',
  UNSUPPORTED: 'unsupported_feature',
  BAD_RESPONSE: 'invalid_response',
  CONFIG: 'not_configured',
  CANCELLED: 'cancelled',
  BLOCKED: 'blocked_target',    // SSRF guard refused the URL
  UNKNOWN: 'unknown'
};

/** Vietnamese, user-facing, no secrets. */
const MESSAGE_VI = {
  [CODE.AUTH]: 'API key không hợp lệ hoặc đã hết hạn. Kiểm tra lại khoá của nhà cung cấp.',
  [CODE.FORBIDDEN]: 'API key hợp lệ nhưng không có quyền dùng model này.',
  [CODE.NOT_FOUND]: 'Không tìm thấy model. Hãy bấm "Tải danh sách model" và chọn lại.',
  [CODE.MODEL_MISSING]: 'Ollama chưa tải model này. Chạy: ollama pull <tên-model> trên máy chủ Ollama.',
  [CODE.RATE_LIMIT]: 'Bị giới hạn tốc độ (rate limit). Vui lòng thử lại sau ít giây.',
  [CODE.QUOTA]: 'Tài khoản đã hết hạn mức / credit. Nạp thêm hoặc chuyển sang nhà cung cấp khác.',
  [CODE.TIMEOUT]: 'Nhà cung cấp phản hồi quá chậm (quá thời gian chờ).',
  [CODE.NETWORK]: 'Không kết nối được tới nhà cung cấp. Kiểm tra mạng / địa chỉ máy chủ.',
  [CODE.INVALID_REQUEST]: 'Yêu cầu không hợp lệ (tham số sai hoặc model không hỗ trợ).',
  [CODE.CONTEXT_LENGTH]: 'Nội dung quá dài so với giới hạn của model.',
  [CODE.UNSUPPORTED]: 'Model này không hỗ trợ tính năng đang dùng.',
  [CODE.BAD_RESPONSE]: 'Nhà cung cấp trả về dữ liệu không đọc được.',
  [CODE.CONFIG]: 'Nhà cung cấp chưa được cấu hình đầy đủ (thiếu URL hoặc API key).',
  [CODE.CANCELLED]: 'Yêu cầu đã bị huỷ.',
  [CODE.BLOCKED]: 'Địa chỉ máy chủ bị chặn vì lý do an toàn (SSRF).',
  [CODE.UNKNOWN]: 'Lỗi không xác định từ nhà cung cấp AI.'
};

class AiError extends Error {
  constructor(code, detail, { status, providerId, retryAfterMs, cause } = {}) {
    const base = MESSAGE_VI[code] || MESSAGE_VI[CODE.UNKNOWN];
    super(detail ? `${base} (${detail})` : base);
    this.name = 'AiError';
    this.code = code || CODE.UNKNOWN;
    this.detail = detail || '';
    this.status = status || null;
    this.providerId = providerId || null;
    this.retryAfterMs = retryAfterMs || null;
    if (cause) this.cause = cause;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      detail: this.detail,
      status: this.status,
      providerId: this.providerId
    };
  }
}

/**
 * Some failures are worth trying again on the same provider, others are not.
 * Authentication and invalid requests are never retried: repeating them just
 * burns quota and never succeeds.
 */
const RETRYABLE = new Set([CODE.RATE_LIMIT, CODE.TIMEOUT, CODE.NETWORK, CODE.UNKNOWN]);
const FALLBACK_ALLOWED = new Set([
  CODE.AUTH, CODE.FORBIDDEN, CODE.NOT_FOUND, CODE.MODEL_MISSING, CODE.RATE_LIMIT,
  CODE.QUOTA, CODE.TIMEOUT, CODE.NETWORK, CODE.BAD_RESPONSE, CODE.UNSUPPORTED,
  CODE.CONFIG, CODE.CONTEXT_LENGTH
]);

function isRetryable(err) {
  return RETRYABLE.has(err && err.code);
}

function isFallbackAllowed(err) {
  // A user cancellation must never be retried or rerouted.
  if (!err || err.code === CODE.CANCELLED || err.code === CODE.INVALID_REQUEST) return false;
  if (err.code === CODE.BLOCKED) return false;
  return FALLBACK_ALLOWED.has(err.code);
}

/** Normalise an HTTP status + provider body into an AiError. */
function fromHttp(status, body, { providerId, retryAfterMs } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body || {});
  const lower = text.toLowerCase();
  let code = CODE.UNKNOWN;

  if (status === 401) code = CODE.AUTH;
  else if (status === 402) code = CODE.QUOTA;
  else if (status === 403) code = CODE.FORBIDDEN;
  else if (status === 404) code = /model/.test(lower) ? CODE.NOT_FOUND : CODE.NOT_FOUND;
  else if (status === 408) code = CODE.TIMEOUT;
  else if (status === 429) code = CODE.RATE_LIMIT;
  else if (status >= 500) code = CODE.NETWORK;
  else if (status === 400 || status === 422) {
    if (/context|too long|max_tokens|maximum context/.test(lower)) code = CODE.CONTEXT_LENGTH;
    else if (/not a valid model|model.*not found|no such model/.test(lower)) code = CODE.NOT_FOUND;
    else if (/not support|unsupported/.test(lower)) code = CODE.UNSUPPORTED;
    else code = CODE.INVALID_REQUEST;
  } else if (status === 200) {
    code = CODE.BAD_RESPONSE;
  }

  if (/insufficient|quota|credit|billing/.test(lower) && code !== CODE.AUTH) code = CODE.QUOTA;
  if (/rate limit|too many requests/.test(lower)) code = CODE.RATE_LIMIT;

  return new AiError(code, `HTTP ${status}`, { status, providerId, retryAfterMs });
}

/** Strip anything credential-shaped before it can reach a log line. */
function redact(text) {
  return String(text == null ? '' : text)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{10,}/gi, 'Bearer [redacted]')
    .replace(/("?(?:api_?key|authorization|token)"?\s*[:=]\s*"?)([^",}\s]{6,})/gi, '$1[redacted]');
}

module.exports = { AiError, CODE, MESSAGE_VI, isRetryable, isFallbackAllowed, fromHttp, redact };
