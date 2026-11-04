/**
 * Luxury American wedding-reception stage lighting.
 *
 * Five independent CSS layers (colour wash, spotlights, beams, aisle floor
 * reflection, ambient sparkles) that animate continuously on their own. No
 * WebGL, no canvas, no requestAnimationFrame loop — just CSS keyframes driven
 * by a handful of custom properties, so the lighting keeps moving while the MC
 * speaks, gifts arrive and the dancers dance.
 */
(function () {
  'use strict';

  var DEFAULTS = {
    enabled: true,
    intensity: 65,
    colorSpeed: 1,
    spotSpeed: 1,
    spotBrightness: 60,
    spotCount: 3,
    beams: true,
    floor: true,
    sparkles: true,
    lowPerf: false
  };
  var config = Object.assign({}, DEFAULTS);
  var layer = null;
  var built = false;

  function sparkleMarkup(count) {
    var out = [];
    // Deterministic pseudo-random placement: stable across reloads, no JS loop.
    var seed = 7;
    var rand = function () {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (var i = 0; i < count; i += 1) {
      var x = 6 + rand() * 88;
      var y = 6 + rand() * 72;
      var size = 3 + rand() * 5;
      var delay = (rand() * 14).toFixed(2);
      var dur = (9 + rand() * 9).toFixed(2);
      out.push(
        '<i class="sl-sparkle" style="left:' + x.toFixed(2) + '%;top:' + y.toFixed(2) + '%;' +
        'width:' + size.toFixed(1) + 'px;height:' + size.toFixed(1) + 'px;' +
        '--sl-dur:' + dur + 's;--sl-delay:-' + delay + 's"></i>'
      );
    }
    return out.join('');
  }

  function build() {
    if (built) return true;
    var scene = document.getElementById('scene');
    if (!scene) return false;

    layer = document.createElement('div');
    layer.id = 'stage-lighting';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = [
      '<div class="sl-wash sl-wash--a"></div>',
      '<div class="sl-wash sl-wash--b"></div>',
      '<div class="sl-wash sl-wash--c"></div>',
      '<div class="sl-spot sl-spot--1"></div>',
      '<div class="sl-spot sl-spot--2"></div>',
      '<div class="sl-spot sl-spot--3"></div>',
      '<div class="sl-beams">',
      '<span class="sl-beam sl-beam--1"></span>',
      '<span class="sl-beam sl-beam--2"></span>',
      '<span class="sl-beam sl-beam--3"></span>',
      '</div>',
      '<div class="sl-floor"><span class="sl-floor-glow"></span><span class="sl-floor-sweep"></span></div>',
      '<div class="sl-sparkles">' + sparkleMarkup(16) + '</div>'
    ].join('');

    // Insert before the couple/MC/dancers so nothing is ever covered.
    var firstActor = scene.querySelector('#wedding-stage');
    if (firstActor && firstActor.parentNode === scene) scene.insertBefore(layer, firstActor);
    else scene.appendChild(layer);

    built = true;
    applyConfig(config);
    console.log('[LIGHTING] stage lighting ready', JSON.stringify(config));
    return true;
  }

  function applyConfig(next) {
    config = Object.assign({}, DEFAULTS, next || {});
    if (!layer) return;
    var intensity = Number(config.intensity);
    var colorSpeed = Number(config.colorSpeed);
    var spotSpeed = Number(config.spotSpeed);
    var brightness = Number(config.spotBrightness);
    var spots = Math.round(Number(config.spotCount));

    layer.dataset.enabled = config.enabled === false ? 'false' : 'true';
    layer.dataset.beams = config.beams === false ? 'false' : 'true';
    layer.dataset.floor = config.floor === false ? 'false' : 'true';
    layer.dataset.sparkles = config.sparkles === false ? 'false' : 'true';
    layer.dataset.lowperf = config.lowPerf === true ? 'true' : 'false';
    layer.dataset.spotCount = String(Math.max(1, Math.min(3, spots || 3)));

    layer.style.setProperty('--sl-intensity', String(Math.max(0, Math.min(100, intensity)) / 100));
    layer.style.setProperty('--sl-color-dur', (30 / (colorSpeed > 0 ? colorSpeed : 1)).toFixed(1) + 's');
    layer.style.setProperty('--sl-spot-dur', (20 / (spotSpeed > 0 ? spotSpeed : 1)).toFixed(1) + 's');
    layer.style.setProperty('--sl-spot-bright', String(Math.max(0, Math.min(100, brightness)) / 100));
  }

  document.addEventListener('wedding:lighting', function (event) {
    applyConfig(event && event.detail);
  });

  function boot() {
    if (!build()) return false;
    if (window.fetch) {
      fetch('/api/state', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (state) {
          if (state && state.config && state.config.stageLighting) applyConfig(state.config.stageLighting);
        })
        .catch(function () {});
    }
    return true;
  }

  var tries = 0;
  (function waitForScene() {
    if (boot()) return;
    tries += 1;
    if (tries < 80) setTimeout(waitForScene, 150);
  })();

  // Read-only diagnostics for the operator and the automated checks.
  window.__stageLighting = function () {
    if (!layer) return { built: false };
    var layerStyle = getComputedStyle(layer);
    var animated = (document.getAnimations ? document.getAnimations() : [])
      .filter(function (a) { return String(a.animationName || '').indexOf('sl-') === 0; });
    var box = layer.getBoundingClientRect();
    return {
      built: true,
      enabled: config.enabled !== false,
      intensity: Number(config.intensity),
      colorSpeed: Number(config.colorSpeed),
      spotSpeed: Number(config.spotSpeed),
      spotBrightness: Number(config.spotBrightness),
      spotCount: Number(config.spotCount),
      beams: config.beams !== false,
      floor: config.floor !== false,
      sparkles: config.sparkles !== false,
      lowPerf: config.lowPerf === true,
      opacityVar: layerStyle.getPropertyValue('--sl-intensity').trim(),
      colorDuration: layerStyle.getPropertyValue('--sl-color-dur').trim(),
      spotDuration: layerStyle.getPropertyValue('--sl-spot-dur').trim(),
      display: layerStyle.display,
      pointerEvents: layerStyle.pointerEvents,
      zIndex: layerStyle.zIndex,
      box: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
      animations: animated.length,
      animationNames: sortedUnique(animated.map(function (a) { return a.animationName; })),
      running: animated.filter(function (a) { return a.playState === 'running'; }).length,
      spots: layer.querySelectorAll('.sl-spot').length,
      beamsCount: layer.querySelectorAll('.sl-beam').length,
      sparkleCount: layer.querySelectorAll('.sl-sparkle').length
    };
  };

  function sortedUnique(values) {
    var seen = {};
    var out = [];
    values.forEach(function (v) { if (!seen[v]) { seen[v] = true; out.push(v); } });
    return out.sort();
  }
})();
