// ============================================================================
// MODULE: Aquarium-Rekorde
// PURPOSE: Reine Logik (kein DOM, kein Firebase) für Pokale, Rekorde und die
//          Aufzeichnung der Sitzungen im Klassen-Aquarium.
//
// Gespeichert wird pro Gruppe unter groups/{id}/aquarium:
//   records  - { bestQuiet, mostFish:{alive,max,at}, bestSharkFree, totalQuiet,
//                rescued, comeback, pond }
//   sessions - { "s<Startzeit>": Sitzung }   (nur die letzten MAX_SESSIONS)
//
// Eine Sitzung enthält nur Zahlen: Dauer, Ruhezeit, Fische, Lautstärke-Verlauf.
// Es wird KEIN Ton aufgezeichnet.
//
// Pokale: Jeder Pokal hat 3 Stufen (Bronze, Silber, Gold). Den Platin-Pokal
// gibt es, wenn ALLE anderen Pokale auf Gold stehen.
// ============================================================================

export const MAX_SESSIONS = 30;          // so viele Sitzungen bleiben gespeichert
export const MIN_SESSION_SECONDS = 60;   // kürzere Sitzungen werden nicht gespeichert
export const FISH_RECORD_MIN_SECONDS = 120;
export const CURVE_POINTS = 100;         // so viele Punkte hat der gespeicherte Verlauf höchstens
export const QUIET_RECORD_MIN_SECONDS = 60; // erst ab dieser Serie gibt es eine "Neuer Rekord"-Meldung
export const FISH_TIER_MIN_POND = 4;     // Fischfreunde gibt es erst ab so vielen Fischen im Becken

// Fischfreunde: Stufe, sobald nach `seconds` Hörzeit noch `ratio` der Fische leben.
// Relativ zur Beckengröße (Standard: ein Fisch pro Schüler), deshalb passt es zu jeder Klasse.
export const FISH_TIER_RULES = [
  { seconds: 300, ratio: 0.5,  text: 'Bronze: nach 5 Min. noch mindestens die Hälfte der Fische' },
  { seconds: 600, ratio: 0.75, text: 'Silber: nach 10 Min. noch mindestens 75 % der Fische' },
  { seconds: 900, ratio: 1,    text: 'Gold: nach 15 Min. noch alle Fische' }
];

// Stufe (0-3), die ein Becken zu diesem Zeitpunkt erfüllt
export function fishTierNow(listenSeconds, alive, max) {
  if (max < FISH_TIER_MIN_POND) return 0;
  const ratio = alive / max;
  let tier = 0;
  FISH_TIER_RULES.forEach((rule, i) => {
    if (listenSeconds >= rule.seconds && ratio >= rule.ratio) tier = i + 1;
  });
  return tier;
}

// ---------- Hilfen ----------

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function formatLongDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s < 3600) return Math.floor(s / 60) + ' Min.';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h + ' Std. ' + m + ' Min.';
}

// 0 = noch keine Stufe, 1 = Bronze, 2 = Silber, 3 = Gold
export function tierOf(value, thresholds) {
  let tier = 0;
  thresholds.forEach((t, i) => { if ((value || 0) >= t) tier = i + 1; });
  return tier;
}

const TIER_NAMES = ['', 'Bronze', 'Silber', 'Gold'];
const TIER_KEYS = ['locked', 'bronze', 'silver', 'gold'];
export const tierName = tier => TIER_NAMES[tier] || '';

// ---------- Pokal-Definitionen ----------
// tiers            -> Schwellenwerte für Bronze, Silber, Gold
// value(records)   -> Zahl, nach der die Stufe bestimmt wird
// show(value, r)   -> Haupttext der Karte
// step(diff)       -> Text für "Noch <diff> bis <Stufe>"

const secondsStep = diff => formatDuration(diff);
const longStep = diff => formatLongDuration(diff);
const countStep = diff => diff + ' Mal';

// Ältere Aufzeichnungen kannten nur "haifrei" = Anzahl Sitzungen mit mindestens 5 Min.
function sharkFreeOf(r) {
  if (r.bestSharkFree) return r.bestSharkFree;
  return r.haifrei ? 300 : 0;
}

