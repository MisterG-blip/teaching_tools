// ============================================================================
// MODULE: Grades (Noten würfeln)
// PURPOSE: Reine Spaßfunktion. Jede Person bekommt eine zufällige Note (1–6,
//          optional mit + und −) und einen aus Bausteinen zusammengewürfelten
//          Kommentar. Nichts davon wird gespeichert.
// ============================================================================

import { getNames } from './utils.js';
import { prefersReducedMotion } from './draw-animation.js';
import {
  namesEl, gradesPlusMinus, gradesComments, gradesError, gradesBtn, gradesResults
} from './dom.js';

// Farben pro Note: bewusst keine "Warnfarben", damit sich niemand bloßgestellt fühlt
const GRADE_COLORS = {
  1: 'var(--pencil-3)',
  2: 'var(--pencil-2)',
  3: 'var(--pencil-4)',
  4: 'var(--pencil-5)',
  5: 'var(--pencil-1)',
  6: 'var(--pencil-6)'
};

// ---------- Kommentar-Bausteine (alles freundlich-albern, nichts Persönliches) ----------

const PRAISE = [
  "{n} spitzt Bleistifte mit olympischer Präzision.",
  "{n} hat das Pausenbrot-Management fest im Griff.",
  "{n} meldet sich mit der Eleganz einer Balletttänzerin.",
  "{n} schreibt so schnell, dass der Stift Funken sprüht.",
  "{n} ist offizieller Weltmeister im Federmäppchen-Aufräumen.",
  "{n} lächelt so, dass sogar die Tafel strahlt.",
  "{n} findet verlorene Radiergummis im Blindflug.",
  "{n} lässt Stifte kreiseln wie ein Profi-Jongleur.",
  "{n} sortiert Gummibärchen mit beeindruckender Ausdauer.",
  "{n} bringt Schwung in jede Stuhlreihe."
];

const REMARKS = [
  "Beim Rechnen bitte nicht zu laut mit den Gedanken klappern.",
  "Der Radiergummi darf nicht länger als Rennauto eingesetzt werden.",
  "Das Lineal ist kein Schwert, die Technik war aber gut.",
  "Der Würfel bittet um mehr Applaus für sich selbst.",
  "Gelegentliches Tagträumen wurde vom Würfel genehmigt.",
  "Bitte den Klassenhamster nicht mit Hausaufgaben füttern.",
  "Der Würfel hat leider Kekskrümel im Heft gefunden.",
  "Die Tischplatte bitte nicht mit Kunstwerken verzieren (außer sie sind gut).",
  "Wasserflaschen stehen lieber aufrecht, sagt der Würfel.",
  "Der Würfel vermutet, dass der Spitzer heimlich Bleistifte frisst."
];

const OUTLOOKS = [
  "Prognose: In der nächsten Stunde wird alles noch besser. Oder gleich.",
  "Empfehlung: Mehr Kekse für die Lehrkraft.",
  "Nächstes Ziel: den Klassenhamster zum Schachspiel überreden.",
  "Tipp: Glückssocken tragen. Immer.",
  "Aussicht: Heiter bis wolkig, mit Chance auf Pausenkuchen.",
  "Der Würfel empfiehlt eine Runde Applaus für alle.",
  "Dreimal auf Holz klopfen, dann klappt’s auch mit dem Rest.",
  "Vor dem nächsten Test einmal tief durchatmen und „Würfel!“ rufen.",
  "Nächster Meilenstein: ein Stift, der nie wegrollt.",
  "Der Würfel sagt: Weiter so, die Tafel winkt zurück."
];

const SUMMARY_LINES = [
  { max: 2.0, text: 'Wahnsinn, der Würfel hat heute richtig gute Laune!' },
  { max: 3.0, text: 'Prächtig, der Würfel ist großzügig gestimmt.' },
  { max: 4.0, text: 'Solide Würfelleistung, nichts zu meckern.' },
  { max: 5.0, text: 'Der Würfel war heute etwas streng. Trostkekse für alle!' },
  { max: 99, text: 'Der Würfel hat schlecht geschlafen. Bitte nicht persönlich nehmen!' }
];

// ---------- Zufall ----------

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return min + Math.random() * (max - min); }

