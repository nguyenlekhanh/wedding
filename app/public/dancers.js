/**
 * Two wedding-party dancers who keep dancing on both sides of the aisle for the
 * whole broadcast.
 *
 * Pure SVG + CSS animation: no canvas, no requestAnimationFrame loop, no engine.
 * They read the dashboard settings from /api/state and from the 'wedding:dancers'
 * event dispatched by the overlay, and they never depend on gifts, MC speech or
 * ceremonies — the animation runs from the moment the layer is added.
 */
(function () {
  'use strict';

  var DEFAULTS = { enabled: true, left: true, right: true, speed: 1, scale: 1, intensity: 1 };
  var config = Object.assign({}, DEFAULTS);
  var layer = null;
  var nodes = { left: null, right: null };

  function femaleMarkup() {
    return [
      '<svg class="dn-svg" viewBox="0 0 180 320" role="img" aria-label="Bridesmaid dancing on the aisle">',
      '<ellipse class="dn-shadow" cx="90" cy="311" rx="46" ry="8"></ellipse>',
      '<g class="dn-body">',
      '<g class="dn-leg dn-leg--l">',
      '<path d="M78 212 L74 284" stroke="#e8b592" stroke-width="12" stroke-linecap="round"></path>',
      '<path d="M66 284 h18 l7 12 h-27 z" fill="#c98b5e"></path>',
      '</g>',
      '<g class="dn-leg dn-leg--r">',
      '<path d="M102 212 L106 284" stroke="#e8b592" stroke-width="12" stroke-linecap="round"></path>',
      '<path d="M95 284 h18 l7 12 h-27 z" fill="#c98b5e"></path>',
      '</g>',
      '<g class="dn-skirt">',
      '<path d="M60 148 Q90 136 120 148 L138 222 Q90 240 42 222 Z" fill="#e4667f"></path>',
      '<path d="M60 148 Q90 160 120 148 L124 178 Q90 190 56 178 Z" fill="#f28ba1" opacity="0.9"></path>',
      '<path d="M42 222 Q90 240 138 222" fill="none" stroke="#c94f6b" stroke-width="3"></path>',
      '</g>',
      '<path class="dn-torso" d="M62 116 Q90 104 118 116 L120 156 Q90 168 60 156 Z" fill="#ee7d96"></path>',
      '<path d="M78 110 Q90 124 102 110" fill="none" stroke="#f9cdd8" stroke-width="5" stroke-linecap="round"></path>',
      '<g class="dn-arm dn-arm--l">',
      '<path d="M64 124 Q46 152 40 182" fill="none" stroke="#e8b592" stroke-width="11" stroke-linecap="round"></path>',
      '<circle cx="39" cy="186" r="7" fill="#f2c9a4"></circle>',
      '</g>',
      '<g class="dn-arm dn-arm--r">',
      '<path d="M116 124 Q134 144 143 118" fill="none" stroke="#e8b592" stroke-width="11" stroke-linecap="round"></path>',
      '<circle cx="145" cy="114" r="7" fill="#f2c9a4"></circle>',
      '</g>',
      '<g class="dn-head">',
      '<path d="M84 102 h12 v16 h-12 z" fill="#e8b592"></path>',
      '<ellipse cx="90" cy="78" rx="25" ry="27" fill="#f2c9a4"></ellipse>',
      '<path d="M63 76 Q62 42 90 40 Q120 42 118 78 Q112 58 90 54 Q68 56 63 76 Z" fill="#dfb163"></path>',
      '<path d="M64 68 Q74 50 92 48 Q110 50 116 64 Q104 56 88 58 Q72 60 64 68 Z" fill="#f2d29a"></path>',
      '<path d="M113 54 l7 -7 l2 9 z" fill="#ffd98a"></path>',
      '<circle cx="80" cy="78" r="2.6" fill="#3a2b25"></circle>',
      '<circle cx="100" cy="78" r="2.6" fill="#3a2b25"></circle>',
      '<circle cx="70" cy="86" r="5" fill="#f0a3a9" opacity="0.5"></circle>',
      '<circle cx="110" cy="86" r="5" fill="#f0a3a9" opacity="0.5"></circle>',
      '<path d="M83 90 Q90 96 97 90" fill="none" stroke="#c2545b" stroke-width="3" stroke-linecap="round"></path>',
      '</g>',
      '</g>',
      '</svg>'
    ].join('');
  }

  function maleMarkup() {
    return [
      '<svg class="dn-svg" viewBox="0 0 180 320" role="img" aria-label="Groomsman dancing on the aisle">',
      '<ellipse class="dn-shadow" cx="90" cy="311" rx="48" ry="8"></ellipse>',
      '<g class="dn-body">',
      '<g class="dn-leg dn-leg--l">',
      '<path d="M76 204 L72 286" stroke="#2a3044" stroke-width="16" stroke-linecap="round"></path>',
      '<path d="M59 286 h22 l7 12 h-30 z" fill="#2b2118"></path>',
      '</g>',
      '<g class="dn-leg dn-leg--r">',
      '<path d="M104 204 L108 286" stroke="#2a3044" stroke-width="16" stroke-linecap="round"></path>',
      '<path d="M95 286 h22 l7 12 h-30 z" fill="#2b2118"></path>',
      '</g>',
      '<g class="dn-arm dn-arm--l">',
      '<path d="M62 126 Q44 156 40 188" fill="none" stroke="#1d2437" stroke-width="13" stroke-linecap="round"></path>',
      '<circle cx="39" cy="192" r="7" fill="#c98f6a"></circle>',
      '</g>',
      '<g class="dn-arm dn-arm--r">',
      '<path d="M118 126 Q138 146 150 118" fill="none" stroke="#1d2437" stroke-width="13" stroke-linecap="round"></path>',
      '<circle cx="152" cy="114" r="7" fill="#c98f6a"></circle>',
      '</g>',
      '<path class="dn-torso" d="M58 114 Q90 102 122 114 L126 206 Q90 218 54 206 Z" fill="#1d2437"></path>',
      '<path d="M56 112 Q90 100 124 112" fill="none" stroke="#31real" stroke-width="0"></path>',
      '<path d="M78 110 L90 148 L102 110 L96 106 L90 120 L84 106 Z" fill="#f8f5ee"></path>',
      '<path d="M83 110 h14 v9 h-14 z" fill="#d8b06a"></path>',
      '<path d="M90 120 L90 202" stroke="#111726" stroke-width="3"></path>',
      '<path d="M90 146 l6 9 l-6 9 l-6 -9 z" fill="#c9a24a"></path>',
      '<path d="M84 168 l12 0" stroke="#c9a24a" stroke-width="3"></path>',
      '<g class="dn-head">',
      '<path d="M84 100 h12 v16 h-12 z" fill="#c98f6a"></path>',
      '<ellipse cx="90" cy="76" rx="25" ry="27" fill="#d99a72"></ellipse>',
      '<path d="M64 72 Q66 42 90 40 Q116 42 116 72 Q108 56 90 54 Q72 56 64 72 Z" fill="#3b2a20"></path>',
      '<circle cx="80" cy="76" r="2.6" fill="#2b1c14"></circle>',
      '<circle cx="100" cy="76" r="2.6" fill="#2b1c14"></circle>',
      '<path d="M83 88 Q90 95 97 88" fill="none" stroke="#8a4b32" stroke-width="3" stroke-linecap="round"></path>',
      '</g>',
      '</g>',
      '</svg>'
    ].join('');
  }

  function build() {
    if (layer) return true;
    var scene = document.getElementById('scene');
    if (!scene) return false;

    layer = document.createElement('div');
    layer.id = 'dancers-layer';
    layer.setAttribute('aria-hidden', 'true');

    var left = document.createElement('div');
    left.className = 'dancer dancer--left';
    left.dataset.dancer = 'left';
    left.innerHTML = '<div class="dn-root">' + femaleMarkup() + '</div>';

    var right = document.createElement('div');
    right.className = 'dancer dancer--right';
    right.dataset.dancer = 'right';
    right.innerHTML = '<div class="dn-root">' + maleMarkup() + '</div>';

    layer.appendChild(left);
    layer.appendChild(right);
    scene.appendChild(layer);

    nodes.left = left;
    nodes.right = right;
    applyConfig(config);
    return true;
  }

  function applyConfig(next) {
    config = Object.assign({}, DEFAULTS, next || {});
    if (!layer) return;
    layer.dataset.enabled = config.enabled === false ? 'false' : 'true';
    layer.style.setProperty('--dn-speed', String(config.speed));
    layer.style.setProperty('--dn-amp', String(config.intensity));
    layer.style.setProperty('--dn-scale', String(config.scale));
    if (nodes.left) nodes.left.hidden = config.left === false;
    if (nodes.right) nodes.right.hidden = config.right === false;
    layer.dataset.left = config.left === false ? 'hidden' : 'shown';
    layer.dataset.right = config.right === false ? 'hidden' : 'shown';
  }

  // The overlay dispatches the dashboard config on every state snapshot.
  document.addEventListener('wedding:dancers', function (event) {
    applyConfig(event && event.detail);
  });

  // Overlay startup: the layer must exist and dance before any event arrives.
  function boot() {
    if (!build()) return false;
    if (window.fetch) {
      fetch('/api/state', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (state) {
          if (state && state.config && state.config.dancers) applyConfig(state.config.dancers);
        })
        .catch(function () {});
    }
    console.log('[DANCERS] two dancers on the aisle', JSON.stringify(config));
    return true;
  }

  var tries = 0;
  (function waitForScene() {
    if (boot()) return;
    tries += 1;
    if (tries < 80) setTimeout(waitForScene, 150);
  })();

  // Read-only diagnostics for the operator and the automated checks.
  window.__weddingDancers = function () {
    function animOf(node) {
      if (!node) return null;
      var root = node.querySelector('.dn-root');
      var arm = node.querySelector('.dn-arm--l');
      var style = root ? getComputedStyle(root) : null;
      var armStyle = arm ? getComputedStyle(arm) : null;
      var rect = node.getBoundingClientRect();
      return {
        visible: !node.hidden,
        animation: style ? style.animationName : null,
        duration: style ? style.animationDuration : null,
        armAnimation: armStyle ? armStyle.animationName : null,
        armDuration: armStyle ? armStyle.animationDuration : null,
        box: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
      };
    }
    return {
      enabled: config.enabled !== false,
      left: config.left !== false,
      right: config.right !== false,
      speed: Number(config.speed),
      scale: Number(config.scale),
      intensity: Number(config.intensity),
      layer: !!layer,
      leftDancer: animOf(nodes.left),
      rightDancer: animOf(nodes.right)
    };
  };
})();
