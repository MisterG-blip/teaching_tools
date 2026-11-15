// ============================================================================
// MODULE: Grades (Noten würfeln)
// PURPOSE: Reine Spaßfunktion. Jede Person bekommt eine zufällige Note (1–6,
//          optional mit + und −) und einen aus Bausteinen zusammengewürfelten
//          Kommentar. Nichts davon wird gespeichert.
// ============================================================================

import { getNames } from './utils.js';
import { prefersReducedMotion } from './draw-animation.js';
import {
  namesEl, gradesPlusMinus, gradesComments, gradesExcuses, gradesError, gradesBtn, gradesResults
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
  "{n} bringt Schwung in jede Stuhlreihe.",
  "{n} balanciert Geo-Dreiecke auf der Nasenspitze wie ein Seiltänzer.",
  "{n} glänzt mit profunden Kenntnissen über das Innenleben von Füllfederhaltern.",
  "{n} öffnet den Schulranzen mit der Dramatik eines Theaterschauspielers.",
  "{n} hat die exakte Physik des perfekten Papierschiffchens gemeistert.",
  "{n} bringt den Klebestift so akkurat auf das Papier, dass es Kunst ist.",
  "{n} zeigt heroischen Körpereinsatz beim Aufheben eines heruntergefallenen Stifts.",
  "{n} blättert im Buch mit einer so sanften Note, dass kein Blatt zerreißt.",
  "{n} hält den Rekord im unsichtbaren Kaugummikauen ohne Lehrkraft-Alarm.",
  "{n} könnte einem Taschenrechner das Kopfrechnen beibringen.",
  "{n} beherrscht das kunstvolle Umblättern auf höchstem Niveau.",
  "{n} hat mehr Durchblick als eine frisch geputzte Fensterscheibe.",
  "{n} erkennt Hausaufgaben schon am Geräusch des Schulranzens.",
  "{n} könnte sogar dem Kopierer noch etwas beibringen.",
  "{n} pflegt eine beneidenswerte Beziehung zum Geodreieck.",
  "{n} bringt selbst komplizierte Brüche zum Lächeln.",
  "{n} hat die seltene Gabe, genau dann aufzuwachen, wenn es klingelt.",
  "{n} könnte beim Rückwärtszählen olympisches Gold gewinnen.",
  "{n} arbeitet so konzentriert, dass sogar die Uhr langsamer tickt."
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
  "Der Würfel vermutet, dass der Spitzer heimlich Bleistifte frisst.",
  "Das Geodreieck ist kein Bumerang und sollte nicht geworfen werden.",
  "Bitte das Heft vor dem Abgeben vom Kleber befreien, der Würfel klebt fest.",
  "Der Taschenrechner rechnet zwar schnell, plappert aber zu viel.",
  "Die Stuhllehne ist keine Hängematte – auch wenn sie gemütlich aussieht.",
  "Das Kunstwerk auf dem Handrücken war zwar schick, gehört aber aufs Papier.",
  "Ein Bleistift gilt erst dann als verloren, wenn er im Paralleluniversum landet.",
  "Die Buchseite wurde liebevoll umgeknickt – der Würfel weint leise.",
  "Der Klebestift gehört aufs Papier, nicht an den Nachbarmenschen.",
  "Der Würfel empfiehlt, gelegentlich auch die Aufgabenstellung zu lesen.",
  "Das Heft ist kein Tagebuch. Zumindest nicht ausschließlich.",
  "Die Mathematik hat angerufen. Sie möchte ihre Zahlen zurück.",
  "Bitte nicht versuchen, die Lösung durch Anstarren zu verändern.",
  "Der Taschenrechner darf auch mal Pause machen, er hat heute schon genug gerechnet.",
  "Der Würfel vermutet eine geheime Zusammenarbeit mit dem Zufall.",
  "Die Anzahl der Fragezeichen im Heft übersteigt die Anzahl der Antworten.",
  "Bitte nicht mit dem Geodreieck telefonieren. Es hat keinen Empfang.",
  "Der Würfel hat festgestellt: Auch Papier kann geduldig sein.",
  "Die Rechenzeichen bitte nicht nach persönlicher Sympathie auswählen."
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
  "Der Würfel sagt: Weiter so, die Tafel winkt zurück.",
  "Prognose: Der nächste Stift hält exakt drei Tage.",
  "Empfehlung: Nach der Stunde dringend eine Runde Kaugummi kauen.",
  "Nächstes Ziel: Einen fliegenden Papierflieger im geschlossenen Raum fangen.",
  "Tipp: Die Glückssträhne hält an, solange der Radiergummi intakt bleibt.",
  "Aussicht: Die Tafel guckt heute besonders freundlich.",
  "Der Würfel rät zu einer kurzen Kaffeepause für das Gehirn (Kakao tut's auch).",
  "Vor dem nächsten Test laut „Wumm!“ rufen bringt temporäre Superkräfte.",
  "Nächster Meilenstein: Einen ganzen Schultag ohne verschwundenen Stift überstehen.",
  "Prognose: Die Zahlen werden sich irgendwann freiwillig ergeben.",
  "Zukunftsziel: Einmal eine Aufgabe lösen, ohne den Würfel zu befragen.",
  "Der Würfel sieht großes Potenzial. Leider hat er keine Brille dabei.",
  "Empfehlung: Eine Karriere als professioneller Aufgabenüberspringer prüfen.",
  "Die Sterne stehen günstig. Der Taschenrechner eher nicht.",
  "Nächstes Ziel: Die Klammern verstehen, bevor sie zurückschlagen.",
  "Der Würfel sagt eine glänzende Zukunft voraus. Wahrscheinlich wegen des Glitzerstifts.",
  "In fünf Jahren wird diese Note entweder Geschichte oder ein ungelöstes Rätsel sein.",
  "Die Zukunft ist ungewiss. Aber immerhin ist sie nicht benotet.",
  "Der Würfel empfiehlt: Niemals den Glauben an die eigenen Fähigkeiten verlieren. Oder den Würfel."
];