export const TROPHIES = [
  {
    id: 'quiet', icon: '🏆', title: 'Ruhe-Meister',
    tiers: [120, 300, 600],
    value: r => r.bestQuiet || 0,
    show: v => (v > 0 ? 'Rekord: ' + formatDuration(v) : 'Noch keine Serie'),
    step: secondsStep,
    detail: 'Längste Ruhe am Stück'
  },
  {
    id: 'fish', icon: '🐠', title: 'Fischfreunde',
    tiers: [1, 2, 3],
    value: r => r.fishTier || 0,
    show: (v, r) => (r.mostFish ? 'Bester Teich: ' + r.mostFish.alive + ' von ' + r.mostFish.max : 'Noch kein Rekord'),
    nextText: v => FISH_TIER_RULES[v].text,
    detail: 'Fische retten (ein Fisch pro Schüler)'
  },
  {
    id: 'sharkfree', icon: '🛡️', title: 'Haifrei',
    tiers: [300, 600, 1200],
    value: r => sharkFreeOf(r),
    show: v => (v > 0 ? 'Rekord: ' + formatDuration(v) : 'Noch nicht geschafft'),
    step: secondsStep,
    detail: 'Längste Zeit ohne gefressenen Fisch'
  },
  {
    id: 'total', icon: '🌊', title: 'Ruhe-Konto',
    tiers: [1800, 7200, 18000],
    value: r => r.totalQuiet || 0,
    show: v => (v > 0 ? 'Gesamt: ' + formatLongDuration(v) : 'Noch keine Ruhe gesammelt'),
    step: longStep,
    detail: 'Gesammelte Ruhe über alle Sitzungen'
  },
  {
    id: 'rescued', icon: '🛟', title: 'Gerettet',
    tiers: [1, 10, 25],
    value: r => r.rescued || 0,
    show: v => (v > 0 ? v + '× gerettet' : 'Noch niemand gerettet'),
    step: countStep,
    detail: 'Der Hai bricht ab, weil es rechtzeitig leise wurde'
  },
  {
    id: 'comeback', icon: '🌱', title: 'Comeback',
    tiers: [1, 5, 15],
    value: r => r.comeback || 0,
    show: v => (v > 0 ? v + '× Comeback' : 'Noch kein Comeback'),
    step: countStep,
    detail: '3 Min. Ruhe nach einem gefressenen Fisch'
  },
  {
    id: 'pond', icon: '🐟', title: 'Voller Teich',
    tiers: [1, 3, 10],
    value: r => r.pond || 0,
    show: v => (v > 0 ? v + '× wieder voll' : 'Noch nie wieder voll'),
    step: countStep,
    detail: 'Alle Fische nach einem Verlust wieder da'
  }
];

// ---------- Stufen und Platin ----------

// { quiet: 2, fish: 0, ... }
export function trophyTiers(records) {
  const r = records || {};
  const out = {};
  TROPHIES.forEach(t => { out[t.id] = tierOf(t.value(r), t.tiers); });
  return out;
}

export function goldCount(records) {
  const tiers = trophyTiers(records);
  return TROPHIES.filter(t => tiers[t.id] === 3).length;
}

export function isPlatin(records) {
  return goldCount(records) === TROPHIES.length;
}

/**
 * Pokale für die Anzeige: die 7 Pokale plus Platin am Ende.
 * tier: 'locked' | 'bronze' | 'silver' | 'gold' | 'platin'
 */
export function trophyStates(records) {
  const r = records || {};
  const list = TROPHIES.map(t => {
    const value = t.value(r);
    const tier = tierOf(value, t.tiers);
    let detail;
    if (tier >= 3) detail = 'Höchste Stufe erreicht 🎉';
    else if (t.nextText) detail = t.nextText(tier);
    else detail = 'Noch ' + t.step(t.tiers[tier] - value) + ' bis ' + TIER_NAMES[tier + 1];
    return {
      id: t.id, icon: t.icon, title: t.title,
      tier: TIER_KEYS[tier], tierName: TIER_NAMES[tier],
      value: t.show(value, r), detail, hint: t.detail
    };
  });

  const golds = goldCount(r);
  const platin = golds === TROPHIES.length;
  list.push({
    id: 'platin', icon: '💎', title: 'Aquarium-Legende',
    tier: platin ? 'platin' : 'locked', tierName: platin ? 'Platin' : '',
    value: golds + ' von ' + TROPHIES.length + ' Pokalen auf Gold',
    detail: platin ? 'Alle Pokale auf Gold. Ihr seid Legenden! 🎉' : 'Platin gibt es, wenn alle anderen Pokale Gold sind',
    hint: '', wide: true
  });
  return list;
}

// ---------- Live: gespeicherte Werte + laufende Sitzung ----------

/**
 * @param {object} stored  gespeicherte Rekorde der Gruppe
 * @param {object} live    { bestQuiet, bestSharkFree, quietTotal, rescued, comebacks, pondFull, fishTier }
 * @returns Rekorde, wie sie nach Abschluss der Sitzung aussähen
 */
export function mergeLive(stored, live) {
  const r = Object.assign({}, stored || {});
  r.bestQuiet = Math.max(r.bestQuiet || 0, live.bestQuiet || 0);
  r.bestSharkFree = Math.max(sharkFreeOf(r), live.bestSharkFree || 0);
  r.totalQuiet = (r.totalQuiet || 0) + (live.quietTotal || 0);
  r.rescued = (r.rescued || 0) + (live.rescued || 0);
  r.comeback = (r.comeback || 0) + (live.comebacks || 0);
  r.pond = (r.pond || 0) + (live.pondFull || 0);
  r.fishTier = Math.max(r.fishTier || 0, live.fishTier || 0);
  return r;
}

// ---------- Sitzung bauen ----------

