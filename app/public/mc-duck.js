/**
 * Background-music ducking helpers.
 *
 * Dependency-free on purpose: the overlay imports the controller, and the
 * automated checks drive the same controller with a fake YouTube player, so the
 * fade behaviour is verified by execution instead of by reading the code.
 *
 * The controller only ever changes the YouTube VOLUME. It never pauses, stops,
 * mutes or reloads the player.
 */

function clampVolume(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

/**
 * Volume the music should drop to while the MC speaks.
 * Never mutes: the result is clamped to >= 1 unless the operator had already
 * muted the music (0 stays 0 — we do not turn music back on).
 */
export function duckTarget(baseVolume, duckVolume) {
  const base = clampVolume(baseVolume, 20);
  const duck = clampVolume(duckVolume, 12);
  const b = base;
  if (b === 0) return 0;
  const d = Math.max(1, duck);
  // If the admin is already quieter than the duck level, do not get louder.
  return Math.min(b, d);
}

/**
 * Smoothstep volume ramp, one entry per step (last entry === target).
 * Durations: 500–800 ms down, 700–1000 ms up.
 */
export function fadeSteps(from, to, durationMs = 650, stepMs = 40) {
  const start = Math.round(clampVolume(from, 20));
  const end = Math.round(clampVolume(to, 12));
  const duration = Number.isFinite(Number(durationMs)) ? Math.max(80, Math.min(3000, Number(durationMs))) : 650;
  const step = Number.isFinite(Number(stepMs)) ? Math.max(10, Math.min(200, Number(stepMs))) : 40;

  const count = Math.max(1, Math.ceil(duration / step));
  const out = [];
  for (let i = 1; i <= count; i += 1) {
    const p = i / count;
    const eased = p * p * (3 - 2 * p); // smoothstep
    out.push(Math.round(start + (end - start) * eased));
  }
  out[out.length - 1] = end;
  return out;
}

/**
 * Ducking controller.
 *
 *   getVolume()        -> current YouTube volume (number|null)
 *   setVolume(v)       -> apply a volume (volume only!)
 *   getAdminVolume()   -> the volume the operator set in the dashboard
 *   getSettings()      -> { enabled, volume } (ducking on/off + duck level)
 *   setTimer/clearTimer-> injected clock (tests use a fake one)
 */
export function createBgmDucker(options) {
  const opts = options || {};
  const getVolume = typeof opts.getVolume === 'function' ? opts.getVolume : () => null;
  const setVolume = typeof opts.setVolume === 'function' ? opts.setVolume : () => {};
  const getAdminVolume = typeof opts.getAdminVolume === 'function' ? opts.getAdminVolume : () => 20;
  const getSettings = typeof opts.getSettings === 'function' ? opts.getSettings : () => ({ enabled: true, volume: 12 });
  const setTimer = typeof opts.setTimer === 'function' ? opts.setTimer : (fn, ms) => setInterval(fn, ms);
  const clearTimer = typeof opts.clearTimer === 'function' ? opts.clearTimer : (id) => clearInterval(id);
  const stepMs = Number.isFinite(Number(opts.stepMs)) ? Math.max(10, Math.min(200, Number(opts.stepMs))) : 40;

  const state = { active: false, base: null, target: null, fading: false, timer: null };

  function readVolume() {
    try {
      const v = Number(getVolume());
      return Number.isFinite(v) ? clampVolume(v, 20) : null;
    } catch (e) {
      return null;
    }
  }

  function writeVolume(v) {
    try {
      setVolume(v);
    } catch (e) {
      // A player error must never leave the mix ducked.
    }
  }

  function adminVolume() {
    try {
      return clampVolume(getAdminVolume(), 20);
    } catch (e) {
      return 20;
    }
  }

  function settings() {
    let s = {};
    try {
      s = getSettings() || {};
    } catch (e) {
      s = {};
    }
    return { enabled: s.enabled !== false, volume: clampVolume(s.volume, 12) };
  }

  function stopFade() {
    if (state.timer !== null && state.timer !== undefined) {
      try {
        clearTimer(state.timer);
      } catch (e) {}
    }
    state.timer = null;
    state.target = null;
    state.fading = false;
  }

  function fadeTo(target, durationMs) {
    const goal = Math.round(clampVolume(target, adminVolume()));
    // Already heading exactly there: keep the running ramp (no stutter).
    if (state.timer !== null && state.target === goal) return;

    const from = readVolume();
    stopFade();
    if (from === null) return;
    if (Math.round(from) === goal) {
      writeVolume(goal);
      return;
    }

    const steps = fadeSteps(from, goal, durationMs, stepMs);
    let index = 0;
    state.target = goal;
    state.fading = true;
    state.timer = setTimer(() => {
      if (index >= steps.length) {
        stopFade();
        return;
      }
      writeVolume(steps[index]);
      index += 1;
      if (index >= steps.length) stopFade();
    }, stepMs);
  }

  /** The MC starts (or keeps) speaking. */
  function duck() {
    if (state.active) return; // consecutive lines: keep the current ducked level
    const cfg = settings();
    if (!cfg.enabled) {
      state.active = false;
      state.base = null;
      return;
    }
    const current = readVolume();
    const admin = adminVolume();
    // Never inherit a stuck zero: if the admin volume is audible, use that.
    state.base = current === null ? admin : (current <= 0 && admin > 0 ? admin : current);
    state.active = true;
    fadeTo(duckTarget(state.base, cfg.volume), 650);
  }

  /** The MC stopped, was paused, was disabled or playback failed. */
  function restore() {
    if (!state.active) return;
    const base = state.base;
    state.active = false;
    state.base = null;
    if (!settings().enabled) return;
    fadeTo(base === null ? adminVolume() : base, 850);
  }

  /** The dashboard changed the music volume (or a state snapshot arrived). */
  function sync(nextAdminVolume) {
    const admin = clampVolume(nextAdminVolume, adminVolume());
    const cfg = settings();
    if (state.active) {
      state.base = admin;
      if (cfg.enabled) fadeTo(duckTarget(admin, cfg.volume), 500);
      return;
    }
    fadeTo(admin, 600);
  }

  function snapshot() {
    return { active: state.active, base: state.base, target: state.target, fading: state.fading };
  }

  function dispose() {
    stopFade();
    state.active = false;
    state.base = null;
  }

  return { duck, restore, sync, state: snapshot, dispose };
}

export default { duckTarget, fadeSteps, createBgmDucker };
