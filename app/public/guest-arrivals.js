/*
 * SIMULATED WEDDING GUEST ARRIVALS
 * ---------------------------------
 * Independent overlay module: when the admin simulates a guest, the character
 * enters at the bottom of the aisle, walks to a free banquet seat, sits down and
 * stays seated. The hall keeps exactly 24 chairs, so when every chair is taken a
 * newcomer replaces the longest-seated guest: that guest stands up, turns and
 * walks out while the newcomer takes the same chair.
 *
 * It only listens to the admin simulator events and reads `simulatedGuests` from
 * the wedding state. It never touches TikTok viewers, gifts, statistics, the MC
 * voice, the BGM player, the dancers or the stage lighting.
 */
(function () {
  'use strict';

  const W = 135; // character box, same footprint as the real guest sprites
  const H = 175;
  const AISLE_X = 540;
  const ENTRANCE_Y = 2010; // just below the frame: the guest walks into view
  const EXIT_Y = 2110;
  const ASSET_COUNT = 6;
  const ASSETS = [1, 2, 3, 4, 5, 6].map(n => `/assets/guest_${n}.png`);

  // The simulator shares the overlay's 24 banquet chairs: same coordinates as
  // `banquetTables` in overlay.js, so a simulated guest sits exactly where a real
  // viewer would. Index 0-11 = left table, 12-23 = right table.
  const SEATS = [
    // Left table
    { x: 100, y: 1200, scale: 0.58 },
    { x: 210, y: 1200, scale: 0.58 },
    { x: 320, y: 1210, scale: 0.58 },

    { x: 95,  y: 1330, scale: 0.68 },
    { x: 205, y: 1330, scale: 0.68 },
    { x: 315, y: 1340, scale: 0.68 },

    { x: 90,  y: 1470, scale: 0.78 },
    { x: 200, y: 1470, scale: 0.78 },
    { x: 310, y: 1480, scale: 0.78 },

    { x: 85,  y: 1620, scale: 0.88 },
    { x: 195, y: 1620, scale: 0.88 },
    { x: 305, y: 1630, scale: 0.88 },

    // Right table
    { x: 760, y: 1210, scale: 0.58 },
    { x: 870, y: 1200, scale: 0.58 },
    { x: 980, y: 1200, scale: 0.58 },

    { x: 765, y: 1340, scale: 0.68 },
    { x: 875, y: 1330, scale: 0.68 },
    { x: 985, y: 1330, scale: 0.68 },

    { x: 770, y: 1480, scale: 0.78 },
    { x: 880, y: 1470, scale: 0.78 },
    { x: 990, y: 1470, scale: 0.78 },

    { x: 775, y: 1630, scale: 0.88 },
    { x: 885, y: 1620, scale: 0.88 },
    { x: 995, y: 1620, scale: 0.88 }
  ];

  const nodes = new Map();
  let booted = false;
  let busy = false; // prevents a double exit animation on a re-broadcast state
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  function layer() {
    let el = document.getElementById('guest-arrivals');
    if (!el) {
      el = document.createElement('div');
      el.id = 'guest-arrivals';
      const scene = document.getElementById('scene') || document.body;
      scene.append(el);
    }
    return el;
  }

  function transformFor(x, y, scale) {
    return `translate(${(x - W / 2).toFixed(1)}px, ${(y - H).toFixed(1)}px) scale(${scale})`;
  }

  function seatAt(index) {
    const seat = SEATS[Number(index)];
    return seat || SEATS[0];
  }

  function later(node, fn, ms) {
    const id = setTimeout(() => {
      if (!node.isConnected) return;
      fn();
    }, ms);
    node._gaTimers = node._gaTimers || [];
    node._gaTimers.push(id);
    return id;
  }

  function sleep(node, ms) {
    return new Promise(resolve => later(node, resolve, ms));
  }

  function clearTimers(node) {
    (node._gaTimers || []).forEach(clearTimeout);
    node._gaTimers = [];
  }

  function createNode(guest) {
    const seat = seatAt(guest.seat);
    const node = document.createElement('div');
    node.className = 'ga-guest';
    node.dataset.id = guest.id;
    node.dataset.seat = String(guest.seat);
    node.dataset.state = 'entering';
    node.dataset.sim = 'true';
    node.style.zIndex = String(100 + Math.round(seat.y / 10));
    node.style.transform = transformFor(AISLE_X, ENTRANCE_Y, 1.06);

    const shadow = document.createElement('div');
    shadow.className = 'ga-shadow';

    const body = document.createElement('div');
    body.className = 'ga-body';

    const sprite = document.createElement('div');
    sprite.className = 'ga-sprite';
    sprite.style.backgroundImage = `url('${ASSETS.includes(guest.asset) ? guest.asset : ASSETS[0]}')`;
    body.append(sprite);

    const badge = document.createElement('div');
    badge.className = 'ga-badge';
    const icon = document.createElement('span');
    icon.textContent = '🎟️';
    const name = document.createElement('b');
    name.textContent = guest.name || 'Guest';
    badge.append(icon, name);

    node.append(shadow, body, badge);
    nodes.set(guest.id, node);
    layer().append(node);
    return node;
  }

  function removeNode(node) {
    clearTimers(node);
    node._gaRemoved = true;
    nodes.delete(node.dataset.id);
    node.classList.add('ga-leaving');
    setTimeout(() => node.remove(), 360);
  }

  // Arrival route: enter at the bottom of the aisle, walk up beside the row the
  // seat belongs to, then step sideways to the chair. Never a direct teleport.
  function pathFor(seat) {
    const side = seat.x < AISLE_X ? -1 : 1;
    const aisleStop = seat.y + 108;
    const lateral = AISLE_X + side * Math.min(132, Math.max(60, Math.abs(seat.x - AISLE_X) * 0.55));
    return [
      { x: AISLE_X, y: ENTRANCE_Y, s: 1.06 },
      { x: AISLE_X, y: 1790, s: 0.92 },
      { x: AISLE_X, y: aisleStop, s: seat.scale * 0.96 },
      { x: lateral, y: Math.min(aisleStop, seat.y + 40), s: seat.scale * 0.98 },
      { x: seat.x - side * 26, y: seat.y + 10, s: seat.scale },
      { x: seat.x, y: seat.y - 2, s: seat.scale }
    ];
  }

  // Exit route: step away from the chair, reach the aisle, then walk down and out
  // of the venue through the same door the guest came in.
  function exitPathFor(seat) {
    const side = seat.x < AISLE_X ? -1 : 1;
    const aisleStop = seat.y + 108;
    const lateral = AISLE_X + side * Math.min(132, Math.max(60, Math.abs(seat.x - AISLE_X) * 0.55));
    return [
      { x: seat.x, y: seat.y - 2, s: seat.scale },
      { x: seat.x - side * 26, y: seat.y + 10, s: seat.scale },
      { x: lateral, y: Math.min(aisleStop, seat.y + 40), s: seat.scale * 0.98 },
      { x: AISLE_X, y: aisleStop, s: seat.scale * 0.96 },
      { x: AISLE_X, y: 1790, s: 0.92 },
      { x: AISLE_X, y: EXIT_Y, s: 1.06 }
    ];
  }

  function placeSeated(node, guest) {
    const seat = seatAt(guest.seat);
    // Any walk still in flight for this node is superseded by the seated pose.
    node._gaToken = Math.random();
    node.dataset.state = 'seated_idle';
    node.style.transform = transformFor(seat.x, seat.y - 2, seat.scale);
    node.classList.add('ga-settled', 'ga-no-anim');
  }

  function reportSeated(guest) {
    if (!guest || !guest.id) return;
    try {
      fetch('/api/guests/seated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: guest.id })
      }).catch(() => {});
    } catch (e) {}
  }

  function reportLeft(guest) {
    if (!guest || !guest.id) return;
    try {
      fetch('/api/guests/left', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: guest.id })
      }).catch(() => {});
    } catch (e) {}
  }

  async function walkSegments(node, points, token) {
    for (let i = 1; i < points.length; i += 1) {
      if (node._gaToken !== token || !node.isConnected) return false;
      const from = points[i - 1];
      const to = points[i];
      const distance = Math.hypot(to.x - from.x, (to.y - from.y) * 0.9);
      const duration = Math.round(Math.min(2400, Math.max(430, (distance / 300) * 1000)));
      const anim = node.animate(
        [{ transform: transformFor(from.x, from.y, from.s) }, { transform: transformFor(to.x, to.y, to.s) }],
        { duration, easing: 'ease-in-out' }
      );
      try {
        await anim.finished;
      } catch (e) {
        return false;
      }
      node.style.transform = transformFor(to.x, to.y, to.s);
      anim.cancel();
    }
    return true;
  }

  async function walkIn(node, guest) {
    const seat = seatAt(guest.seat);
    const points = pathFor(seat);
    const token = Math.random();
    node._gaToken = token;

    node.dataset.state = 'walking';
    for (let i = 1; i < points.length; i += 1) {
      if (node._gaToken !== token || !node.isConnected) return;
      if (i >= points.length - 2) node.dataset.state = 'approaching_seat';
      const from = points[i - 1];
      const to = points[i];
      const distance = Math.hypot(to.x - from.x, (to.y - from.y) * 0.9);
      const duration = Math.round(Math.min(2400, Math.max(430, (distance / 300) * 1000)));
      const easing = i === 1 ? 'ease-out' : 'ease-in-out';
      const anim = node.animate(
        [{ transform: transformFor(from.x, from.y, from.s) }, { transform: transformFor(to.x, to.y, to.s) }],
        { duration, easing }
      );
      try {
        await anim.finished;
      } catch (e) {
        return;
      }
      node.style.transform = transformFor(to.x, to.y, to.s);
      anim.cancel();
    }

    if (!node.isConnected) return;

    // Sit down: a short settle, then the permanent seated idle pose.
    node.dataset.state = 'sitting';
    node.classList.add('ga-settled');
    await sleep(node, 760);
    if (!node.isConnected) return;
    node.dataset.state = 'seated_idle';
    node.classList.remove('ga-no-anim');
    reportSeated(guest);
  }

  // Exit: stand up, turn toward the aisle, walk out through the entrance. The
  // newcomer is only spawned by the server once this guest's chair is released,
  // so the hall never seats 25 people.
  async function walkOut(node, guest) {
    if (!node || node._gaDeparting) return;
    node._gaDeparting = true;
    const token = Math.random();
    node._gaToken = token;
    node.classList.remove('ga-no-anim');
    node.dataset.state = 'standing';

    await sleep(node, 560);
    if (!node.isConnected || node._gaToken !== token) return;
    node.dataset.state = 'turning';

    await sleep(node, 440);
    if (!node.isConnected || node._gaToken !== token) return;
    node.classList.add('ga-turned');
    node.dataset.state = 'leaving_walk';

    const seat = seatAt(guest.seat);
    const walked = await walkSegments(node, exitPathFor(seat), token);
    if (!walked || !node.isConnected) return;

    node.classList.add('ga-leaving');
    reportLeft(guest);
    setTimeout(() => {
      if (node.isConnected) node.remove();
      nodes.delete(guest.id);
    }, 380);
  }

  function startArrival(guest) {
    if (!guest || !guest.id) return;
    const node = createNode(guest);
    if (reducedMotion && reducedMotion.matches) {
      placeSeated(node, guest);
      return;
    }
    void walkIn(node, guest);
  }

  function startDeparture(guest) {
    if (!guest || !guest.id) return;
    const node = nodes.get(guest.id);
    if (!node) return;
    void walkOut(node, guest);
  }

  function sync(list) {
    const guests = Array.isArray(list) ? list : [];
    const ids = new Set(guests.map(g => g.id));

    for (const [id, node] of Array.from(nodes)) {
      if (!ids.has(id)) removeNode(node);
    }

    guests.forEach(guest => {
      if (!guest || !guest.id) return;
      const existing = nodes.get(guest.id);
      if (existing) {
        if (guest.state === 'leaving' && !existing._gaDeparting) startDeparture(guest);
        // The server is authoritative: if it already seated this guest, snap the
        // node into its chair instead of leaving it stuck mid-walk.
        else if (guest.state === 'seated_idle' && existing.dataset.state !== 'seated_idle') placeSeated(existing, guest);
        return;
      }
      if (guest.state === 'leaving') {
        // Page refreshed in the middle of an exit: place the guest in the chair
        // and let them walk out instead of popping out of existence.
        const node = createNode(guest);
        placeSeated(node, guest);
        startDeparture(guest);
        return;
      }
      if (guest.state === 'seated_idle') {
        // A refresh rebuilds arrived guests in their chair instead of replaying
        // every walk after each page load.
        placeSeated(createNode(guest), guest);
      } else {
        startArrival(guest);
      }
    });
  }

  function reset() {
    for (const node of Array.from(nodes.values())) removeNode(node);
  }

  function applyConfig(guests) {
    if (busy) return;
    busy = true;
    try {
      sync(guests);
    } finally {
      busy = false;
    }
    if (!booted) booted = true;
  }

  document.addEventListener('wedding:guest-arrivals', e => {
    applyConfig(e.detail || []);
  });

  document.addEventListener('wedding:guest-arrival', e => {
    const detail = e.detail || {};
    if (detail.guest) startArrival(detail.guest);
  });

  document.addEventListener('wedding:guest-leaving', e => {
    const detail = e.detail || {};
    if (detail.guest) startDeparture(detail.guest);
  });

  document.addEventListener('wedding:guest-arrivals-reset', () => {
    reset();
  });

  // The overlay state snapshot already carries the list, but a direct fetch
  // covers a slow/absent SSE handshake without waiting for the next broadcast.
  fetch('/api/state')
    .then(res => res.json())
    .then(state => {
      if (!booted) applyConfig(state && state.simulatedGuests);
    })
    .catch(() => {});

  // Read-only diagnostics for the operator and the automated checks.
  window.__guestArrivals = () => {
    const list = Array.from(nodes.values());
    const count = states => list.filter(node => states.includes(node.dataset.state)).length;
    return {
      seats: SEATS.length,
      assets: ASSET_COUNT,
      seated: list.map(node => ({
        id: node.dataset.id,
        seat: Number(node.dataset.seat),
        state: node.dataset.state,
        departing: node._gaDeparting === true,
        asset: (node.querySelector('.ga-sprite')?.style.backgroundImage || '').replace(/^url\(["']?|["']?\)$/g, '')
      })),
      counts: {
        total: list.length,
        entering: count(['entering', 'walking', 'approaching_seat', 'sitting']),
        leaving: count(['standing', 'turning', 'leaving_walk']),
        seated: count(['seated_idle'])
      }
    };
  };
})();
