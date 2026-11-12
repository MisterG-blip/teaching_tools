// ============================================================================
// MODULE: Jigsaw (Gruppenpuzzle)
// PURPOSE: Namen zufällig in Stammgruppen einteilen und danach so in
//          Expertengruppen mischen, dass aus jeder Stammgruppe in jeder
//          Expertengruppe mindestens eine Person sitzt.
//
// Ablauf der Methode:
//   1. Stammgruppen (A, B, C ...) – jede Person bekommt eine Expertennummer.
//   2. Expertengruppen (1, 2, 3 ...) – alle mit derselben Nummer treffen sich
//      und erarbeiten ihr Thema.
//   3. Zurück in die Stammgruppe und das Thema den anderen erklären.
// ============================================================================

import { getNames, shuffle } from './utils.js';
import {
  namesEl,
  jigsawHomeCount, jigsawHomeDecrease, jigsawHomeIncrease,
  jigsawExpertCount, jigsawExpertDecrease, jigsawExpertIncrease,
  jigsawHint, jigsawError, jigsawBtn, jigsawResults
} from './dom.js';

const pencilColors = ['var(--pencil-1)', 'var(--pencil-2)', 'var(--pencil-3)', 'var(--pencil-4)', 'var(--pencil-5)', 'var(--pencil-6)'];
let lastPuzzle = null;

// ---------- Helfer ----------