// mod: +1 = Plus, 0 = glatt, -1 = Minus. Die 6 gibt es nur glatt.
function rollGrade(withPlusMinus) {
  const base = 1 + Math.floor(Math.random() * 6);
  let mod = 0;
  if (withPlusMinus && base !== 6) mod = pick([-1, 0, 1]);
  return { base, mod };
}

function gradeLabel(g) {
  return String(g.base) + (g.mod > 0 ? '+' : g.mod < 0 ? '−' : '');
}

function gradeValue(g) {
  return g.base - g.mod * 0.33;
}

function buildComment(name) {
  return [pick(PRAISE).replace('{n}', name), pick(REMARKS), pick(OUTLOOKS)].join(' ');
}

function formatAverage(x) {
  return x.toFixed(1).replace('.', ',');
}

// ---------- Zustand ----------

let entries = [];   // [{ name, grade, comment, el, rolling }]
let runId = 0;      // erhöht sich bei jedem neuen Durchlauf, alte Timer brechen dann ab
let summaryEl = null;

function showError(msg) { gradesError.textContent = msg; gradesError.classList.add('show'); }
function clearError() { gradesError.classList.remove('show'); gradesError.textContent = ''; }

// ---------- Animation ----------

function burst(host, emojis) {
  const wrap = document.createElement('span');
  wrap.className = 'grade-burst';
  wrap.setAttribute('aria-hidden', 'true');
  const count = 7;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.textContent = pick(emojis);
    const angle = (Math.PI * 2 * i) / count + rand(-0.3, 0.3);
    const dist = rand(46, 78);
    p.style.setProperty('--dx', Math.round(Math.cos(angle) * dist) + 'px');
    p.style.setProperty('--dy', Math.round(Math.sin(angle) * dist - 10) + 'px');
    p.style.setProperty('--rot', Math.round(rand(-120, 120)) + 'deg');
    wrap.appendChild(p);
  }
  host.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1100);
}

function land(entry, animate) {
  const { el, grade } = entry;
  const badge = el.querySelector('.grade-badge');
  const label = gradeLabel(grade);
  badge.textContent = label;
  badge.setAttribute('aria-label', 'Note ' + label);
  el.style.setProperty('--grade-color', GRADE_COLORS[grade.base]);
  el.classList.remove('is-rolling');
  el.classList.add('is-landed');
  el.querySelector('.grade-reroll').disabled = false;
  entry.rolling = false;

  if (animate) {
    // Animation neu anstoßen, auch beim erneuten Würfeln derselben Karte
    el.classList.remove('is-pop');
    void el.offsetWidth;
    el.classList.add('is-pop');
    if (grade.base === 1) burst(badge, ['⭐', '✨', '🎉']);
    if (grade.base === 6) burst(badge, ['🍪', '🍪', '🍕']);
  }
  updateSummary();
}

// Lässt die Anzeige einer Karte durchlaufen und landet dann beim Endergebnis
function rollEntry(entry, withPlusMinus, delayMs, thisRun) {
  const animate = !prefersReducedMotion();
  entry.grade = rollGrade(withPlusMinus);
  entry.rolling = true;
  entry.el.classList.remove('is-landed', 'is-pop');
  entry.el.classList.add('is-rolling');
  entry.el.querySelector('.grade-reroll').disabled = true;
  updateSummary();

  if (!animate) { land(entry, false); return; }

  const badge = entry.el.querySelector('.grade-badge');
  const duration = 1100 + Math.random() * 700;

  setTimeout(() => {
    if (thisRun !== runId || !entry.el.isConnected) return;
    let elapsed = 0;
    let interval = 45;
    (function tick() {
      if (thisRun !== runId || !entry.el.isConnected) return;
      badge.textContent = gradeLabel(rollGrade(withPlusMinus));
      elapsed += interval;
      interval *= 1.13;
      if (elapsed < duration) setTimeout(tick, interval);
      else land(entry, true);
    })();
  }, delayMs);
}

function updateSummary() {
  if (!summaryEl) return;
  const done = entries.filter(e => !e.rolling);
  if (done.length < entries.length) {
    summaryEl.classList.remove('show');
    return;
  }
  const avg = done.reduce((sum, e) => sum + gradeValue(e.grade), 0) / done.length;
  const line = SUMMARY_LINES.find(l => avg < l.max) || SUMMARY_LINES[SUMMARY_LINES.length - 1];
  summaryEl.innerHTML = '';
  const big = document.createElement('strong');
  big.textContent = 'Würfel-Schnitt: Ø ' + formatAverage(avg);
  summaryEl.appendChild(big);
  summaryEl.appendChild(document.createTextNode(' – ' + line.text));
  summaryEl.classList.add('show');
}

