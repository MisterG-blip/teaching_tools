// ============================================================================
// MODULE: Draw-Animation
// PURPOSE: Zeigt beim Auslosen ein Boot, aus dem die Namen in kleinen Salven
//          wie aus einer Fontäne nach oben sprudeln, groß werden und dann in
//          ihre Gruppenkarte fliegen.
//
// Benutzung (siehe draw.js):
//   const anim = playDrawAnimation({ stage, entries, onDone });
//   anim.skip();    // sofort alles anzeigen
//   anim.cancel();  // abbrechen (z. B. bei neuem Auslosen)
//
// entries: [{ el: <li.tag>, color: 'css-farbe' }]  – el ist das echte Namensschild
//          in der Gruppenkarte (unsichtbar, aber mit festem Platz im Layout).
// ============================================================================

const TOTAL_TARGET_S = 11;   // Ziel: letzter Name landet nach ca. 11 s (bei vielen Namen)
const FLIGHT_S = 2.2;        // Flugzeit eines einzelnen Namens
const WITHIN_SALVO_S = 0.28; // Abstand zwischen Namen innerhalb einer Salve
const FIRST_DELAY_S = 0.8;   // Boot fährt ein, dann geht's los
const MIN_GAP_S = 0.45;
const MAX_GAP_S = 2.2;

export function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function rand(min, max) { return min + Math.random() * (max - min); }
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Rechteck eines Elements in Dokument-Koordinaten (unabhängig vom Scrollen)
function docRect(el) {
  const r = el.getBoundingClientRect();
  return {
    left: r.left + window.scrollX,
    top: r.top + window.scrollY,
    width: r.width,
    height: r.height
  };
}

// Teilt n Namen in Salven von 3–4 Namen (bei sehr vielen Namen etwas größer)
function planSalvos(n) {
  const max = Math.max(4, Math.ceil(n / 9));
  const min = Math.max(3, max - 1);
  const salvos = [];
  let left = n;
  while (left > 0) {
    let size = Math.round(rand(min, max));
    if (left - size > 0 && left - size < min) size = left; // keine winzige Rest-Salve
    size = Math.min(size, left);
    salvos.push(size);
    left -= size;
  }
  return salvos;
}

