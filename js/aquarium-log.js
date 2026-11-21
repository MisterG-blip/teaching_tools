// ============================================================================
// MODULE: Aquarium-Log
// PURPOSE: Zeigt Trophäenschrank und Sitzungsprotokoll des Klassen-Aquariums.
//          Reine Darstellung: Daten kommen als Argument, gespeichert wird in
//          aquarium.js.
// ============================================================================

import {
  trophyStates, sessionList, parseList, formatDuration, LEAGUES, LEAGUE_IDS, FREE_LEAGUE,
  recordsFor, goldCount, isPlatin, TROPHIES, trophyLevels, FISH_TIER_MIN_POND, MIN_SESSION_SECONDS
} from './aquarium-records.js';
import { aquariumTrophies, aquariumTrophyRulesBody, aquariumSessions, aquariumShelfTabs } from './dom.js';
import { SPECIES, LEAGUE_LOOKS, drawSpeciesPreview } from './aquarium-fish.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TIER_NUMBER = { locked: 0, bronze: 1, silver: 2, gold: 3, platin: 3 };
const BADGE_TEXT = {
  quiet: '🏆 Ruhe-Rekord',
  fish: '🐠 Fisch-Rekord',
  sharkfree: '🛡️ Haifrei-Rekord',
  haifrei: '🛡️ Haifrei'   // ältere Aufzeichnungen
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs).forEach(k => node.setAttribute(k, attrs[k]));
  return node;
}

// ---------- Trophäenschrank ----------

export function renderTrophies(records, league) {
  aquariumTrophies.innerHTML = '';
  trophyStates(records).forEach(t => {
    const li = el('li', 'trophy-card' + (t.wide ? ' is-wide' : ''));
    li.dataset.tier = t.tier;
    li.dataset.trophy = t.id;

    // Der Fisch, den dieser Pokal freischaltet (grau, solange er gesperrt ist)
    const unlocked = t.tier !== 'locked';
    const species = SPECIES[t.id];
    if (species) {
      const fish = el('canvas', 'trophy-fish');
      fish.setAttribute('role', 'img');
      fish.setAttribute('aria-label', unlocked ? species.name + ' (freigeschaltet)' : species.name + ' (noch gesperrt)');
      drawSpeciesPreview(fish, t.id, TIER_NUMBER[t.tier] || 0, unlocked, league);
      li.appendChild(fish);
    }

    li.appendChild(el('p', 'trophy-title', t.icon + ' ' + t.title));

    if (t.tierName) li.appendChild(el('span', 'trophy-tier', t.tierName));
    li.appendChild(el('p', 'trophy-value', t.value));
    li.appendChild(el('p', 'trophy-detail', t.detail));
    if (species) {
      li.appendChild(el('p', 'trophy-fishname', unlocked ? '🐠 ' + species.name + ' ist im Becken' : '🔒 Schaltet frei: ' + species.name));
    }
    aquariumTrophies.appendChild(li);
  });
}

// ---------- Erklärung: wie bekommt man welchen Pokal? ----------
// Wird einmal aus den Pokal-Definitionen gebaut, bleibt also immer aktuell.

function renderTrophyRules() {
  const body = aquariumTrophyRulesBody;
  if (!body || body.childElementCount > 0) return;

  const intro = el('ul', 'trophy-rules-intro');
  [
    'Jede Liga (Neuling, Allrounder, Champion) hat ihre eigenen Pokale und zählt für sich. Im freien Modus gibt es keine Pokale.',
    'Eine Sitzung ist die Zeit, in der das Mikrofon an ist. Ab ' + Math.round(MIN_SESSION_SECONDS / 60) + ' Min. wird sie aufgezeichnet.',
    'Jeder Pokal hat drei Stufen: Bronze, Silber und Gold. Ab Bronze schwimmt der zugehörige Bonus-Fisch im Aquarium mit. Jede Liga hat ihre eigene Farbe: Neuling in Originalfarben, Allrounder ' + LEAGUE_LOOKS.allround.label + ', Champion ' + LEAGUE_LOOKS.champ.label + '.',
    'Den Aquarium-Legende-Pokal (Platin) gibt es, wenn alle ' + TROPHIES.length + ' Pokale einer Liga auf Gold stehen.',
    'Die Fischfreunde zählen erst ab ' + FISH_TIER_MIN_POND + ' Fischen im Becken.'
  ].forEach(text => intro.appendChild(el('li', '', text)));
  body.appendChild(intro);

  const list = el('div', 'trophy-rules-list');
  TROPHIES.forEach(t => {
    const card = el('div', 'trophy-rule');
    card.appendChild(el('p', 'trophy-rule-title', t.icon + ' ' + t.title + (SPECIES[t.id] ? '  ·  Bonus-Fisch: ' + SPECIES[t.id].name : '')));
    card.appendChild(el('p', 'trophy-rule-hint', t.detail));
    const levels = el('ul', 'trophy-rule-levels');
    trophyLevels(t).forEach(text => levels.appendChild(el('li', '', text)));
    card.appendChild(levels);
    list.appendChild(card);
  });
  body.appendChild(list);
}

