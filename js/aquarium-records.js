// ============================================================================
// MODULE: Aquarium-Rekorde
// PURPOSE: Reine Logik (kein DOM, kein Firebase) für Pokale, Rekorde und die
//          Aufzeichnung der Sitzungen im Klassen-Aquarium.
//
// Gespeichert wird pro Gruppe unter groups/{id}/aquarium:
//   records  - { bestQuiet, bestQuietAt, mostFish: {alive, max, at}, haifrei, totalQuiet }
//   sessions - { "s<Startzeit>": Sitzung }   (nur die letzten MAX_SESSIONS)
//
// Eine Sitzung enthält nur Zahlen: Dauer, Ruhezeit, Fische, Lautstärke-Verlauf.
// Es wird KEIN Ton aufgezeichnet.
// ============================================================================

export const MAX_SESSIONS = 30;          // so viele Sitzungen bleiben gespeichert
export const MIN_SESSION_SECONDS = 60;   // kürzere Sitzungen werden nicht gespeichert
export const FISH_RECORD_MIN_SECONDS = 120;
export const HAIFREI_SECONDS = 300;      // so lange ohne gefressenen Fisch
export const CURVE_POINTS = 100;         // so viele Punkte hat der gespeicherte Verlauf höchstens

// Pokal-Stufen: Sekunden, ab denen es Bronze/Silber/Gold gibt
export const QUIET_TIERS = [
  { name: 'Bronze', seconds: 120 },
  { name: 'Silber', seconds: 300 },
  { name: 'Gold', seconds: 900 }
];
export const TOTAL_TIERS = [
  { name: 'Bronze', seconds: 1800 },
  { name: 'Silber', seconds: 7200 },
  { name: 'Gold', seconds: 18000 }
];

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
export function tierOf(seconds, tiers) {
  let tier = 0;
  tiers.forEach((t, i) => { if ((seconds || 0) >= t.seconds) tier = i + 1; });
  return tier;
}

export const quietTier = seconds => tierOf(seconds, QUIET_TIERS);
export const totalTier = seconds => tierOf(seconds, TOTAL_TIERS);

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
 * @param {object} p  { start, dur, quiet, bestQuiet, eaten, fishEnd, fishMax,
 *                      threshold, curve:number[] (1 Wert/Sekunde), ate:number[] (Sekunden) }
 * @returns Sitzung in gespeicherter Form (Verlauf und Zeitpunkte als Text)
 */
export function buildSession(p) {
  return {
    start: p.start,
    dur: Math.round(p.dur),
    quiet: Math.round(p.quiet),
    bestQuiet: Math.round(p.bestQuiet),
    eaten: p.eaten,
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
  return session && session.dur >= MIN_SESSION_SECONDS;
}

// ---------- Rekorde ----------

export function isFishRecord(cur, session) {
  if (session.dur < FISH_RECORD_MIN_SECONDS) return false;
  const best = cur && cur.mostFish;
  if (!best) return session.fishEnd > 0;
  if (session.fishEnd !== best.alive) return session.fishEnd > best.alive;
  return session.fishMax > best.max;
}

export function isHaifrei(session) {
  return session.dur >= HAIFREI_SECONDS && session.eaten === 0;
}

// Welche Rekorde hat diese Sitzung gebrochen? ('quiet' | 'fish' | 'haifrei')
export function sessionBadges(cur, session) {
  const c = cur || {};
  const badges = [];
  if (session.bestQuiet > (c.bestQuiet || 0) && session.bestQuiet >= QUIET_TIERS[0].seconds / 2) badges.push('quiet');
  if (isFishRecord(c, session)) badges.push('fish');
  if (isHaifrei(session)) badges.push('haifrei');
  return badges;
}

// Wird als Transaktion auf groups/{id}/aquarium/records ausgeführt (cur kann null sein)
export function applySessionToRecords(cur, session) {
  const r = Object.assign({ bestQuiet: 0, haifrei: 0, totalQuiet: 0 }, cur || {});
  if (session.bestQuiet > r.bestQuiet) {
    r.bestQuiet = session.bestQuiet;
    r.bestQuietAt = session.start;
  }
  if (isFishRecord(cur, session)) {
    r.mostFish = { alive: session.fishEnd, max: session.fishMax, at: session.start };
  }
  if (isHaifrei(session)) r.haifrei = (r.haifrei || 0) + 1;
  r.totalQuiet = (r.totalQuiet || 0) + session.quiet;
  r.updatedAt = Date.now();
  return r;
}

// ---------- Pokale für die Anzeige ----------

const TIER_NAMES = ['', 'Bronze', 'Silber', 'Gold'];

function nextTierText(seconds, tiers, fmt) {
  const tier = tierOf(seconds, tiers);
  if (tier >= tiers.length) return 'Höchste Stufe erreicht 🎉';
  const next = tiers[tier];
  return 'Noch ' + fmt(next.seconds - (seconds || 0)) + ' bis ' + next.name;
}

/**
 * Liefert die Pokale in der Reihenfolge der Anzeige.
 * tier: 'locked' | 'bronze' | 'silver' | 'gold' | 'record'
 */
export function trophyStates(records) {
  const r = records || {};
  const quiet = r.bestQuiet || 0;
  const qt = quietTier(quiet);
  const total = r.totalQuiet || 0;
  const tt = totalTier(total);
  const fish = r.mostFish || null;
  const haifrei = r.haifrei || 0;
  const tierKey = t => ['locked', 'bronze', 'silver', 'gold'][t];

  return [
    {
      id: 'quiet',
      icon: '🏆',
      title: 'Ruhe-Meister',
      tier: tierKey(qt),
      tierName: TIER_NAMES[qt],
      value: quiet > 0 ? 'Rekord: ' + formatDuration(quiet) : 'Noch keine Serie',
      detail: nextTierText(quiet, QUIET_TIERS, formatDuration)
    },
    {
      id: 'fish',
      icon: '🐠',
      title: 'Fischfreunde',
      tier: fish ? 'record' : 'locked',
      tierName: fish ? 'Rekord' : '',
      value: fish ? fish.alive + ' von ' + fish.max + ' Fischen' : 'Noch kein Rekord',
      detail: fish ? 'Meiste Fische am Ende einer Sitzung' : 'Mindestens 2 Min. zuhören und Fische retten'
    },
    {
      id: 'haifrei',
      icon: '🛡️',
      title: 'Haifrei',
      tier: haifrei > 0 ? 'record' : 'locked',
      tierName: haifrei > 0 ? haifrei + '×' : '',
      value: haifrei > 0 ? haifrei + ' Mal geschafft' : 'Noch nicht geschafft',
      detail: '5 Min. ohne gefressenen Fisch'
    },
    {
      id: 'total',
      icon: '🌊',
      title: 'Ruhe-Konto',
      tier: tierKey(tt),
      tierName: TIER_NAMES[tt],
      value: total > 0 ? 'Gesamt: ' + formatLongDuration(total) : 'Noch keine Ruhe gesammelt',
      detail: nextTierText(total, TOTAL_TIERS, formatLongDuration)
    }
  ];
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