export function playDrawAnimation({ stage, entries, onDone }) {
  const wrap = stage.querySelector('.boat-wrap');
  const kick = stage.querySelector('.boat-kick');
  const timers = [];
  const running = new Set();   // laufende Animationen
  const clones = new Set();    // fliegende Namens-Karten und Tröpfchen
  let finished = false;
  let landed = 0;
  let watchdog = null;

  function alive() {
    return stage.isConnected && stage.offsetParent !== null;
  }

  function clearAll() {
    timers.forEach(clearTimeout);
    timers.length = 0;
    clearInterval(watchdog);
    running.forEach(a => { try { a.cancel(); } catch (e) { /* egal */ } });
    running.clear();
    clones.forEach(c => c.remove());
    clones.clear();
  }

  function revealInstantly() {
    entries.forEach(({ el }) => {
      el.classList.remove('is-pending');
      el.classList.add('is-instant');
    });
  }

  function removeStage() {
    stage.remove();
  }

  function track(anim) {
    running.add(anim);
    anim.finished.then(() => running.delete(anim)).catch(() => running.delete(anim));
    return anim;
  }

  // ---------- Fontänen-Tröpfchen ----------
  function splash(sx, sy) {
    for (let i = 0; i < 7; i++) {
      const d = document.createElement('span');
      d.className = 'splash-drop';
      d.setAttribute('aria-hidden', 'true');
      const size = rand(4, 8);
      d.style.width = d.style.height = size + 'px';
      document.body.appendChild(d);
      clones.add(d);
      const dx = rand(-70, 70);
      const up = rand(40, 90);
      const a = track(d.animate([
        { transform: `translate(${sx}px, ${sy}px)`, opacity: 0.9 },
        { transform: `translate(${sx + dx * 0.6}px, ${sy - up}px)`, opacity: 0.9, offset: 0.45 },
        { transform: `translate(${sx + dx}px, ${sy + 10}px)`, opacity: 0 }
      ], { duration: rand(550, 800), easing: 'ease-out', fill: 'forwards' }));
      a.finished.then(() => { d.remove(); clones.delete(d); }).catch(() => {});
    }
  }

  // ---------- Ein Name fliegt ----------
  function launch(entry, slot, slots) {
    if (finished) return;
    if (!alive()) { cancel(); return; }

    const boatRect = docRect(wrap);
    const sx = boatRect.left + boatRect.width * 0.47; // Fontänen-Austritt: oben am Boot
    const sy = boatRect.top + boatRect.height * 0.2;

    const target = docRect(entry.el);
    const w = target.width;
    const h = target.height;

    const clone = document.createElement('div');
    clone.className = 'flying-tag';
    clone.setAttribute('aria-hidden', 'true');
    clone.textContent = entry.el.textContent;
    clone.style.borderColor = entry.color;
    clone.style.opacity = '0';
    clone.style.width = 'auto';
    clone.style.whiteSpace = 'nowrap';
    document.body.appendChild(clone);
    clones.add(clone);
    // Im Flug kompaktes Namensschild (natürliche Breite), beim Landen auf Spaltenbreite wachsen
    const natW = Math.min(w, clone.offsetWidth);

    const viewW = document.documentElement.clientWidth;
    const scaleApex = 1.4;
    const fan = Math.min(boatRect.width * 1.45, viewW * 0.3);
    // Slot verteilt die Namen einer Salve fächerförmig, mit etwas Zufall
    const frac = slots > 1 ? (slot / (slots - 1)) * 2 - 1 : 0;
    let ax = sx + frac * fan + rand(-12, 12);
    const half = (natW * scaleApex) / 2 + 8;
    ax = Math.max(half + window.scrollX, Math.min(window.scrollX + viewW - half, ax));
    const rise = boatRect.width * (slot % 2 === 0 ? rand(0.55, 0.7) : rand(0.8, 0.95));
    const ay = sy - rise;

    const tx = target.left + w / 2;
    const ty = target.top + h / 2;
    const rot = rand(-7, 7);

    const T = (cx, cy, s, r, ww) => `translate(${cx - ww / 2}px, ${cy - h / 2}px) scale(${s}) rotate(${r}deg)`;


    splash(sx, sy);
    kickBoat();

    const anim = track(clone.animate([
      { transform: T(sx, sy, 0.15, -rot, natW), width: natW + 'px', opacity: 0, offset: 0, easing: 'cubic-bezier(.12,.8,.3,1)' },
      { transform: T(ax, ay, scaleApex, rot, natW), width: natW + 'px', opacity: 1, offset: 0.26, easing: 'ease-in-out' },
      { transform: T(ax, ay - 10, scaleApex * 1.04, rot * 0.6, natW), width: natW + 'px', opacity: 1, offset: 0.46, easing: 'cubic-bezier(.45,0,.8,.45)' },
      { transform: T(tx, ty, 1, 0, w), width: w + 'px', opacity: 1, offset: 1 }
    ], { duration: FLIGHT_S * 1000, fill: 'forwards' }));

    anim.finished.then(() => {
      clone.remove();
      clones.delete(clone);
      if (finished) return;
      entry.el.classList.remove('is-pending');
      entry.el.classList.add('is-landed');
      landed++;
      if (landed >= entries.length) finish();
    }).catch(() => { /* abgebrochen */ });
  }

  // kleiner Rückstoß des Bootes bei jedem Schuss
  function kickBoat() {
    if (!kick) return;
    track(kick.animate([
      { transform: 'scale(1, 1)' },
      { transform: 'scale(1.04, 0.95)', offset: 0.3 },
      { transform: 'scale(1, 1)' }
    ], { duration: 260, easing: 'ease-out' }));
  }

  // ---------- Abschluss: Boot fährt davon ----------
  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(watchdog);
    const out = track(wrap.animate([
      { transform: 'translateX(0)', opacity: 1 },
      { transform: 'translateX(70vw)', opacity: 0 }
    ], { duration: 1100, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' }));
    out.finished.then(() => {
      const startH = stage.offsetHeight;
      stage.style.height = startH + 'px';
      stage.style.transition = 'height .45s ease, padding .45s ease';
      requestAnimationFrame(() => {
        stage.style.height = '0px';
        stage.style.paddingTop = '0px';
      });
      setTimeout(() => { removeStage(); if (onDone) onDone(); }, 500);
    }).catch(() => {});
  }

  // ---------- Steuerung ----------
  function skip() {
    if (finished && !stage.isConnected) return;
    finished = true;
    clearAll();
    revealInstantly();
    removeStage();
    if (onDone) onDone();
  }

  function cancel() {
    finished = true;
    clearAll();
    removeStage();
  }

  // ---------- Ablauf planen ----------
  // Zufällige Reihenfolge über alle Gruppen, aber innerhalb jeder Gruppe von oben nach unten,
  // damit sich die Karten ohne Lücken füllen.
  const queues = {};
  entries.forEach(e => { (queues[e.group] = queues[e.group] || []).push(e); });
  const order = shuffled(entries.map(e => e.group)).map(g => queues[g].shift());
  const salvos = planSalvos(order.length);
  const gap = salvos.length > 1
    ? Math.max(MIN_GAP_S, Math.min(MAX_GAP_S,
        (TOTAL_TARGET_S - FLIGHT_S - WITHIN_SALVO_S * 3) / (salvos.length - 1)))
    : 0;

  // Boot fährt von links ein
  track(wrap.animate([
    { transform: 'translateX(-60vw)', opacity: 0 },
    { transform: 'translateX(0)', opacity: 1 }
  ], { duration: 800, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' }));

  let idx = 0;
  salvos.forEach((size, si) => {
    for (let k = 0; k < size; k++) {
      const entry = order[idx++];
      const delay = FIRST_DELAY_S + si * gap + k * WITHIN_SALVO_S;
      const slotOrder = k; // Reihenfolge innerhalb der Salve = Fächer-Position (gemischt unten)
      timers.push(setTimeout(() => launch(entry, fanSlot(slotOrder, size, si), size), delay * 1000));
    }
  });

  // Fächer-Positionen pro Salve einmal mischen, damit nicht immer links→rechts geflogen wird
  const slotCache = {};
  function fanSlot(k, size, si) {
    if (!slotCache[si]) slotCache[si] = shuffled(Array.from({ length: size }, (_, i) => i));
    return slotCache[si][k];
  }

  // Wächter: Ansicht gewechselt / Ergebnisbereich geleert -> sauber abbrechen
  watchdog = setInterval(() => {
    if (!finished && !alive()) cancel();
  }, 250);

  return { skip, cancel };
}