// Ausreden für schlechte Noten: Die Schuld liegt immer beim Würfel oder bei den Umständen,
// nie beim Kind. Der Würfel „spricht“, deshalb steht im Satz kein Name.
const EXCUSES = [
  "Gegenwind im Klassenzimmer.",
  "Der Würfel wurde vor dem Wurf von einem Keks abgelenkt.",
  "Merkur stand rückwärts, da zählt die Note nicht.",
  "Die Zahlen waren heute alle im Streik.",
  "Der Würfel hatte Schluckauf beim Rollen.",
  "Auf dem Tisch lag ein Krümel, der den Wurf gebremst hat.",
  "Der Würfel hat sich beim Wurf verzählt. Er kann nur bis sechs.",
  "Das Licht stand ungünstig, der Würfel war geblendet.",
  "Der Würfel hat heute Morgen den falschen Fuß zuerst aus dem Bett gesetzt.",
  "Ein Papierflieger ist mitten im Wurf dazwischengeflogen.",
  "Der Würfel hat vergessen, vorher zu frühstücken.",
  "Eine Schwarze-Katzen-Wolke zog über die Schule.",
  "Der Würfel hatte Lampenfieber vor so viel Publikum.",
  "Die Tafel hat im falschen Moment geknarzt.",
  "Der Würfel ist heute auf der Seite der Pechvögel gelandet.",
  "Der Würfel hat nicht aufgepasst, er hat zur Pausenklingel geschielt.",
  "Eine Fliege hat sich genau im Wurf auf die Sechs gesetzt.",
  "Der Würfel war noch müde vom Wochenende.",
  "Die Schwerkraft hatte heute einen schlechten Tag.",
  "Der Würfel wurde zu schnell geschüttelt. Das ist nicht gut für seinen Charakter."
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

// Ab einer 5 immer, bei einer 4 nur manchmal
function needsExcuse(g) {
  if (g.base >= 5) return true;
  if (g.base === 4) return Math.random() < 0.5;
  return false;
}

function formatAverage(x) {
  return x.toFixed(1).replace('.', ',');
}

// ---------- Zustand ----------

let entries = [];   // [{ name, grade, comment, excuse, withExcuses, el, rolling }]
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
  entry.excuse = (entry.withExcuses && needsExcuse(entry.grade)) ? pick(EXCUSES) : '';
  const excuseEl = entry.el.querySelector('.grade-excuse');
  if (excuseEl) excuseEl.textContent = entry.excuse;
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
  const withExcuses = gradesExcuses.checked;

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
    if (withExcuses) {
      const x = document.createElement('p');
      x.className = 'grade-excuse';
      body.appendChild(x);
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

    const entry = { name, grade: null, comment: '', excuse: '', withExcuses, el: li, rolling: true };
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
    let line = e.name + ': ' + gradeLabel(e.grade);
    if (e.comment) line += ' – ' + e.comment;
    if (e.excuse) line += ' Ausrede des Würfels: ' + e.excuse;
    return line;
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
