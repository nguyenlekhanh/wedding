'use strict';

/**
 * Shared URL guard for provider endpoints.
 *
 * Threat model: the custom OpenAI-compatible provider lets an admin type any
 * base URL. Without a guard, that turns the wedding server into an SSRF proxy
 * for cloud metadata (169.254.169.254), localhost admin panels, LAN routers, ...
 *
 * Policy:
 *  - protocol must be http/https, no embedded credentials, no fragments.
 *  - `openai-compatible` and `openai` and `openrouter`: public hosts only.
 *  - `ollama`: private/LAN hosts allowed on purpose (that is the whole point of
 *    a LAN Ollama), but cloud-metadata and link-local addresses stay blocked.
 */

const dns = require('node:dns').promises;
const net = require('node:net');

const { AiError, CODE } = require('./errors.cjs');

function ipToParts(ip) {
  if (net.isIPv4(ip)) return ip.split('.').map(Number);
  return null;
}

function isBlockedIp(ip, { allowPrivate }) {
  if (!net.isIP(ip)) return false;

  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    // IPv4-mapped forms (::ffff:169.254.169.254) → judge the IPv4 address.
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1], { allowPrivate: false });

    const isLoopback = v === '::1' || v === '::';
    const isLinkLocal = /^fe[89ab]/.test(v);
    const isUniqueLocal = /^f[cd]/.test(v); // fc00::/7
    if (isLoopback || isLinkLocal || isUniqueLocal) return !allowPrivate;

    // 2000::/3 is ordinary global unicast (Cloudflare, OpenAI, ...). Public
    // IPv6 must be allowed, otherwise every real HTTPS provider gets blocked.
    if (/^[23]/.test(v)) return false;

    // Anything else (multicast, reserved) is not a legitimate API endpoint.
    return true;
  }

  const p = ipToParts(ip);
  if (!p) return false;

  // Cloud metadata endpoints are never legitimate AI providers.
  if (p[0] === 169 && p[1] === 254) return true;
  if (ip === '0.0.0.0') return true;

  const isLoopback = p[0] === 127;
  const isPrivate =
    p[0] === 10 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168);
  const isCgnat = p[0] === 100 && p[1] >= 64 && p[1] <= 127;

  if (allowPrivate) return isLoopback && false; // LAN Ollama may be on 127.x or 10.x
  return isLoopback || isPrivate || isCgnat;
}

function isPrivateIp(ip) {
  const p = ipToParts(ip);
  if (!p) return net.isIPv6(ip);
  return (
    p[0] === 127 || p[0] === 10 || p[0] === 0 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
  );
}

/** Synchronous structural validation. Throws AiError(BLOCKED) when unsafe. */
function assertSafeUrl(rawUrl, { allowPrivate = false } = {}) {
  let u;
  try {
    u = new URL(String(rawUrl || '').trim());
  } catch {
    throw new AiError(CODE.CONFIG, 'URL không hợp lệ');
  }
  if (!/^https?:$/.test(u.protocol)) {
    throw new AiError(CODE.BLOCKED, 'chỉ cho phép http/https');
  }
  if (u.username || u.password) {
    throw new AiError(CODE.BLOCKED, 'không cho phép thông tin đăng nhập trong URL');
  }
  if (u.hash) {
    throw new AiError(CODE.BLOCKED, 'URL không được chứa dấu #');
  }
  const host = u.hostname.toLowerCase();
  if (!host) throw new AiError(CODE.CONFIG, 'URL thiếu tên miền');
  if (host === 'localhost' && !allowPrivate) {
    throw new AiError(CODE.BLOCKED, 'localhost bị chặn cho nhà cung cấp tuỳ chỉnh');
  }
  if (net.isIP(host) && isBlockedIp(host, { allowPrivate })) {
    throw new AiError(CODE.BLOCKED, `địa chỉ ${host} nằm trong vùng nội bộ bị chặn`);
  }
  if (host.endsWith('.local') && !allowPrivate) {
    throw new AiError(CODE.BLOCKED, 'tên miền nội bộ (.local) bị chặn');
  }
  return u;
}

/**
 * Async validation that also resolves the hostname, closing the DNS-rebinding
 * hole where a public name points at an internal address.
 */
async function assertSafeHost(rawUrl, opts = {}) {
  const u = assertSafeUrl(rawUrl, opts);
  const host = u.hostname;
  if (net.isIP(host)) return u;
  if (opts.allowPrivate) return u;

  let records = [];
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    // Unresolvable host is a network problem, not an SSRF problem; the fetch
    // will fail with a clear network error.
    return u;
  }
  for (const rec of records) {
    if (isBlockedIp(rec.address, { allowPrivate: false })) {
      throw new AiError(CODE.BLOCKED, `${host} phân giải tới địa chỉ nội bộ ${rec.address}`);
    }
  }
  return u;
}

/** Join a base URL with a path without doubling slashes. */
function joinUrl(base, suffix) {
  const b = String(base || '').replace(/\/+$/, '');
  const s = String(suffix || '').replace(/^\/+/, '');
  return s ? `${b}/${s}` : b;
}

module.exports = { assertSafeUrl, assertSafeHost, joinUrl, isPrivateIp, isBlockedIp };
