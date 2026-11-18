// ============================================================================
// MODULE: Aquarium
// PURPOSE: Klassen-Aquarium: Das Mikrofon misst die Lautstärke im Raum. Solange
//          es leise ist, leben die Fische. Ist es zu laut, frisst sie der Hai.
//
// Datenschutz: Es wird NUR die Lautstärke (Pegel) berechnet. Das Audiosignal
//              wird weder aufgenommen noch gespeichert noch übertragen, und es
//              wird auch nicht über die Lautsprecher ausgegeben (sonst
//              gäbe es eine Rückkopplung).
// Zeichnen und Spielregeln stehen in aquarium-scene.js, Rekord-Logik in
// aquarium-records.js, Anzeige von Pokalen/Protokoll in aquarium-log.js.
//
// Aufzeichnung: Eine "Sitzung" läuft, solange das Mikrofon an ist. Beim Beenden
// wird eine Zusammenfassung (nur Zahlen, KEIN Ton) in der aktiven Gruppe
// gespeichert: groups/{id}/aquarium.
// ============================================================================

import {
  ref, set, remove, runTransaction
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js';
import { auth, db } from './firebase-init.js';
import { groups, activeGroupId } from './groups.js';
import { createTank, WORLD_W, WORLD_H } from './aquarium-scene.js';
import * as Rec from './aquarium-records.js';
import { renderLog } from './aquarium-log.js';
import { SPECIES } from './aquarium-fish.js';
import {
  aquariumStage, aquariumCanvas, aquariumStatus, aquariumFishInfo, aquariumBest, aquariumToast,
  aquariumMeterFill, aquariumMeterMark, aquariumThreshold,
  aquariumFishCount, aquariumFishDecrease, aquariumFishIncrease, aquariumRespawn,
  aquariumMicBtn, aquariumCalibrateBtn, aquariumSharkBtn, aquariumResetBtn, aquariumFullscreenBtn,
  aquariumHint, aquariumError, aquariumLogHint, aquariumClearLogBtn
} from './dom.js';

const view = document.getElementById('view-aquarium');
const ctx = aquariumCanvas.getContext('2d');
const tank = createTank();

const DEFAULT_THRESHOLD = 65;
const CALIBRATE_SECONDS = 3;
const MAX_FISH = 40;
const DEFAULT_FISH = 8;      // wenn die Gruppe noch keine Namen hat

// ---------- Zustand ----------

let stream = null;
let audioCtx = null;
let analyser = null;
let sampleBuf = null;
let micOn = false;
let micStarting = false;

let level = 0;           // geglätteter Pegel 0..100 (nur zur Anzeige und für die Spielregeln)
let rawLevel = 0;
let threshold = DEFAULT_THRESHOLD;
let calibration = null;  // { t, sum, n } während der Kalibrierung

let rafId = null;
let lastFrame = 0;
let lastMood = '';
let lastFishText = '';
let lastBestText = '';

// ---------- Hilfsfunktionen ----------

function showError(msg) { aquariumError.textContent = msg; aquariumError.classList.add('show'); }
function clearError() { aquariumError.classList.remove('show'); aquariumError.textContent = ''; }
function setHint(msg) { aquariumHint.textContent = msg; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
const formatTime = Rec.formatDuration;
function fishTarget() {
  const v = parseInt(aquariumFishCount.value, 10);
  return clamp(Number.isFinite(v) ? v : DEFAULT_FISH, 1, MAX_FISH);
}

// ---------- Gruppe & gespeicherte Daten ----------
// Achtung: groups/activeGroupId erst zur Laufzeit lesen (zirkulärer Import mit groups.js).

function currentGroup() {
  return activeGroupId && groups[activeGroupId] ? groups[activeGroupId] : null;
}
function currentAquarium() {
  const g = currentGroup();
  return (g && g.aquarium) || null;
}
function currentRecords() {
  const a = currentAquarium();
  return (a && a.records) || {};
}
function groupLabel() {
  const g = currentGroup();
  return g && g.name ? '„' + g.name + '“' : 'die Klasse';
}
function canSave(groupId) {
  return !!(auth && auth.currentUser && db && groupId && groups[groupId]);
}

function renderLogForActive() {
  const g = currentGroup();
  if (!(auth && auth.currentUser)) {
    aquariumLogHint.textContent = 'Melde dich an und wähle eine Gruppe, damit Pokale und Aufzeichnungen gespeichert werden.';
  } else if (!g) {
    aquariumLogHint.textContent = 'Wähle oben eine Gruppe aus, damit Pokale und Aufzeichnungen gespeichert werden.';
  } else {
    aquariumLogHint.textContent = 'Pokale und Aufzeichnung gehören zur Gruppe ' + groupLabel() + ' und gelten für alle, die diese Gruppe nutzen.';
  }
  aquariumClearLogBtn.disabled = !g || !(auth && auth.currentUser);
  renderLog(currentAquarium());
  syncSpecials(true);
}

// ---------- Meldungen im Becken (auch im Vollbild sichtbar) ----------

const toastQueue = [];
let toastBusy = false;

function toast(text) {
  toastQueue.push(text);
  if (!toastBusy) nextToast();
}

function nextToast() {
  const text = toastQueue.shift();
  if (!text) { toastBusy = false; return; }
  toastBusy = true;
  aquariumToast.textContent = text;
  aquariumToast.classList.remove('show');
  void aquariumToast.offsetWidth; // Animation neu starten
  aquariumToast.classList.add('show');
  setTimeout(() => {
    aquariumToast.classList.remove('show');
    setTimeout(nextToast, 350);
  }, 4200);
}

function celebrate(text) {
  toast(text);
  tank.celebrate();
}

// ---------- Sitzung (Aufzeichnung) ----------

let session = null;
const MEDAL = ['', '🥉', '🥈', '🥇'];

function startSession() {
  if (!micOn || session) return;
  session = {
    start: Date.now(),
    groupId: activeGroupId || null,
    listen: 0,
    sampleT: 0,
    curve: [],
    ate: [],
    fishTier: 0,
    announced: { record: false, tiers: {}, platin: false }
  };
}

tank.onEaten = () => { if (session) session.ate.push(session.listen); };

// Kleine Meldungen für die neuen Erfolge; Stufen-Pokale meldet checkLiveTrophies()
tank.onRescued = () => { if (session) { toast('🛟 Gerettet! Der Hai zieht hungrig ab.'); checkLiveTrophies(); } };
tank.onComeback = () => { if (session) { toast('🌱 Comeback! 3 Minuten Ruhe nach dem Hai-Angriff.'); checkLiveTrophies(); } };
tank.onPondFull = () => { if (session) { toast('🐟 Voller Teich! Alle Fische sind wieder da.'); checkLiveTrophies(); } };

function tickSession(dt) {
  if (!session) return;
  session.listen += dt;
  session.sampleT += dt;
  if (session.sampleT >= 1) {
    session.sampleT -= 1;
    session.curve.push(level);
    session.fishTier = Math.max(session.fishTier, Rec.fishTierNow(session.listen, tank.fish.length, tank.maxFish));
    checkLiveTrophies();   // einmal pro Sekunde reicht
  }
}

// Werte der laufenden Sitzung (für Live-Meldungen)
function liveValues() {
  const st = tank.stats;
  return {
    bestQuiet: st.bestQuiet, bestSharkFree: st.bestSharkFree, quietTotal: st.quietTotal,
    rescued: st.rescued, comebacks: st.comebacks, pondFull: st.pondFull,
    fishTier: session ? session.fishTier : 0
  };
}

function trophyToast(id, tier) {
  const def = Rec.TROPHIES.find(t => t.id === id);
  let text = MEDAL[tier] + ' ' + Rec.tierName(tier) + '-Pokal „' + def.title + '“!';
  if (tier === 1) text += ' Neuer Fisch: ' + SPECIES[id].name;
  celebrate(text);
}

function platinToast() {
  celebrate('💎 PLATIN! ' + groupLabel() + ' sind Aquarium-Legenden: alle Pokale auf Gold! Neuer Fisch: ' + SPECIES.platin.name);
}

// ---------- Besondere Fische: einer pro Pokal ----------

function specialList(records) {
  const tiers = Rec.trophyTiers(records);
  const list = Rec.TROPHIES.filter(t => tiers[t.id] > 0).map(t => ({ id: t.id, tier: tiers[t.id] }));
  if (Rec.isPlatin(records)) list.push({ id: 'platin', tier: 3 });
  return list;
}

// Gespeicherte Pokale plus das, was in der laufenden Sitzung schon erspielt wurde
function syncSpecials(silent) {
  const stored = currentRecords();
  const records = session ? Rec.mergeLive(stored, liveValues()) : stored;
  tank.setSpecials(specialList(records), silent);
}

// Meldet Rekorde und Pokale schon während der Sitzung, nicht erst beim Speichern
function checkLiveTrophies() {
  if (!session) return;
  const a = session.announced;
  const stored = currentRecords();
  const best = tank.stats.bestQuiet;

  if (!a.record && (stored.bestQuiet || 0) >= Rec.QUIET_RECORD_MIN_SECONDS && best > stored.bestQuiet) {
    a.record = true;
    celebrate('🏆 Neuer Ruhe-Rekord für ' + groupLabel() + ': ' + formatTime(best) + '!');
  }

  const before = Rec.trophyTiers(stored);
  const merged = Rec.mergeLive(stored, liveValues());
  const now = Rec.trophyTiers(merged);
  Object.keys(now).forEach(id => {
    if (now[id] > Math.max(before[id], a.tiers[id] || 0)) {
      a.tiers[id] = now[id];
      trophyToast(id, now[id]);
    }
  });
  if (!a.platin && Rec.isPlatin(merged) && !Rec.isPlatin(stored)) {
    a.platin = true;
    platinToast();
  }
  syncSpecials(false);
}

// Beendet die Sitzung und speichert sie. WICHTIG: vor tank.reset() aufrufen,
// weil die Zahlen aus tank.stats kommen.
function endSession(announce) {
  if (!session) return;
  const s = session;
  session = null;

  const built = Rec.buildSession({
    start: s.start,
    dur: s.listen,
    quiet: tank.stats.quietTotal,
    bestQuiet: tank.stats.bestQuiet,
    bestSharkFree: tank.stats.bestSharkFree,
    eaten: tank.stats.eaten,
    rescued: tank.stats.rescued,
    comebacks: tank.stats.comebacks,
    pondFull: tank.stats.pondFull,
    fishTier: s.fishTier,
    fishEnd: tank.fish.length,
    fishMax: tank.maxFish,
    threshold,
    curve: s.curve,
    ate: s.ate
  });

  if (!Rec.isSavable(built)) {
    if (announce) toast('Sitzung zu kurz zum Speichern (unter 1 Minute).');
    return;
  }

  const summary = formatTime(built.dur) + ' Min. · längste Ruhe ' + formatTime(built.bestQuiet) +
    ' · ' + built.fishEnd + ' von ' + built.fishMax + ' Fischen';

  if (!canSave(s.groupId)) {
    if (announce) toast('Sitzung beendet: ' + summary + ' (nicht gespeichert, keine Gruppe gewählt)');
    return;
  }
  if (announce) toast('Sitzung gespeichert: ' + summary);

  // Pokale, die erst jetzt feststehen (z. B. Fische am Ende), und Platin melden
  if (announce) {
    const prior = ((groups[s.groupId] || {}).aquarium || {}).records || {};
    const after = Rec.applySessionToRecords(prior, built);
    const afterTiers = Rec.trophyTiers(after);
    const beforeTiers = Rec.trophyTiers(prior);
    Object.keys(afterTiers).forEach(id => {
      if (afterTiers[id] > Math.max(beforeTiers[id], s.announced.tiers[id] || 0)) trophyToast(id, afterTiers[id]);
    });
    if (!s.announced.platin && Rec.isPlatin(after) && !Rec.isPlatin(prior)) platinToast();
  }

  persistSession(s.groupId, built);
}

async function persistSession(groupId, built) {
  const base = 'groups/' + groupId + '/aquarium/';
  try {
    const prior = ((groups[groupId] || {}).aquarium || {}).records || null;
    built.badges = Rec.sessionBadges(prior, built);
    await set(ref(db, base + 'sessions/s' + built.start), built);
    await runTransaction(ref(db, base + 'records'), cur => Rec.applySessionToRecords(cur, built));

    // Alte Sitzungen aufräumen
    const aquarium = (groups[groupId] || {}).aquarium;
    Rec.overflowKeys(aquarium).forEach(key => remove(ref(db, base + 'sessions/' + key)));

    if (groupId === activeGroupId) renderLogForActive();
  } catch (err) {
    console.error('Aquarium: Aufzeichnung konnte nicht gespeichert werden', err);
    setHint('Die Aufzeichnung konnte nicht gespeichert werden. Eventuell fehlt die Berechtigung für diese Gruppe.');
  }
}

// Wird von groups.js beim Wechsel der Gruppe aufgerufen
export function loadAquariumFromGroup(g) {
  endSession(false);              // laufende Sitzung gehört noch zur alten Gruppe
  // Ein Fisch pro Schüler: Standard ist die Anzahl der Namen in der Gruppe
  const names = ((g && g.names) || '').split('\n').map(n => n.trim()).filter(n => n.length > 0).length;
  if (names > 0) aquariumFishCount.value = clamp(names, 1, MAX_FISH);
  tank.reset(fishTarget());       // neue Klasse = frisches Becken
  startSession();                 // falls das Mikrofon noch läuft
  renderLogForActive();
}

function restartTank() {
  endSession(true);
  tank.reset(fishTarget());
  startSession();
}

// ---------- Mikrofon ----------

async function startMic() {
  if (micOn || micStarting) return;
  clearError();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError('Dieser Browser oder diese Verbindung erlaubt keinen Mikrofonzugriff. Die Seite muss über HTTPS geöffnet sein.');
    return;
  }

  micStarting = true;
  aquariumMicBtn.disabled = true;
  try {
    // Rauschunterdrückung und Auto-Pegel würden die Lautstärke verfälschen, deshalb aus
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    sampleBuf = new Float32Array(analyser.fftSize);
    source.connect(analyser); // bewusst NICHT mit audioCtx.destination verbunden

    stream.getAudioTracks().forEach(track => track.addEventListener('ended', stopMic));
    micOn = true;
    startSession();
    setHint('Tipp: Auf „Kalibrieren“ klicken, während die Klasse still ist. Dann passt sich die Grenze an den Raum an.');
  } catch (err) {
    stopMic();
    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
      showError('Der Mikrofonzugriff wurde blockiert. Erlaube ihn in der Adressleiste des Browsers und starte dann neu.');
    } else if (err && err.name === 'NotFoundError') {
      showError('Es wurde kein Mikrofon gefunden.');
    } else {
      showError('Das Mikrofon konnte nicht gestartet werden.');
    }
  } finally {
    micStarting = false;
    aquariumMicBtn.disabled = false;
    syncButtons();
  }
}