// Verkleinert den Verlauf auf höchstens `max` Punkte. Pro Abschnitt zählt der
// lauteste Wert, damit Ausreißer sichtbar bleiben.
export function downsample(values, max = CURVE_POINTS) {
  if (values.length <= max) return values.slice();
  const out = [];
  const bucket = values.length / max;
  for (let i = 0; i < max; i++) {
    const from = Math.floor(i * bucket);
    const to = Math.max(from + 1, Math.floor((i + 1) * bucket));
    let peak = 0;
    for (let j = from; j < to && j < values.length; j++) peak = Math.max(peak, values[j]);
    out.push(peak);
  }
  return out;
}

/**
 * @param {object} p  { start, dur, quiet, bestQuiet, bestSharkFree, eaten, rescued, comebacks,
 *                      pondFull, fishTier, fishEnd, fishMax, threshold, curve:number[] (1 Wert/Sekunde),
 *                      ate:number[] (Sekunden) }
 * @returns Sitzung in gespeicherter Form (Verlauf und Zeitpunkte als Text)
 */
export function buildSession(p) {
  return {
    start: p.start,
    dur: Math.round(p.dur),
    quiet: Math.round(p.quiet),
    bestQuiet: Math.round(p.bestQuiet),
    bestSharkFree: Math.round(p.bestSharkFree || 0),
    eaten: p.eaten,
    rescued: p.rescued || 0,
    comebacks: p.comebacks || 0,
    pondFull: p.pondFull || 0,
    fishTier: p.fishTier || 0,
    fishEnd: p.fishEnd,
    fishMax: p.fishMax,
    threshold: Math.round(p.threshold),
    curve: downsample(p.curve.map(v => Math.round(v))).join(','),
    ate: p.ate.map(t => Math.round(t)).join(',')
  };
}

export function parseList(text) {
  if (typeof text !== 'string' || text === '') return [];
  return text.split(',').map(Number).filter(Number.isFinite);
}

export function isSavable(session) {
  return !!session && session.dur >= MIN_SESSION_SECONDS;
}

// ---------- Rekorde ----------

export function isFishRecord(cur, session) {
  if (session.dur < FISH_RECORD_MIN_SECONDS) return false;
  if (session.fishMax < FISH_TIER_MIN_POND) return false;
  const best = cur && cur.mostFish;
  if (!best) return session.fishEnd > 0;
  const ratio = session.fishEnd / session.fishMax;
  const bestRatio = best.alive / best.max;
  if (ratio !== bestRatio) return ratio > bestRatio;
  return session.fishMax > best.max;   // gleicher Anteil in größerem Becken ist mehr wert
}

// Welche Rekorde hat diese Sitzung gebrochen? ('quiet' | 'fish' | 'sharkfree')
export function sessionBadges(cur, session) {
  const c = cur || {};
  const badges = [];
  if (session.bestQuiet > (c.bestQuiet || 0) && session.bestQuiet >= QUIET_RECORD_MIN_SECONDS) badges.push('quiet');
  if (isFishRecord(c, session)) badges.push('fish');
  const sf = session.bestSharkFree || 0;
  const sharkFreeBronze = TROPHIES.find(t => t.id === 'sharkfree').tiers[0];
  if (sf > sharkFreeOf(c) && sf >= sharkFreeBronze) badges.push('sharkfree');
  return badges;
}

// Wird als Transaktion auf groups/{id}/aquarium/records ausgeführt (cur kann null sein)
export function applySessionToRecords(cur, session) {
  const r = Object.assign({ bestQuiet: 0, totalQuiet: 0, rescued: 0, comeback: 0, pond: 0 }, cur || {});
  if (session.bestQuiet > r.bestQuiet) {
    r.bestQuiet = session.bestQuiet;
    r.bestQuietAt = session.start;
  }
  if (isFishRecord(cur, session)) {
    r.mostFish = { alive: session.fishEnd, max: session.fishMax, at: session.start };
  }
  r.bestSharkFree = Math.max(sharkFreeOf(r), session.bestSharkFree || 0);
  r.totalQuiet = (r.totalQuiet || 0) + session.quiet;
  r.rescued = (r.rescued || 0) + (session.rescued || 0);
  r.comeback = (r.comeback || 0) + (session.comebacks || 0);
  r.pond = (r.pond || 0) + (session.pondFull || 0);
  r.fishTier = Math.max(r.fishTier || 0, session.fishTier || 0);
  r.updatedAt = Date.now();
  return r;
}

// Sitzungen einer Gruppe, neueste zuerst
export function sessionList(aquarium, limit = 10) {
  const sessions = (aquarium && aquarium.sessions) || {};
  return Object.keys(sessions)
    .map(key => Object.assign({ key }, sessions[key]))
    .sort((a, b) => (b.start || 0) - (a.start || 0))
    .slice(0, limit);
}

// Schlüssel der ältesten Sitzungen, die über dem Limit liegen
export function overflowKeys(aquarium, max = MAX_SESSIONS) {
  const keys = Object.keys((aquarium && aquarium.sessions) || {}).sort();
  return keys.slice(0, Math.max(0, keys.length - max));
}