// 0 -> A, 1 -> B, ... 25 -> Z, 26 -> AA ...
function homeLabel(i) {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function readCount(input) {
  const v = parseInt(input.value, 10);
  return Number.isFinite(v) ? v : 0;
}

function bindStepper(input, decBtn, incBtn) {
  decBtn.addEventListener('click', () => {
    input.value = Math.max(2, readCount(input) - 1);
    updateHint();
  });
  incBtn.addEventListener('click', () => {
    input.value = readCount(input) + 1;
    updateHint();
  });
  input.addEventListener('input', updateHint);
}

function range(min, max) {
  return min === max ? String(min) : min + '–' + max;
}

function showError(msg) { jigsawError.textContent = msg; jigsawError.classList.add('show'); }
function clearError() { jigsawError.classList.remove('show'); jigsawError.textContent = ''; }

// ---------- Kernlogik ----------

/**
 * Teilt die Namen auf S Stammgruppen auf und weist jeder Person eine
 * Expertengruppe (0 .. E-1) zu.
 *
 * Garantien (sofern jede Stammgruppe mindestens E Personen hat):
 *  - Innerhalb einer Stammgruppe kommt jede Expertengruppe vor, bevor sich
 *    eine wiederholt.
 *  - Überzählige Personen gehen immer in die aktuell kleinste Expertengruppe,
 *    damit die Expertengruppen höchstens 1 Person Unterschied haben.
 */
function buildPuzzle(names, S, E) {
  const people = shuffle(names);
  const homes = Array.from({ length: S }, () => []);
  people.forEach((name, i) => homes[i % S].push(name));

  const expertTotals = new Array(E).fill(0);
  const homeGroups = [];
  const expertGroups = Array.from({ length: E }, () => []);

  homes.forEach((members, hi) => {
    const perHome = new Array(E).fill(0);
    const rows = [];

    members.forEach(name => {
      // Kandidaten: weniger oft in dieser Stammgruppe, dann kleinere Expertengruppe
      let best = [];
      let bestKey = null;
      for (let e = 0; e < E; e++) {
        const key = perHome[e] * 10000 + expertTotals[e];
        if (bestKey === null || key < bestKey) { bestKey = key; best = [e]; }
        else if (key === bestKey) best.push(e);
      }
      const e = best[Math.floor(Math.random() * best.length)];
      perHome[e]++;
      expertTotals[e]++;
      rows.push({ name, expert: e });
      expertGroups[e].push({ name, home: hi });
    });

    rows.sort((a, b) => a.expert - b.expert);
    homeGroups.push(rows);
  });

  expertGroups.forEach(group => group.sort((a, b) => a.home - b.home));
  return { homeGroups, expertGroups };
}

// ---------- Hinweis / Prüfung ----------

function checkInput(names, S, E) {
  if (names.length === 0) return 'Erst Namen unter „Gruppen verwalten“ eintragen.';
  if (S < 2) return 'Es braucht mindestens 2 Stammgruppen.';
  if (E < 2) return 'Es braucht mindestens 2 Expertengruppen.';
  const needed = S * E;
  if (names.length < needed) {
    return 'Zu wenige Namen: Bei ' + S + ' Stammgruppen und ' + E + ' Expertengruppen werden mindestens ' +
      needed + ' Namen gebraucht, damit in jeder Expertengruppe jede Stammgruppe vertreten ist. Es sind ' +
      names.length + ' eingetragen.';
  }
  return null;
}

function updateHint() {
  const n = getNames().length;
  const S = readCount(jigsawHomeCount);
  const E = readCount(jigsawExpertCount);

  if (n === 0) { jigsawHint.textContent = 'Noch keine Namen eingetragen.'; return; }
  if (S < 2 || E < 2) { jigsawHint.textContent = n + ' Namen. Je mindestens 2 Stamm- und Expertengruppen wählen.'; return; }

  const homeMin = Math.floor(n / S), homeMax = Math.ceil(n / S);
  const expMin = Math.floor(n / E), expMax = Math.ceil(n / E);
  let text = n + ' Namen: ' + S + ' Stammgruppen mit je ' + range(homeMin, homeMax) +
    ' Personen, ' + E + ' Expertengruppen mit je ' + range(expMin, expMax) + ' Personen.';
  if (n < S * E) text += ' Zu wenig Namen: Es braucht mindestens ' + (S * E) + '.';
  jigsawHint.textContent = text;
}

// ---------- Anzeige ----------

function makeTag(name, pillText, pillColor, delay) {
  const li = document.createElement('li');
  li.className = 'tag has-pill';
  li.style.setProperty('--delay', delay + 's');
  li.style.color = 'var(--ink)';

  const label = document.createElement('span');
  label.textContent = name;
  li.appendChild(label);

  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.style.background = pillColor;
  pill.textContent = pillText;
  li.appendChild(pill);
  return li;
}

function makeCard(titleText, count, color, isExpert) {
  const card = document.createElement('div');
  card.className = 'result-group' + (isExpert ? ' is-expert' : '');
  card.style.color = color;

  const title = document.createElement('p');
  title.className = 'result-group-title';
  title.textContent = titleText;
  const small = document.createElement('small');
  small.textContent = count + (count === 1 ? ' Person' : ' Personen');
  title.appendChild(small);
  card.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'tag-list';
  card.appendChild(list);
  return { card, list };
}

function makeSection(title, sub) {
  const wrap = document.createElement('div');
  const h = document.createElement('h4');
  h.className = 'jigsaw-section-title';
  h.textContent = title;
  const p = document.createElement('p');
  p.className = 'jigsaw-section-sub';
  p.textContent = sub;
  wrap.appendChild(h);
  wrap.appendChild(p);
  return wrap;
}

function render(puzzle, S, E) {
  lastPuzzle = puzzle;
  jigsawResults.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'results-head';
  head.innerHTML = `
    <h3><span class="puzzle-wiggle">🧩</span> Gruppenpuzzle gemischt</h3>
    <div class="actions">
      <button type="button" class="btn btn-ghost" id="jigsawCopyBtn">Ergebnis kopieren</button>
      <button type="button" class="btn btn-ghost" id="jigsawReshuffleBtn">Nochmal mischen</button>
    </div>
  `;
  jigsawResults.appendChild(head);

  // --- Stammgruppen ---
  const homeSection = makeSection(
    'Stammgruppen (' + homeLabel(0) + (S > 1 ? '–' + homeLabel(S - 1) : '') + ')',
    'Hier startet jede Person. Die Zahl zeigt, in welche Expertengruppe es danach geht. Am Ende kehren alle hierher zurück.'
  );
  const homeGrid = document.createElement('div');
  homeGrid.className = 'groups-grid';
  puzzle.homeGroups.forEach((rows, hi) => {
    const { card, list } = makeCard('Stammgruppe ' + homeLabel(hi), rows.length, pencilColors[hi % pencilColors.length], false);
    rows.forEach((row, ri) => {
      list.appendChild(makeTag(row.name, 'Experte ' + (row.expert + 1), pencilColors[row.expert % pencilColors.length], hi * 0.05 + ri * 0.06));
    });
    homeGrid.appendChild(card);
  });
  homeSection.appendChild(homeGrid);
  jigsawResults.appendChild(homeSection);

  // --- Expertengruppen ---
  const expertSection = makeSection(
    'Expertengruppen (1–' + E + ')',
    'Hier wird das Thema erarbeitet. Das Kürzel zeigt, aus welcher Stammgruppe jemand kommt.'
  );
  const expertGrid = document.createElement('div');
  expertGrid.className = 'groups-grid';
  const baseDelay = S * 0.05 + 0.4;
  puzzle.expertGroups.forEach((rows, ei) => {
    const { card, list } = makeCard('Expertengruppe ' + (ei + 1), rows.length, pencilColors[ei % pencilColors.length], true);
    rows.forEach((row, ri) => {
      list.appendChild(makeTag(row.name, 'Stamm ' + homeLabel(row.home), pencilColors[row.home % pencilColors.length], baseDelay + ei * 0.05 + ri * 0.06));
    });
    expertGrid.appendChild(card);
  });
  expertSection.appendChild(expertGrid);
  jigsawResults.appendChild(expertSection);

  document.getElementById('jigsawReshuffleBtn').addEventListener('click', runPuzzle);
  document.getElementById('jigsawCopyBtn').addEventListener('click', copyResults);
}

function copyResults() {
  if (!lastPuzzle) return;
  const homeText = lastPuzzle.homeGroups.map((rows, hi) =>
    'Stammgruppe ' + homeLabel(hi) + ': ' + rows.map(r => r.name + ' (Experte ' + (r.expert + 1) + ')').join(', ')
  ).join('\n');
  const expertText = lastPuzzle.expertGroups.map((rows, ei) =>
    'Expertengruppe ' + (ei + 1) + ': ' + rows.map(r => r.name + ' (Stamm ' + homeLabel(r.home) + ')').join(', ')
  ).join('\n');

  navigator.clipboard.writeText(homeText + '\n\n' + expertText).then(() => {
    const btn = document.getElementById('jigsawCopyBtn');
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Kopiert';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
}

function runPuzzle() {
  clearError();
  const names = getNames();
  const S = readCount(jigsawHomeCount);
  const E = readCount(jigsawExpertCount);

  const problem = checkInput(names, S, E);
  if (problem) { showError(problem); return; }

  render(buildPuzzle(names, S, E), S, E);
  jigsawResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Verdrahtung ----------

bindStepper(jigsawHomeCount, jigsawHomeDecrease, jigsawHomeIncrease);
bindStepper(jigsawExpertCount, jigsawExpertDecrease, jigsawExpertIncrease);
jigsawBtn.addEventListener('click', runPuzzle);

// Wechselt die Gruppe oder ändern sich die Namen, ist ein altes Ergebnis veraltet.
namesEl.addEventListener('input', () => {
  jigsawResults.innerHTML = '';
  lastPuzzle = null;
  clearError();
  updateHint();
});

updateHint();