function stopMic() {
  endSession(!view.classList.contains('is-hidden'));
  if (stream) stream.getTracks().forEach(track => track.stop());
  if (audioCtx) audioCtx.close().catch(() => {});
  stream = null; audioCtx = null; analyser = null; sampleBuf = null;
  micOn = false;
  calibration = null;
  rawLevel = 0;
  syncButtons();
}

function syncButtons() {
  aquariumMicBtn.textContent = micOn ? '⏹ Mikrofon stoppen' : '🎤 Mikrofon starten';
  aquariumMicBtn.classList.toggle('is-active', micOn);
  aquariumCalibrateBtn.disabled = !micOn || !!calibration;
  if (!calibration) aquariumCalibrateBtn.textContent = 'Kalibrieren';
}

// ---------- Lautstärke ----------

// RMS -> dBFS -> 0..100 (ca. -70 dB = 0, -15 dB = 100)
function measureRaw() {
  analyser.getFloatTimeDomainData(sampleBuf);
  let sum = 0;
  for (let i = 0; i < sampleBuf.length; i++) sum += sampleBuf[i] * sampleBuf[i];
  const rms = Math.sqrt(sum / sampleBuf.length);
  const db = 20 * Math.log10(Math.max(rms, 1e-5));
  return clamp(((db + 70) / 55) * 100, 0, 100);
}