// ---------- Sitzungsprotokoll ----------

function buildChart(session) {
  const W = 300, H = 64, PAD = 4;
  const values = parseList(session.curve);
  const ate = parseList(session.ate);

  // Die Linie ist ein gestauchtes SVG; die Hai-Marker liegen als normale
  // HTML-Elemente darüber, damit das Emoji nicht verzerrt wird.
  const wrap = el('div', 'session-chart-wrap');
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', 'Lautstärke-Verlauf dieser Sitzung, ' + ate.length + ' gefressene Fische');

  const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', class: 'session-chart', 'aria-hidden': 'true' });
  const y = v => H - PAD - (Math.max(0, Math.min(100, v)) / 100) * (H - PAD * 2);

  if (session.threshold > 0) {
    svg.appendChild(svgEl('line', {
      x1: 0, x2: W, y1: y(session.threshold), y2: y(session.threshold), class: 'chart-threshold'
    }));
  }

  if (values.length > 1) {
    const step = W / (values.length - 1);
    const pts = values.map((v, i) => (i * step).toFixed(1) + ',' + y(v).toFixed(1));
    svg.appendChild(svgEl('polygon', { points: '0,' + H + ' ' + pts.join(' ') + ' ' + W + ',' + H, class: 'chart-area' }));
    svg.appendChild(svgEl('polyline', { points: pts.join(' '), class: 'chart-line' }));
  }
  wrap.appendChild(svg);

  const dur = Math.max(1, session.dur || 1);
  ate.forEach(t => {
    const pct = Math.max(2, Math.min(98, (t / dur) * 100));
    const mark = el('span', 'chart-shark', '🦈');
    mark.style.left = pct + '%';
    mark.setAttribute('aria-hidden', 'true');
    wrap.appendChild(mark);
  });

  return wrap;
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function renderSessions(aquarium) {
  aquariumSessions.innerHTML = '';
  const list = sessionList(aquarium);

  if (list.length === 0) {
    aquariumSessions.appendChild(el('li', 'session-empty', 'Noch keine Aufzeichnung. Sitzungen ab 1 Minute werden automatisch gespeichert, sobald das Mikrofon gestoppt wird.'));
    return;
  }

  list.forEach(s => {
    const li = el('li', 'session-item');

    const head = el('div', 'session-head');
    head.appendChild(el('strong', 'session-date', formatDate(s.start)));
    if (s.league === FREE_LEAGUE) head.appendChild(el('span', 'session-league', '🎛️ Frei'));
    else if (LEAGUES[s.league]) head.appendChild(el('span', 'session-league', LEAGUES[s.league].icon + ' ' + LEAGUES[s.league].name));
    (s.badges || []).forEach(b => {
      if (BADGE_TEXT[b]) head.appendChild(el('span', 'session-badge', BADGE_TEXT[b]));
    });
    li.appendChild(head);

    const facts = el('p', 'session-facts');
    facts.textContent =
      '⏱ ' + formatDuration(s.dur) + ' Min.' +
      '  ·  🤫 längste Ruhe ' + formatDuration(s.bestQuiet) +
      '  ·  🐠 ' + s.fishEnd + ' von ' + s.fishMax +
      '  ·  🦈 ' + s.eaten + (s.eaten === 1 ? ' Fisch gefressen' : ' Fische gefressen');
    if (s.rescued) facts.textContent += '  ·  🛟 ' + s.rescued + ' gerettet';
    if (s.comebacks) facts.textContent += '  ·  🌱 ' + s.comebacks + '× Comeback';
    if (s.pondFull) facts.textContent += '  ·  🐟 ' + s.pondFull + '× Voller Teich';
    li.appendChild(facts);

    li.appendChild(buildChart(s));
    aquariumSessions.appendChild(li);
  });
}

// Beschriftung der Reiter: wie viele Pokale in der Liga auf Gold stehen (Platin = 👑 voll)
function renderTabs(aquarium, shelfLeague) {
  aquariumShelfTabs.forEach(tab => {
    const id = tab.dataset.shelf;
    const records = recordsFor(aquarium, id);
    const count = tab.querySelector('.league-tab-count');
    if (count) count.textContent = isPlatin(records) ? '💎' : goldCount(records) + '/' + TROPHIES.length;
    const active = id === shelfLeague;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

export function renderLog(aquarium, shelfLeague = 'rookie') {
  renderTrophyRules();
  renderTabs(aquarium, shelfLeague);
  renderTrophies(recordsFor(aquarium, shelfLeague), shelfLeague);
  renderSessions(aquarium);
}