// ---------- Rendering ----------

function render(names) {
  runId++;
  const thisRun = runId;
  const withPlusMinus = gradesPlusMinus.checked;
  const withComments = gradesComments.checked;

  gradesResults.innerHTML = '';
  entries = [];

  const head = document.createElement('div');
  head.className = 'results-head';
  head.innerHTML = `
    <h3>Die Würfel sind gefallen 🎲</h3>
    <div class="actions">
      <button type="button" class="btn btn-ghost" id="gradesCopyBtn">Ergebnis kopieren</button>
      <button type="button" class="btn btn-ghost" id="gradesAgainBtn">Alle neu würfeln</button>
    </div>
  `;
  gradesResults.appendChild(head);

  summaryEl = document.createElement('p');
  summaryEl.className = 'grades-summary';
  gradesResults.appendChild(summaryEl);

  const list = document.createElement('ul');
  list.className = 'grades-list';

  names.forEach(name => {
    const li = document.createElement('li');
    li.className = 'grade-card is-rolling';

    const body = document.createElement('div');
    body.className = 'grade-body';
    const nameEl = document.createElement('p');
    nameEl.className = 'grade-name';
    nameEl.textContent = name;
    body.appendChild(nameEl);
    if (withComments) {
      const c = document.createElement('p');
      c.className = 'grade-comment';
      body.appendChild(c);
    }
    li.appendChild(body);

    const badge = document.createElement('div');
    badge.className = 'grade-badge';
    badge.textContent = '?';
    li.appendChild(badge);

    const reroll = document.createElement('button');
    reroll.type = 'button';
    reroll.className = 'grade-reroll';
    reroll.title = 'Nur ' + name + ' neu würfeln';
    reroll.setAttribute('aria-label', 'Nur ' + name + ' neu würfeln');
    reroll.textContent = '🎲';
    li.appendChild(reroll);

    const entry = { name, grade: null, comment: '', el: li, rolling: true };
    entries.push(entry);
    list.appendChild(li);

    reroll.addEventListener('click', () => {
      if (entry.rolling) return;
      if (withComments) {
        entry.comment = buildComment(name);
        li.querySelector('.grade-comment').textContent = entry.comment;
      }
      rollEntry(entry, withPlusMinus, 0, runId);
    });
  });

  gradesResults.appendChild(list);

  // Kommentare vorab setzen (unsichtbar, damit die Kartenhöhe stabil bleibt)
  entries.forEach(entry => {
    if (withComments) {
      entry.comment = buildComment(entry.name);
      entry.el.querySelector('.grade-comment').textContent = entry.comment;
    }
  });

  // Karten starten leicht versetzt; bei großen Klassen enger getaktet
  const stagger = Math.min(140, 2200 / Math.max(1, entries.length));
  entries.forEach((entry, i) => rollEntry(entry, withPlusMinus, i * stagger, thisRun));

  document.getElementById('gradesAgainBtn').addEventListener('click', runGrades);
  document.getElementById('gradesCopyBtn').addEventListener('click', copyResults);
}

function copyResults() {
  const finished = entries.filter(e => e.grade);
  if (finished.length === 0) return;
  const lines = finished.map(e => {
    const base = e.name + ': ' + gradeLabel(e.grade);
    return e.comment ? base + ' – ' + e.comment : base;
  });
  const text = 'Spaßnoten vom Würfel 🎲 (nicht ernst gemeint)\n\n' + lines.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('gradesCopyBtn');
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Kopiert';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
}

function runGrades() {
  clearError();
  const names = getNames();
  if (names.length === 0) {
    showError('Erst Namen unter „Gruppen verwalten“ eintragen, dann kann gewürfelt werden.');
    return;
  }
  render(names);
  gradesResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

gradesBtn.addEventListener('click', runGrades);

// Bei Gruppenwechsel oder geänderten Namen ist ein altes Ergebnis veraltet
namesEl.addEventListener('input', () => {
  runId++;
  entries = [];
  summaryEl = null;
  gradesResults.innerHTML = '';
  clearError();
});