function updateLevel(dt) {
  if (analyser) {
    rawLevel = measureRaw();
    // Schnell hoch, langsam runter: einzelne Zwischenrufe zählen, Atempausen nicht sofort
    const k = rawLevel > level ? 1 - Math.exp(-dt * 18) : 1 - Math.exp(-dt * 2.5);
    level += (rawLevel - level) * k;
  } else {
    level += (0 - level) * (1 - Math.exp(-dt * 4));
  }
}

function runCalibration(dt) {
  if (!calibration) return;
  calibration.t += dt;
  calibration.sum += rawLevel;
  calibration.n++;
  const left = Math.max(0, Math.ceil(CALIBRATE_SECONDS - calibration.t));
  aquariumCalibrateBtn.textContent = 'Bitte leise … ' + left;

  if (calibration.t >= CALIBRATE_SECONDS) {
    const avg = calibration.sum / Math.max(1, calibration.n);
    threshold = clamp(Math.round(avg + 20), 20, 95);
    aquariumThreshold.value = threshold;
    calibration = null;
    syncButtons();
    positionMark();
    setHint('Kalibriert: Raumpegel ca. ' + Math.round(avg) + ', Grenze auf ' + threshold + ' gesetzt. Per Regler jederzeit änderbar.');
  }
}

function startCalibration() {
  if (!micOn || calibration) return;
  clearError();
  calibration = { t: 0, sum: 0, n: 0 };
  syncButtons();
}

