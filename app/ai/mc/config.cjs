'use strict';

/**
 * AI Wedding MC configuration.
 *
 * Kept out of wedding_state.json on purpose: the wedding state is live runtime
 * data, while this is operator configuration for the MC character.
 */

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'mc_config.json');

const DEFAULTS = {
  enabled: true,
  paused: false,
  actor: {
    preset: 'female',        // female | male
    skin: '#f2c6a4',
    hair: '#3a2318',
    outfit: '#a51f3c',
    style: 'dress',          // dress | suit
    accessory: 'veil'        // veil | bowtie | none
  },
  providerId: null,          // null → AI manager default provider
  model: '',
  voice: '',                 // '' → inherit the global Kokoro voice
  personality: 'playful',    // playful | elegant | funny | formal
  language: 'en',            // en | vi
  speed: 0.98,               // Kokoro speaking rate for MC lines
  frequency: 1,              // 0.3–2 multiplier for idle / chat chances
  maxChars: 180,
  cooldownMs: 6000,
  giftMergeWindowMs: 2500,
  idleIntervalMs: 45000,
  autoWelcome: true,
  autoGift: true,
  autoCeremony: true,
  autoInteraction: true,
  idleHosting: true,
  priorities: { welcome: 6, gift: 5, ceremony: 10, interaction: 3, idle: 1, manual: 8 }
};

const LANGS = ['en', 'vi'];
const PERSONALITIES = ['playful', 'elegant', 'funny', 'formal'];
const PRESETS = ['female', 'male'];

const cloneDefaults = () => JSON.parse(JSON.stringify(DEFAULTS));

let config = cloneDefaults();

function clamp(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function str(v, max, fallback = '') {
  const s = String(v == null ? '' : v).trim();
  return s ? s.slice(0, max) : fallback;
}

function isHex(v, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : fallback;
}

function normalize(input = {}, base = DEFAULTS) {
  const out = {
    ...base,
    ...input,
    actor: { ...base.actor, ...(input.actor || {}) },
    priorities: { ...base.priorities, ...(input.priorities || {}) }
  };

  out.enabled = input.enabled === undefined ? base.enabled : Boolean(input.enabled);
  out.paused = input.paused === undefined ? base.paused : Boolean(input.paused);

  out.actor.preset = PRESETS.includes(input.actor?.preset) ? input.actor.preset : base.actor.preset;
  out.actor.style = ['dress', 'suit'].includes(input.actor?.style) ? input.actor.style : (out.actor.preset === 'male' ? 'suit' : 'dress');
  out.actor.accessory = ['veil', 'bowtie', 'none'].includes(input.actor?.accessory) ? input.actor.accessory : base.actor.accessory;
  out.actor.skin = isHex(input.actor?.skin, base.actor.skin);
  out.actor.hair = isHex(input.actor?.hair, base.actor.hair);
  out.actor.outfit = isHex(input.actor?.outfit, base.actor.outfit);

  out.providerId = input.providerId === undefined ? base.providerId : (str(input.providerId, 40) || null);
  out.model = input.model === undefined ? base.model : str(input.model, 120);
  out.voice = input.voice === undefined ? base.voice : str(input.voice, 60);
  out.personality = PERSONALITIES.includes(input.personality) ? input.personality : base.personality;
  out.language = LANGS.includes(input.language) ? input.language : base.language;
  out.speed = clamp(input.speed ?? base.speed, 0.7, 1.5, base.speed);
  out.frequency = clamp(input.frequency ?? base.frequency, 0.3, 2, base.frequency);
  out.maxChars = clamp(input.maxChars ?? base.maxChars, 60, 320, base.maxChars);
  out.cooldownMs = clamp(input.cooldownMs ?? base.cooldownMs, 1500, 120000, base.cooldownMs);
  out.giftMergeWindowMs = clamp(input.giftMergeWindowMs ?? base.giftMergeWindowMs, 500, 15000, base.giftMergeWindowMs);
  out.idleIntervalMs = clamp(input.idleIntervalMs ?? base.idleIntervalMs, 15000, 600000, base.idleIntervalMs);
  out.autoWelcome = input.autoWelcome === undefined ? base.autoWelcome : Boolean(input.autoWelcome);
  out.autoGift = input.autoGift === undefined ? base.autoGift : Boolean(input.autoGift);
  out.autoCeremony = input.autoCeremony === undefined ? base.autoCeremony : Boolean(input.autoCeremony);
  out.autoInteraction = input.autoInteraction === undefined ? base.autoInteraction : Boolean(input.autoInteraction);
  out.idleHosting = input.idleHosting === undefined ? base.idleHosting : Boolean(input.idleHosting);

  for (const k of Object.keys(DEFAULTS.priorities)) {
    out.priorities[k] = clamp(out.priorities[k], 1, 10, DEFAULTS.priorities[k]);
  }
  return out;
}

function load() {
  try {
    if (fs.existsSync(FILE)) {
      config = normalize(JSON.parse(fs.readFileSync(FILE, 'utf8')));
    } else {
      config = cloneDefaults();
      save();
    }
  } catch (e) {
    console.error('[MC] Không đọc được mc_config.json, dùng mặc định:', e.message);
    config = cloneDefaults();
  }
  return config;
}

function save() {
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.error('[MC] Không lưu được mc_config.json:', e.message);
  }
}

function get() {
  return config;
}

function update(patch = {}) {
  config = normalize(patch, config);
  save();
  return config;
}

module.exports = { DEFAULTS, FILE, LANGS, PERSONALITIES, PRESETS, load, save, get, update, normalize };
