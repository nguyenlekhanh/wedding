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
    actor: { preset: 'female', skin: '#f0c9a8', hair: '#c9a15c', outfit: '#161a2e', style: 'blazer', accessory: 'earrings' }
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

  // Modern American wedding host: tailored blazer, satin blouse or dress shirt,
  // tailored trousers, heels or leather oxfords, minimal jewelry, wireless mic.
  // Female and male variants share the silhouette; the preset toggles hair,
  // jewelry, footwear and the shirt/tie, so both stay visually consistent.
  function svgMarkup() {
    return [
      '<svg class="mc-svg" viewBox="0 0 220 360" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
      '<defs>',
      '<linearGradient id="mc-blazer-fill" x1="0" y1="0" x2="0.3" y2="1">',
      '<stop offset="0%" stop-color="var(--mc-blazer)"/>',
      '<stop offset="100%" stop-color="var(--mc-blazer-dark)"/>',
      '</linearGradient>',
      '<linearGradient id="mc-blouse-fill" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0%" stop-color="var(--mc-blouse)"/>',
      '<stop offset="100%" stop-color="var(--mc-blouse-dark)"/>',
      '</linearGradient>',
      '<linearGradient id="mc-trouser-fill" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0%" stop-color="var(--mc-trousers)"/>',
      '<stop offset="100%" stop-color="var(--mc-trousers-dark)"/>',
      '</linearGradient>',
      '<radialGradient id="mc-skin-grad" cx="50%" cy="35%" r="70%">',
      '<stop offset="0%" stop-color="var(--mc-skin-light)"/>',
      '<stop offset="100%" stop-color="var(--mc-skin)"/>',
      '</radialGradient>',
      '</defs>',

      // floor shadow
      '<ellipse cx="110" cy="344" rx="62" ry="10" fill="rgba(0,0,0,0.4)"/>',

      '<g class="mc-torso">',

      // tailored trousers
      '<g class="mc-legs">',
      '<path d="M92 254 L96 320 L108 320 L108 254 Z" fill="url(#mc-trouser-fill)"/>',
      '<path d="M112 254 L112 320 L124 320 L128 254 Z" fill="url(#mc-trouser-fill)"/>',
      '<path d="M108 254 L108 320" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>',

      // high heels (female preset)
      '<g class="mc-heels">',
      '<path d="M96 320 L108 320 L108 329 L100 331 L94 337 L92 330 Z" fill="var(--mc-shoe)"/>',
      '<path d="M93 330 L90 342 L93.4 342 L96.4 330 Z" fill="var(--mc-shoe)"/>',
      '<path d="M112 320 L124 320 L126 330 L120 337 L114 331 L112 329 Z" fill="var(--mc-shoe)"/>',
      '<path d="M121 330 L118 342 L121.4 342 L124.4 330 Z" fill="var(--mc-shoe)"/>',
      '</g>',

      // polished leather oxfords (male preset)
      '<g class="mc-shoes">',
      '<path d="M96 320 L108 320 L109 331 Q 100 336, 93 331 Z" fill="var(--mc-shoe)"/>',
      '<path d="M112 320 L124 320 L127 331 Q 120 336, 111 331 Z" fill="var(--mc-shoe)"/>',
      '<path d="M95 326 H107 M113 326 H125" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>',
      '</g>',
      '</g>',

      // neck
      '<rect x="101" y="124" width="18" height="30" rx="8" fill="var(--mc-skin)"/>',

      // blazer body
      '<path class="mc-body-blazer" d="M110 146 C 98 148, 88 154, 85 166 L 80 246 C 79 254, 82 260, 88 262 L 132 262 C 138 260, 141 254, 140 246 L 135 166 C 134 154, 122 148, 110 146 Z" fill="url(#mc-blazer-fill)" stroke="rgba(255,255,255,0.16)" stroke-width="1.2"/>',

      // satin blouse / dress shirt
      '<path class="mc-blouse" d="M110 148 L 99 156 L 104 204 L 110 226 L 116 204 L 121 156 Z" fill="url(#mc-blouse-fill)"/>',

      // jacket lapels
      '<path class="mc-lapel" d="M110 147 L 97 155 L 102 203 L 110 174 Z" fill="var(--mc-blazer-lapel)"/>',
      '<path class="mc-lapel right" d="M110 147 L 123 155 L 118 203 L 110 174 Z" fill="var(--mc-blazer-lapel)"/>',

      // necktie (male / suit look)
      '<g class="mc-tie">',
      '<path d="M110 156 L 105 166 L 110 200 L 115 166 Z" fill="var(--mc-tie)"/>',
      '<path d="M106 152 L 114 152 L 113 158 L 107 158 Z" fill="var(--mc-tie-dark)"/>',
      '</g>',

      // minimal elegant jewelry (female preset)
      '<g class="mc-necklace">',
      '<path d="M101 150 Q 110 163 119 150" fill="none" stroke="var(--mc-jewel)" stroke-width="1.5" stroke-linecap="round"/>',
      '<circle cx="110" cy="161" r="2.4" fill="var(--mc-jewel)"/>',
      '</g>',
      '</g>',

      // free (waving) arm — left side of the image
      '<g class="mc-arm mc-arm-free">',
      '<path d="M86 164 C 70 182, 62 208, 64 238" fill="none" stroke="var(--mc-blazer)" stroke-width="13" stroke-linecap="round"/>',
      '<circle cx="64" cy="242" r="8" fill="var(--mc-skin)"/>',
      '</g>',

      // microphone arm — right side, wireless handheld
      '<g class="mc-arm mc-arm-mic">',
      '<path d="M134 164 C 150 176, 157 190, 152 202" fill="none" stroke="var(--mc-blazer)" stroke-width="13" stroke-linecap="round"/>',
      '<circle cx="151" cy="206" r="8" fill="var(--mc-skin)"/>',
      '<g class="mc-mic">',
      '<rect x="144" y="170" width="14" height="32" rx="7" fill="#232634" stroke="#cfd2dd" stroke-width="1.4"/>',
      '<circle cx="151" cy="176" r="6.4" fill="#3a3e52" stroke="#e2e5ef" stroke-width="1.2"/>',
      '<path d="M146 186 H156 M146 191 H156 M146 196 H156" stroke="#8d90a0" stroke-width="1.1"/>',
      '<rect x="148.5" y="202" width="5" height="9" rx="2" fill="#cfd2dd"/>',
      '</g>',
      '</g>',

      // head
      '<g class="mc-head">',

      // salon-styled hair (female): volume, side part, soft locks
      '<path class="mc-hair-back mc-female-hair" d="M110 38 C 72 38, 58 70, 60 106 C 62 132, 68 148, 76 154 L 78 100 C 86 78, 134 78, 142 100 L 144 154 C 152 148, 158 132, 160 106 C 162 70, 148 38, 110 38 Z" fill="var(--mc-hair)"/>',
      // short contemporary cut (male)
      '<path class="mc-hair-back mc-male-hair" d="M110 40 C 82 40, 70 66, 72 98 L 74 116 L 80 100 C 90 80, 130 80, 140 100 L 146 116 L 148 98 C 150 66, 138 40, 110 40 Z" fill="var(--mc-hair)"/>',

      '<ellipse cx="110" cy="94" rx="33" ry="38" fill="url(#mc-skin-grad)"/>',
      '<ellipse cx="76" cy="100" rx="5.5" ry="8.5" fill="var(--mc-skin)"/>',
      '<ellipse cx="144" cy="100" rx="5.5" ry="8.5" fill="var(--mc-skin)"/>',

      // parted fringe with a soft shine
      '<path class="mc-hair-front" d="M76 86 C 80 54, 142 52, 146 86 C 138 68, 116 60, 102 66 C 90 71, 82 78, 76 86 Z" fill="var(--mc-hair)"/>',
      '<path class="mc-hair-shine" d="M104 62 C 122 56, 140 64, 146 82 C 134 70, 116 68, 104 74 Z" fill="var(--mc-hair-light)" opacity="0.6"/>',
      '<path class="mc-hair-side mc-female-hair" d="M74 90 C 68 114, 70 142, 76 156 C 82 140, 82 116, 86 102 Z" fill="var(--mc-hair)"/>',
      '<path class="mc-hair-side right mc-female-hair" d="M146 90 C 152 114, 150 142, 144 156 C 138 140, 138 116, 134 102 Z" fill="var(--mc-hair)"/>',

      // brows
      '<path class="mc-brow mc-brow-left" d="M88 82 Q 96 77, 104 81" fill="none" stroke="var(--mc-hair)" stroke-width="2.8" stroke-linecap="round"/>',
      '<path class="mc-brow mc-brow-right" d="M116 81 Q 124 77, 132 82" fill="none" stroke="var(--mc-hair)" stroke-width="2.8" stroke-linecap="round"/>',

      // eyes
      '<g class="mc-eye left">',
      '<ellipse class="mc-eye-white" cx="97" cy="97" rx="7.6" ry="8.6" fill="#fffaf5"/>',
      '<circle class="mc-pupil" cx="97" cy="98" r="3.9" fill="#2f3a4a"/>',
      '<circle cx="98.5" cy="96.4" r="1.2" fill="#fff"/>',
      '</g>',
      '<g class="mc-eye right">',
      '<ellipse class="mc-eye-white" cx="123" cy="97" rx="7.6" ry="8.6" fill="#fffaf5"/>',
      '<circle class="mc-pupil" cx="123" cy="98" r="3.9" fill="#2f3a4a"/>',
      '<circle cx="124.5" cy="96.4" r="1.2" fill="#fff"/>',
      '</g>',

      // polished, natural makeup
      '<ellipse class="mc-shadow" cx="97" cy="91" rx="8" ry="2.6" fill="#c2867a" opacity="0.28"/>',
      '<ellipse class="mc-shadow" cx="123" cy="91" rx="8" ry="2.6" fill="#c2867a" opacity="0.28"/>',
      '<ellipse class="mc-cheek" cx="86" cy="110" rx="7" ry="4" fill="#e8836f" opacity="0.28"/>',
      '<ellipse class="mc-cheek" cx="134" cy="110" rx="7" ry="4" fill="#e8836f" opacity="0.28"/>',
      '<path d="M110 103 q -3 7, 2 8" fill="none" stroke="rgba(150,90,70,0.5)" stroke-width="1.8" stroke-linecap="round"/>',

      // mouth (scaleY driven by JS)
      '<g class="mc-mouth-wrap">',
      '<ellipse class="mc-mouth" cx="110" cy="121" rx="9" ry="6.4" fill="#a8455a"/>',
      '<ellipse class="mc-tongue" cx="110" cy="124" rx="5" ry="3.2" fill="#d4798a" opacity="0.8"/>',
      '</g>',

      // minimal jewelry (female preset)
      '<g class="mc-earrings">',
      '<circle cx="76" cy="110" r="2.2" fill="var(--mc-jewel)"/>',
      '<circle cx="144" cy="110" r="2.2" fill="var(--mc-jewel)"/>',
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
    root.style.setProperty('--mc-hair-light', lighten(a.hair || MC_DEFAULTS.actor.hair, 0.3));
    root.style.setProperty('--mc-blazer', a.outfit || MC_DEFAULTS.actor.outfit);
    root.style.setProperty('--mc-blazer-dark', shade(a.outfit || MC_DEFAULTS.actor.outfit, 0.62));
    root.style.setProperty('--mc-blazer-lapel', shade(a.outfit || MC_DEFAULTS.actor.outfit, 0.78));

    root.setAttribute('data-preset', a.preset === 'male' ? 'male' : 'female');
    root.classList.toggle('preset-male', a.preset === 'male');
    root.classList.toggle('preset-female', a.preset !== 'male');

    var isMale = a.preset === 'male';
    var suitLook = isMale || a.style === 'suit';

    // Wardrobe palette: satin blouse for the host look, crisp shirt for a suit.
    root.style.setProperty('--mc-blouse', suitLook ? '#f7f7fa' : '#f2e7d5');
    root.style.setProperty('--mc-blouse-dark', suitLook ? '#e2e2ea' : '#e4d3b6');
    root.style.setProperty('--mc-trousers', shade(a.outfit || MC_DEFAULTS.actor.outfit, 0.82));
    root.style.setProperty('--mc-trousers-dark', shade(a.outfit || MC_DEFAULTS.actor.outfit, 0.6));
    root.style.setProperty('--mc-shoe', '#141119');
    root.style.setProperty('--mc-jewel', '#e6c67f');
    root.style.setProperty('--mc-tie', '#c9a24a');
    root.style.setProperty('--mc-tie-dark', '#a8842f');

    // Female / male wardrobe pieces.
    root.querySelectorAll('.mc-female-hair, .mc-earrings, .mc-necklace, .mc-heels').forEach(function (el) {
      el.style.display = isMale ? 'none' : '';
    });
    root.querySelectorAll('.mc-male-hair, .mc-shoes').forEach(function (el) {
      el.style.display = isMale ? '' : 'none';
    });

    // Accessories: minimal jewelry, necktie, open collar or nothing.
    var tie = root.querySelector('.mc-tie');
    if (tie) tie.style.display = (!isMale && suitLook && a.accessory === 'tie') || (isMale && a.accessory === 'tie') ? '' : 'none';
    var necklace = root.querySelector('.mc-necklace');
    if (necklace) necklace.style.display = !isMale && a.accessory === 'earrings' ? '' : 'none';
    var earrings = root.querySelector('.mc-earrings');
    if (earrings) earrings.style.display = !isMale && a.accessory === 'earrings' ? '' : 'none';

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