// ---------- Anzeige ----------

function positionMark() {
  aquariumMeterMark.style.left = threshold + '%';
}

function resizeCanvas() {
  const rect = aquariumCanvas.getBoundingClientRect();
  if (rect.width === 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.width * (WORLD_H / WORLD_W) * dpr);
  if (aquariumCanvas.width !== w || aquariumCanvas.height !== h) {
    aquariumCanvas.width = w;
    aquariumCanvas.height = h;
  }
}

function moodNow() {
  if (tank.fish.length === 0) return 'empty';
  if (tank.shark.state === 'hunt') return tank.calmT > 0.3 ? 'hesitate' : 'hunt';
  if (tank.shark.state === 'leave') return 'leave';
  if (!micOn) return 'idle';
  if (calibration) return 'calibrating';
  if (level > threshold) return 'loud';
  if (tank.tension > 0.45) return 'warn';
  return 'calm';
}

const MOOD_TEXT = {
  idle: 'Mikrofon starten, damit der Hai mithören kann',
  calibrating: 'Kurz still sein, der Raum wird gemessen …',
  calm: 'Schön ruhig. Die Fische sind entspannt 🐠',
  warn: 'Psst … der Hai wird aufmerksam 🦈',
  loud: 'Zu laut! Der Hai hat Hunger …',
  hunt: 'Der Hai greift an! Jetzt leise sein!',
  hesitate: 'Der Hai zögert … bleibt leise!',
  leave: 'Der Hai zieht ab 🌊',
  empty: 'Alle Fische sind weg. Neu starten?'
};

