'use strict';

/**
 * Turns the live wedding state into the compact fact sheet the MC is allowed to
 * use. The model is told to use ONLY these facts, so it can never invent gift
 * values or guest identities.
 */

const { sanitizeName } = require('./sanitize.cjs');

const CEREMONY_LABEL = {
  kiss: 'the bride and groom kissed',
  cheers: 'the whole hall raised a glass',
  dance: 'the guests are dancing',
  cake: 'the wedding cake was cut',
  champagne: 'the champagne tower was poured',
  petal: 'a shower of rose petals fell',
  marry: 'the crown / groom was transferred'
};

function build(state, extras = {}) {
  const cfg = (state && state.config) || {};
  const stats = (state && state.stats) || {};
  const goals = (state && state.goals) || {};
  const scores = Object.values((state && state.scores) || {}).sort((a, b) => b.total - a.total);

  return {
    groom: sanitizeName(cfg.groom, 40),
    bride: sanitizeName(cfg.bride, 40),
    guests: Number(stats.guests) || 0,
    envelopes: Number(stats.envelopes) || 0,
    wishes: Number(stats.wishes) || 0,
    topGiver: scores[0] ? sanitizeName(scores[0].name, 40) : null,
    topGiverCoins: scores[0] ? Number(scores[0].total) || 0 : 0,
    roseGoal: goals.rose ? `${goals.rose.current}/${goals.rose.target}` : null,
    cakeGoal: goals.cake ? `${goals.cake.current}/${goals.cake.target}` : null,
    ceremony: extras.ceremony || null,
    ceremonyLabel: extras.ceremony ? CEREMONY_LABEL[extras.ceremony] || null : null,
    recentGivers: (extras.recentGivers || []).slice(0, 3).map((g) => ({
      name: sanitizeName(g.name, 40),
      gift: String(g.gift || '').slice(0, 40),
      count: Number(g.count) || 1
    })),
    // Bounded memory: the operator's MC should not repeat itself.
    lastLines: (extras.lastLines || []).slice(0, 3)
  };
}

module.exports = { build, CEREMONY_LABEL };
