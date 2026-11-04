/**
 * AI Wedding MC — stage actor.
 *
 * One lightweight SVG character (no game engine, no WebGL) that:
 *  - renders on the existing 1080x1920 stage in a dedicated position,
 *  - has male / female presets and configurable colours,
 *  - breathes, sways and blinks while idle,
 *  - opens its mouth in sync with the Kokoro WAV that #mc-audio is playing,
 *  - shows happy / surprised / excited / neutral expressions,
 *  - gestures with the free hand, holds a microphone, waves on welcome.
 *
 * It deliberately does NOT own audio: the existing overlay queue still plays the
 * server-generated WAV into <audio id="mc-audio">. We only read its timeupdate /
 * play / ended events plus a pre-decoded amplitude envelope of the same WAV
 * (decodeAudioData never routes audio through WebAudio, so OBS audio capture and
 * BGM ducking behave exactly as before).
 */
(function () {
  'use strict';

  var MC_DEFAULTS = {
    enabled: true,
    paused: false,
    actor: { preset: 'female', skin: '#f2c6a4', hair: '#3a2318', outfit: '#a51f3c', style: 'dress', accessory: 'veil' }
  };

  var config = JSON.parse(JSON.stringify(MC_DEFAULTS));
  var root = null;
  var audioEl = null;
  var bubbleEl = null;
  var svgEl = null;
  var mouthEl = null;

  var view = {
    state: 'idle',
    farewell: false,
    emotion: 'neutral',
    speaking: false,
    mouth: 0.12,
    lipSync: false,
    frames: 0,
    line: '',
    source: ''
  };

  var envelopes = new Map();     // url -> { env: Float32Array-ish array, stepMs }
  var envelopeQueue = [];
  var envelopeLoading = false;
  var rafId = 0;
  var currentEnvelope = null;
  var speakStartedAt = 0;
  var speakBudgetMs = 4000;
  var waveTimer = 0;
  var emotionTimer = 0;
  var idleTimer = 0;
  var audioCtxRef = null;

  // ---------------------------------------------------------------- SVG art

  function svgMarkup() {
    return [
      '<svg class="mc-svg" viewBox="0 0 220 360" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
      '<defs>',
      '<linearGradient id="mc-dress" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0%" stop-color="var(--mc-outfit)" stop-opacity="1"/>',
      '<stop offset="100%" stop-color="var(--mc-outfit-dark)" stop-opacity="1"/>',
      '</linearGradient>',
      '<radialGradient id="mc-skin" cx="50%" cy="35%" r="70%">',
      '<stop offset="0%" stop-color="var(--mc-skin-light)"/>',
      '<stop offset="100%" stop-color="var(--mc-skin)"/>',
      '</radialGradient>',
      '</defs>',

      // floor shadow
      '<ellipse cx="110" cy="342" rx="66" ry="11" fill="rgba(0,0,0,0.38)"/>',

      '<g class="mc-torso">',
      // dress (female) / suit (male) — both drawn, CSS toggles by preset
      '<path class="mc-body-dress" d="M110 148 C 92 156, 74 246, 60 330 L160 330 C146 246, 128 156, 110 148 Z" fill="url(#mc-dress)" stroke="rgba(255,220,180,0.35)" stroke-width="1.4"/>',
      '<path class="mc-body-suit" d="M110 148 C 94 156, 80 236, 76 330 L144 330 C140 236, 126 156, 110 148 Z" fill="#201a2b" stroke="rgba(255,255,255,0.18)" stroke-width="1.2"/>',
      '<path class="mc-shirt" d="M110 150 L100 168 L110 214 L120 168 Z" fill="#f7f2e8"/>',
      '<path class="mc-tie" d="M110 170 L104 182 L110 206 L116 182 Z" fill="#ffbe53"/>',
      // neck
      '<rect x="100" y="132" width="20" height="24" rx="9" fill="var(--mc-skin)" opacity="0.95"/>',
      // necklace / veil accent
      '<g class="mc-accessory-veil">',
      '<path d="M86 158 C 96 186, 124 186, 134 158" fill="none" stroke="#ffd700" stroke-width="2.4" stroke-linecap="round"/>',
      '<circle cx="110" cy="184" r="3.4" fill="#ffd700"/>',
      '</g>',
      '<g class="mc-accessory-bowtie">',
      '<path d="M102 158 L110 164 L118 158 L118 170 L110 164 L102 170 Z" fill="#a51f3c"/>',
      '</g>',
      '</g>',

      // free (waving) arm — left side of the image
      '<g class="mc-arm mc-arm-free">',
      '<path d="M86 168 C 62 186, 50 218, 52 252" fill="none" stroke="var(--mc-outfit)" stroke-width="15" stroke-linecap="round"/>',
      '<circle cx="52" cy="256" r="9" fill="var(--mc-skin)"/>',
      '</g>',

      // microphone arm — right side
      '<g class="mc-arm mc-arm-mic">',
      '<path d="M134 168 C 154 182, 160 198, 152 214" fill="none" stroke="var(--mc-outfit)" stroke-width="15" stroke-linecap="round"/>',
      '<circle cx="150" cy="218" r="9" fill="var(--mc-skin)"/>',
      '<g class="mc-mic">',
      '<rect x="141" y="188" width="15" height="32" rx="7" fill="#2b2b33" stroke="#c9cbd6" stroke-width="1.6"/>',
      '<path d="M144 197 H153 M144 202 H153 M144 207 H153" stroke="#8d90a0" stroke-width="1.2"/>',
      '<rect x="146" y="219" width="5" height="10" rx="2" fill="#c9cbd6"/>',
      '</g>',
      '</g>',

      // head
      '<g class="mc-head">',
      '<path class="mc-hair-back" d="M110 44 C 74 44, 62 74, 64 108 C 66 132, 70 140, 74 142 L 74 96 C 84 74, 136 74, 146 96 L 146 142 C 150 140, 154 132, 156 108 C 158 74, 146 44, 110 44 Z" fill="var(--mc-hair)"/>',
      '<ellipse cx="110" cy="100" rx="37" ry="41" fill="url(#mc-skin)"/>',
      '<ellipse cx="73" cy="104" rx="6" ry="9" fill="var(--mc-skin)"/>',
      '<ellipse cx="147" cy="104" rx="6" ry="9" fill="var(--mc-skin)"/>',

      // fringe
      '<path class="mc-hair-front" d="M74 90 C 80 58, 140 58, 146 90 C 138 74, 120 66, 110 70 C 98 74, 84 80, 74 90 Z" fill="var(--mc-hair)"/>',
      '<path class="mc-hair-side" d="M72 96 C 66 120, 68 150, 74 164 C 80 150, 80 124, 84 110 Z" fill="var(--mc-hair)" opacity="0.96"/>',
      '<path class="mc-hair-side right" d="M148 96 C 154 120, 152 150, 146 164 C 140 150, 140 124, 136 110 Z" fill="var(--mc-hair)" opacity="0.96"/>',

      // brows
      '<path class="mc-brow mc-brow-left" d="M88 84 Q 96 79, 104 83" fill="none" stroke="var(--mc-hair)" stroke-width="3.2" stroke-linecap="round"/>',
      '<path class="mc-brow mc-brow-right" d="M116 83 Q 124 79, 132 84" fill="none" stroke="var(--mc-hair)" stroke-width="3.2" stroke-linecap="round"/>',

      // eyes
      '<g class="mc-eye left">',
      '<ellipse class="mc-eye-white" cx="97" cy="100" rx="8" ry="9" fill="#fffaf2"/>',
      '<circle class="mc-pupil" cx="97" cy="101" r="4" fill="#33231b"/>',
      '<circle cx="98.6" cy="99.4" r="1.3" fill="#fff"/>',
      '</g>',
      '<g class="mc-eye right">',
      '<ellipse class="mc-eye-white" cx="123" cy="100" rx="8" ry="9" fill="#fffaf2"/>',
      '<circle class="mc-pupil" cx="123" cy="101" r="4" fill="#33231b"/>',
      '<circle cx="124.6" cy="99.4" r="1.3" fill="#fff"/>',
      '</g>',

      // blush + nose
      '<ellipse class="mc-cheek" cx="86" cy="115" rx="8" ry="5" fill="#ff8fa3" opacity="0.45"/>',
      '<ellipse class="mc-cheek" cx="134" cy="115" rx="8" ry="5" fill="#ff8fa3" opacity="0.45"/>',
      '<path d="M110 108 q -3 8, 2 9" fill="none" stroke="rgba(140,80,60,0.55)" stroke-width="2" stroke-linecap="round"/>',

      // mouth (scaleY driven by JS)
      '<g class="mc-mouth-wrap">',
      '<ellipse class="mc-mouth" cx="110" cy="128" rx="11" ry="8" fill="#8c2b3a"/>',
      '<ellipse class="mc-tongue" cx="110" cy="131" rx="6" ry="4" fill="#d76a7e" opacity="0.85"/>',
      '</g>',

      // earrings for the female preset
      '<g class="mc-accessory-earrings">',
      '<circle cx="73" cy="115" r="3.2" fill="#ffd700"/>',
      '<circle cx="147" cy="115" r="3.2" fill="#ffd700"/>',
      '</g>',
      '</g>',

      // excited sparkles
      '<g class="mc-sparkles">',
      '<path d="M40 96 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3 z" fill="#ffe89a"/>',
      '<path d="M182 120 l2.4 7 7 2.4 -7 2.4 -2.4 7 -2.4 -7 -7 -2.4 7 -2.4 z" fill="#ffd0e0"/>',
      '<path d="M168 64 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 z" fill="#fff3c4"/>',
      '</g>',

      // sleeping marks when paused
      '<text class="mc-zzz" x="150" y="60" font-size="16" fill="#ffe6b0">z Z</text>',
      '</svg>'
    ].join('');
  }

  function build() {
    var scene = document.getElementById('scene');
    if (!scene) return false;

    root = document.createElement('div');
    root.id = 'mc-stage';
    root.className = 'mc-stage';
    root.setAttribute('data-state', 'idle');
    root.setAttribute('data-emotion', 'neutral');
    root.setAttribute('data-preset', 'female');
    root.innerHTML = '<div class="mc-glow"></div>' + svgMarkup() +
      '<div class="mc-bubble" id="mc-bubble"></div>' +
      '<div class="mc-nameplate"><span class="mc-live-dot"></span>MC <span id="mc-actor-name">Taylor</span></div>';
    scene.appendChild(root);

    bubbleEl = root.querySelector('#mc-bubble');
    svgEl = root.querySelector('.mc-svg');
    mouthEl = root.querySelector('.mc-mouth');
    return true;
  }

  // ------------------------------------------------------------- appearance

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return { r: 200, g: 120, b: 120 };
    var n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function shade(hex, factor) {
    var c = hexToRgb(hex);
    var f = function (v) { return Math.max(0, Math.min(255, Math.round(v * factor))); };
    return 'rgb(' + f(c.r) + ',' + f(c.g) + ',' + f(c.b) + ')';
  }

  function lighten(hex, amount) {
    var c = hexToRgb(hex);
    var f = function (v) { return Math.max(0, Math.min(255, Math.round(v + (255 - v) * amount))); };
    return 'rgb(' + f(c.r) + ',' + f(c.g) + ',' + f(c.b) + ')';
  }

  // The overlay's BGM mixer reads these; the MC config owns the duck level.
  function applyDuckConfig(cfg) {
    window.__MC_DUCK__ = {
      enabled: !cfg || cfg.duckEnabled !== false,
      volume: Number(cfg && cfg.duckVolume)
    };
  }

  function applyConfig(next) {
    applyDuckConfig(next);
    config = Object.assign({}, config, next || {});
    config.actor = Object.assign({}, MC_DEFAULTS.actor, (next && next.actor) || config.actor);

    if (!root) return;
    var a = config.actor;

    root.style.setProperty('--mc-skin', a.skin || MC_DEFAULTS.actor.skin);
    root.style.setProperty('--mc-skin-light', lighten(a.skin || MC_DEFAULTS.actor.skin, 0.22));
    root.style.setProperty('--mc-hair', a.hair || MC_DEFAULTS.actor.hair);
    root.style.setProperty('--mc-outfit', a.outfit || MC_DEFAULTS.actor.outfit);
    root.style.setProperty('--mc-outfit-dark', shade(a.outfit || MC_DEFAULTS.actor.outfit, 0.66));

    root.setAttribute('data-preset', a.preset === 'male' ? 'male' : 'female');
    root.classList.toggle('preset-male', a.preset === 'male');
    root.classList.toggle('preset-female', a.preset !== 'male');

    var isMale = a.preset === 'male';
    root.querySelectorAll('.mc-body-dress, .mc-accessory-veil, .mc-accessory-earrings, .mc-hair-side').forEach(function (el) {
      el.style.display = isMale ? 'none' : '';
    });
    root.querySelectorAll('.mc-body-suit, .mc-shirt, .mc-tie').forEach(function (el) {
      el.style.display = isMale ? '' : 'none';
    });
    var bowtie = root.querySelector('.mc-accessory-bowtie');
    if (bowtie) bowtie.style.display = (!isMale && a.accessory === 'bowtie') ? '' : 'none';
    var veil = root.querySelector('.mc-accessory-veil');
    if (veil) veil.style.display = (!isMale && a.accessory !== 'none') ? '' : 'none';

    var nameEl = root.querySelector('#mc-actor-name');
    if (nameEl) nameEl.textContent = isMale ? 'Daniel' : 'Taylor';

    if (!config.enabled) {
      root.hidden = true;
      setState('disabled');
      return;
    }
    root.hidden = false;
    if (config.paused) setState('paused');
    else if (view.speaking) setState('speaking');
    else setState('idle');
  }

  function setState(next) {
    view.state = next;
    if (root) root.setAttribute('data-state', next);
  }

  function setEmotion(next, holdMs) {
    view.emotion = next;
    if (root) root.setAttribute('data-emotion', next);
    clearTimeout(emotionTimer);
    if (holdMs) {
      emotionTimer = setTimeout(function () { setEmotion('neutral'); }, holdMs);
    }
  }

  function wave(ms) {
    if (!root) return;
    var arm = root.querySelector('.mc-arm-free');
    if (!arm) return;
    arm.classList.add('waving');
    clearTimeout(waveTimer);
    waveTimer = setTimeout(function () { arm.classList.remove('waving'); }, ms || 2600);
  }

  function showBubble(text) {
    if (!bubbleEl) return;
    if (!text) { bubbleEl.classList.remove('show'); return; }
    bubbleEl.textContent = text.length > 120 ? text.slice(0, 117) + '…' : text;
    bubbleEl.classList.add('show');
  }

  // ------------------------------------------------------------- lip sync

  function audioContext() {
    if (audioCtxRef) return audioCtxRef;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try { audioCtxRef = new Ctx(); } catch (e) { audioCtxRef = null; }
    return audioCtxRef;
  }

  /** RMS envelope of the exact WAV being played. Decoding never touches output. */
  function loadEnvelope(url) {
    if (!url) return;
    if (envelopes.has(url)) return;
    if (envelopeQueue.indexOf(url) !== -1) return;
    envelopeQueue.push(url);
    pumpEnvelopes();
  }

  function pumpEnvelopes() {
    if (envelopeLoading || !envelopeQueue.length) return;
    var url = envelopeQueue.shift();
    var ctx = audioContext();
    if (!ctx) return;

    envelopeLoading = true;
    fetch(url, { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(function (buf) { return ctx.decodeAudioData(buf); })
      .then(function (audioBuf) {
        var data = audioBuf.getChannelData(0);
        var step = Math.max(1, Math.floor(audioBuf.sampleRate * 0.04)); // 40 ms
        var env = [];
        for (var i = 0; i < data.length; i += step) {
          var end = Math.min(data.length, i + step);
          var sum = 0;
          for (var j = i; j < end; j++) sum += data[j] * data[j];
          env.push(Math.min(1, Math.sqrt(sum / Math.max(1, end - i)) * 3.4));
        }
        envelopes.set(url, { env: env, stepMs: 40 });
        if (envelopes.size > 40) envelopes.delete(envelopes.keys().next().value);
      })
      .catch(function () { envelopes.set(url, null); })
      .then(function () { envelopeLoading = false; pumpEnvelopes(); });
  }

  function currentMouth() {
    if (!view.speaking) return 0.1;
    var now = Date.now();
    if (audioEl && view.lipSync && currentEnvelope) {
      var t = Number(audioEl.currentTime) || 0;
      var idx = Math.floor((t * 1000) / currentEnvelope.stepMs);
      var env = currentEnvelope.env;
      if (idx >= 0 && idx < env.length) {
        var a = env[idx] || 0;
        var b = env[Math.min(env.length - 1, idx + 1)] || a;
        return 0.1 + Math.min(1, (a * 0.65 + b * 0.35)) * 0.85;
      }
      return 0.12;
    }
    // No envelope yet (or browser-voice fallback): procedural talking.
    var el = (now - speakStartedAt) / 1000;
    return 0.16 + Math.abs(Math.sin(el * 10.5)) * 0.5 + Math.sin(el * 3.1) * 0.08;
  }

  function tick() {
    rafId = 0;
    view.frames += 1;
    var mouth = currentMouth();
    view.mouth = mouth;
    if (svgEl) svgEl.style.setProperty('--mouth', mouth.toFixed(3));
    if (root) root.classList.toggle('is-speaking', view.speaking);

    if (view.speaking) rafId = requestAnimationFrame(tick);
  }

  function beginSpeak(meta) {
    meta = meta || {};
    if (config.paused || !config.enabled) return;

    view.speaking = true;
    view.farewell = meta.mcKind === 'farewell';
    view.source = meta.kind || 'tts';
    view.line = meta.text || '';
    speakStartedAt = Date.now();
    speakBudgetMs = Math.max(1500, Number(meta.durationMs) || (String(meta.text || '').length * 78) || 4000);
    currentEnvelope = null;
    view.lipSync = false;
    view.frames = 0;

    if (meta.url) {
      loadEnvelope(meta.url);
      currentEnvelope = envelopes.get(meta.url) || null;
      view.lipSync = !!currentEnvelope;
    }

    var emotion = meta.emotion || emotionForKind(meta.mcKind || meta.kind);
    setEmotion(emotion);
    if (meta.mcKind === 'welcome' || meta.kind === 'welcome' || meta.mcKind === 'farewell') wave(2800);
    showBubble(meta.text || '');
    setState('speaking');
    if (!rafId) rafId = requestAnimationFrame(tick);

    // If the audio element never fires 'ended' (fallback voice), end anyway.
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (view.speaking && Date.now() - speakStartedAt > speakBudgetMs + 1200) endSpeak();
    }, speakBudgetMs + 1500);
  }

  function endSpeak() {
    if (!view.speaking) return;
    view.speaking = false;
    view.mouth = 0.1;
    if (svgEl) svgEl.style.setProperty('--mouth', '0.1');
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    showBubble('');
    setEmotion(view.farewell ? 'happy' : 'neutral');

    if (view.farewell) {
      // Farewell gesture: wave + bow, then settle back to idle.
      setState('farewell');
      wave(3000);
      setTimeout(function () {
        if (!view.speaking && view.state === 'farewell') {
          setState(config.paused ? 'paused' : 'idle');
          setEmotion('neutral');
        }
        view.farewell = false;
      }, 3600);
    } else {
      setState(config.paused ? 'paused' : 'idle');
    }
    currentEnvelope = null;
  }

  function emotionForKind(kind) {
    if (kind === 'ceremony' || kind === 'marry' || kind === 'excited') return 'excited';
    if (kind === 'gift' || kind === 'gift_multi' || kind === 'welcome' || kind === 'happy') return 'happy';
    if (kind === 'interaction' || kind === 'surprised') return 'surprised';
    return 'neutral';
  }

  // ------------------------------------------------------------- audio hook

  function attachAudio() {
    audioEl = document.getElementById('mc-audio');
    if (!audioEl) { setTimeout(attachAudio, 500); return; }

    audioEl.addEventListener('play', function () {
      if (!view.speaking) beginSpeak({ text: '', kind: 'tts', url: audioEl.currentSrc || audioEl.src });
      var url = audioEl.currentSrc || audioEl.src;
      var env = envelopes.get(url);
      if (env) { currentEnvelope = env; view.lipSync = true; }
      else { loadEnvelope(url); }
      if (!rafId) rafId = requestAnimationFrame(tick);
    });

    audioEl.addEventListener('playing', function () {
      if (!view.speaking) beginSpeak({ text: '', kind: 'tts', url: audioEl.currentSrc || audioEl.src });
    });

    audioEl.addEventListener('ended', endSpeak);
    audioEl.addEventListener('pause', function () {
      // The queue pauses only when it pre-empts or clears; go idle politely.
      setTimeout(function () { if (audioEl && audioEl.paused) endSpeak(); }, 180);
    });

    audioEl.addEventListener('error', endSpeak);
  }

  // ------------------------------------------------------------------- SSE

  function connect() {
    var es = new EventSource('/api/events');

    es.addEventListener('mc-config', function (e) {
      try {
        var cfg = JSON.parse(e.data);
        applyConfig(cfg);
        if (cfg.paused || !cfg.enabled) {
          endSpeak();
          window.dispatchEvent(new CustomEvent('wedding:clear-mc'));
        }
      } catch (err) {}
    });

    es.addEventListener('tts', function (e) {
      try {
        var d = JSON.parse(e.data);
        if (!config.enabled || config.paused) return;
        beginSpeak(d);
      } catch (err) {}
    });

    es.addEventListener('tts-fallback', function (e) {
      try {
        var d = JSON.parse(e.data);
        if (!config.enabled || config.paused) return;
        beginSpeak({ text: d.text, kind: d.kind || 'tts', emotion: d.emotion });
      } catch (err) {}
    });

    es.addEventListener('mc-error', function () {
      // Errors are surfaced in the dashboard, not on the stage.
    });

    es.onerror = function () {
      // EventSource reconnects by itself; the actor simply stays idle.
      endSpeak();
    };
  }

  function loadConfig() {
    fetch('/api/mc/config', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.config) applyConfig(d.config); })
      .catch(function () {});
  }

  // --------------------------------------------------------------- bootstrap

  function init() {
    if (!build()) return;
    applyConfig(MC_DEFAULTS);
    loadConfig();
    attachAudio();
    connect();
    setState('enter');
    setTimeout(function () { if (!config.paused && config.enabled) setState('idle'); }, 950);
    if (window.__MC_SHOW_DEBUG__) console.log('[MC] actor ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Diagnostics for the operator and the automated checks.
  window.__mcActor = function () {
    return {
      preset: config.actor.preset,
      style: config.actor.style,
      enabled: !!config.enabled,
      paused: !!config.paused,
      state: view.state,
      emotion: view.emotion,
      speaking: view.speaking,
      mouth: Number(view.mouth.toFixed(3)),
      lipSync: !!view.lipSync,
      envelopes: envelopes.size,
      frames: view.frames,
      line: view.line,
      element: !!root,
      audio: audioEl ? {
        src: audioEl.currentSrc || audioEl.src,
        currentTime: Number(audioEl.currentTime.toFixed(2)),
        paused: audioEl.paused
      } : null
    };
  };
})();