function updateHud() {
  const mood = moodNow();
  if (mood !== lastMood) {
    lastMood = mood;
    aquariumStatus.textContent = MOOD_TEXT[mood];
    aquariumStage.dataset.mood = mood;
  }
  const fishText = '🐠 ' + tank.fish.length + ' / ' + tank.maxFish;
  if (fishText !== lastFishText) { lastFishText = fishText; aquariumFishInfo.textContent = fishText; }

  const recordBest = Math.max(currentRecords().bestQuiet || 0, tank.stats.bestQuiet);
  const bestText = '🤫 Ruhe-Serie ' + formatTime(tank.stats.quietStreak) +
    (recordBest > 0 ? '  ·  🏆 ' + formatTime(recordBest) : '');
  if (bestText !== lastBestText) { lastBestText = bestText; aquariumBest.textContent = bestText; }

  aquariumMeterFill.style.width = clamp(level, 0, 100) + '%';
  aquariumMeterFill.dataset.state = level > threshold ? 'loud' : level > threshold * 0.8 ? 'warn' : 'ok';
}

function frame(now) {
  rafId = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
  lastFrame = now;

  updateLevel(dt);
  runCalibration(dt);
  tickSession(dt);
  tank.update(dt, { level, threshold, micOn, paused: !!calibration });

  resizeCanvas();
  const sx = aquariumCanvas.width / WORLD_W;
  const sy = aquariumCanvas.height / WORLD_H;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  tank.draw(ctx);
  updateHud();
}

