'use strict';

/**
 * At-rest encryption for provider API keys.
 *
 * Keys never go into ai_config.json (which is readable and diffable). They live
 * in secrets.enc.json as AES-256-GCM ciphertext. The master key comes from
 * LLM_SECRETS_MASTER_KEY when it is present in .env; otherwise a random key is
 * generated once into app/ai/.master.key so the feature still works offline.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DIR = __dirname;
const MASTER_FILE = path.join(DIR, '.master.key');
let cachedKey = null;

function readMasterFromEnv() {
  const raw = process.env.LLM_SECRETS_MASTER_KEY;
  if (!raw || String(raw).trim().length < 16) return null;
  // Derive a fixed 32-byte key so any passphrase length works.
  return crypto.scryptSync(String(raw).trim(), 'tieccuoi-ai-secrets-v1', 32);
}

function readOrCreateLocalMaster() {
  try {
    if (fs.existsSync(MASTER_FILE)) {
      const hex = fs.readFileSync(MASTER_FILE, 'utf8').trim();
      if (/^[a-f0-9]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
    }
  } catch {}
  const key = crypto.randomBytes(32);
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(MASTER_FILE, key.toString('hex'), { encoding: 'utf8', mode: 0o600 });
  } catch (e) {
    throw new Error('Không tạo được khoá mã hoá cục bộ: ' + e.message);
  }
  return key;
}

function masterKey() {
  if (cachedKey) return cachedKey;
  cachedKey = readMasterFromEnv() || readOrCreateLocalMaster();
  return cachedKey;
}

function encryptionSource() {
  return readMasterFromEnv() ? 'env:LLM_SECRETS_MASTER_KEY' : 'local:.master.key';
}

/** @returns {{v:number, iv:string, tag:string, data:string}} */
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: enc.toString('base64')
  };
}

function decrypt(blob) {
  if (!blob || typeof blob !== 'object' || !blob.iv || !blob.data || !blob.tag) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(blob.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]);
    return out.toString('utf8');
  } catch {
    return null;
  }
}

/** Only ever expose this shape to the browser. */
function maskSecret(secret) {
  const s = String(secret || '');
  if (!s) return '';
  if (s.length <= 8) return '••••' + s.slice(-2);
  return `${s.slice(0, 3)}••••••••${s.slice(-4)}`;
}

module.exports = { encrypt, decrypt, maskSecret, encryptionSource };