function startLoop() {
  if (rafId !== null) return;
  lastFrame = performance.now();
  rafId = requestAnimationFrame(frame);
}

function stopLoop() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
}

// ---------- Vollbild ----------

function isFullscreen() {
  return document.fullscreenElement === aquariumStage || document.webkitFullscreenElement === aquariumStage;
}

function toggleFullscreen() {
  if (isFullscreen()) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    const req = aquariumStage.requestFullscreen || aquariumStage.webkitRequestFullscreen;
    if (req) req.call(aquariumStage);
  }
}

function syncFullscreenButton() {
  aquariumFullscreenBtn.textContent = isFullscreen() ? '✕ Vollbild beenden' : '⛶ Vollbild';
}

// ---------- Sichtbarkeit: Mikrofon nur an, solange die Ansicht offen ist ----------

function syncVisibility() {
  if (view.classList.contains('is-hidden')) {
    stopLoop();
    if (micOn) {
      stopMic();
      setHint('Das Mikrofon wurde beim Verlassen der Ansicht ausgeschaltet.');
    }
    if (isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    startLoop();
    renderLogForActive();
  }
}

// ---------- Verdrahtung ----------

aquariumMicBtn.addEventListener('click', () => { if (micOn) stopMic(); else startMic(); });
aquariumCalibrateBtn.addEventListener('click', startCalibration);
aquariumSharkBtn.addEventListener('click', () => tank.callShark());
aquariumResetBtn.addEventListener('click', restartTank);
aquariumFullscreenBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', syncFullscreenButton);
document.addEventListener('webkitfullscreenchange', syncFullscreenButton);
if (!aquariumStage.requestFullscreen && !aquariumStage.webkitRequestFullscreen) aquariumFullscreenBtn.hidden = true;

aquariumThreshold.addEventListener('input', () => {
  threshold = parseInt(aquariumThreshold.value, 10) || DEFAULT_THRESHOLD;
  positionMark();
});

aquariumClearLogBtn.addEventListener('click', () => {
  const g = currentGroup();
  if (!g || !canSave(activeGroupId)) return;
  if (!window.confirm('Alle Pokale und Aufzeichnungen der Gruppe ' + groupLabel() + ' löschen?')) return;
  remove(ref(db, 'groups/' + activeGroupId + '/aquarium'))
    .then(() => renderLogForActive())
    .catch(() => setHint('Zurücksetzen war nicht möglich.'));
});

aquariumRespawn.addEventListener('change', () => { tank.respawn = aquariumRespawn.checked; });

function applyFishCount(next) {
  aquariumFishCount.value = clamp(next, 1, MAX_FISH);
  restartTank();
}
aquariumFishDecrease.addEventListener('click', () => applyFishCount(fishTarget() - 1));
aquariumFishIncrease.addEventListener('click', () => applyFishCount(fishTarget() + 1));
aquariumFishCount.addEventListener('change', () => applyFishCount(fishTarget()));

new MutationObserver(syncVisibility).observe(view, { attributes: true, attributeFilter: ['class'] });

// Beim Verlassen der Seite das Mikrofon sicher freigeben
window.addEventListener('pagehide', stopMic);

threshold = parseInt(aquariumThreshold.value, 10) || DEFAULT_THRESHOLD;
tank.respawn = aquariumRespawn.checked;
tank.reset(fishTarget());
positionMark();
syncButtons();
renderLog(null); // leer; echte Daten kommen über loadAquariumFromGroup()
syncVisibility();
