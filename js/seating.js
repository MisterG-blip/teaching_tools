// ============================================================================
// MODULE: Seating
// PURPOSE: Sitzplan-Raster (Reihen / U-Form / Gruppentische), Regeln
//          (vorne sitzen, nicht zusammen), Zufallszuteilung, manueller
//          Tausch per Klick, Speichern pro Gruppe, PDF-Export
// ============================================================================

import { ref, set } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js';
import { auth, db } from './firebase-init.js';
import { getNames, shuffle } from './utils.js';
import { activeGroupId } from './groups.js';
import {
  layoutReihen, layoutUform, layoutGruppen, proposeSeatingBtn, exportPdfBtn,
  seatingHint, seatingSaveIndicator, deskGrid, frontRowList, ruleNameA,
  ruleNameB, addRuleBtn, ruleList, printRoot, namesEl, activeGroupName
} from './dom.js';

let seatingLayout = 'reihen';
let currentDesks = [];         // [{id, col, row, seats:[nameOrNull, nameOrNull]}]
let frontRowSet = new Set();
let notTogetherPairs = [];     // [[nameA, nameB], ...]
let selectedSeat = null;       // {deskIdx, seatIdx}
let seatingSaveTimer = null;

function setLayout(newLayout) {
  seatingLayout = newLayout;
  [layoutReihen, layoutUform, layoutGruppen].forEach(btn => btn.setAttribute('aria-pressed', 'false'));
  ({ reihen: layoutReihen, uform: layoutUform, gruppentische: layoutGruppen }[newLayout]).setAttribute('aria-pressed', 'true');
}
layoutReihen.addEventListener('click', () => { setLayout('reihen'); queueSeatingSave(); });
layoutUform.addEventListener('click', () => { setLayout('uform'); queueSeatingSave(); });
layoutGruppen.addEventListener('click', () => { setLayout('gruppentische'); queueSeatingSave(); });

// ---- Layout-Engine: liefert Grid-Koordinaten für jeden Tisch ----
function computeDeskPositions(layout, deskCount) {
  if (deskCount <= 0) return { cols: 1, rows: 1, positions: [] };

  if (layout === 'reihen') {
    const rows = Math.ceil(deskCount / 2);
    const positions = [];
    let n = 0;
    for (let r = 0; r < rows && n < deskCount; r++) {
      positions.push({ col: 1, row: r + 1 }); n++;
      if (n < deskCount) { positions.push({ col: 3, row: r + 1 }); n++; }
    }
    return { cols: 3, rows, positions };
  }

  if (layout === 'uform') {
    const armLength = Math.max(2, Math.ceil(deskCount / 4));
    const baseWidth = Math.max(1, deskCount - armLength * 2);
    const cols = baseWidth + 2;
    const rows = armLength + 1;
    const full = [];
    for (let r = 1; r <= armLength; r++) full.push({ col: 1, row: r });
    for (let c = 1; c <= baseWidth; c++) full.push({ col: c + 1, row: armLength + 1 });
    for (let r = armLength; r >= 1; r--) full.push({ col: cols, row: r });
    return { cols, rows, positions: full.slice(0, deskCount) };
  }

  // Gruppentische: Zweier-Inseln (4 Plätze) im Raster
  const podCols = Math.max(1, Math.ceil(Math.sqrt(Math.ceil(deskCount / 2))));
  const positions = [];
  let n = 0, pod = 0;
  while (n < deskCount) {
    const podRow = Math.floor(pod / podCols);
    const podCol = pod % podCols;
    positions.push({ col: podCol * 3 + 1, row: podRow * 2 + 1 }); n++;
    if (n < deskCount) { positions.push({ col: podCol * 3 + 2, row: podRow * 2 + 1 }); n++; }
    pod++;
  }
  const rows = (Math.floor((pod - 1) / podCols) + 1) * 2;
  return { cols: podCols * 3, rows, positions };
}

// ---- Regeln: Auswahl-Listen & Chips ----
function refreshRuleOptions() {
  const names = getNames();

  frontRowList.innerHTML = '';
  names.forEach(name => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-toggle' + (frontRowSet.has(name) ? ' active' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      if (frontRowSet.has(name)) frontRowSet.delete(name); else frontRowSet.add(name);
      refreshRuleOptions();
      queueSeatingSave();
    });
    li.appendChild(btn);
    frontRowList.appendChild(li);
  });

  const fillSelect = (sel) => {
    const prev = sel.value;
    sel.innerHTML = '';
    names.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      sel.appendChild(opt);
    });
    if (names.includes(prev)) sel.value = prev;
  };
  fillSelect(ruleNameA);
  fillSelect(ruleNameB);

  renderRuleList();
}

function renderRuleList() {
  ruleList.innerHTML = '';
  notTogetherPairs.forEach((pair, idx) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = pair[0] + ' ↔ ' + pair[1];
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      notTogetherPairs.splice(idx, 1);
      renderRuleList();
      queueSeatingSave();
    });
    li.append(label, removeBtn);
    ruleList.appendChild(li);
  });
}

addRuleBtn.addEventListener('click', () => {
  const a = ruleNameA.value, b = ruleNameB.value;
  if (!a || !b || a === b) return;
  const exists = notTogetherPairs.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
  if (!exists) notTogetherPairs.push([a, b]);
  renderRuleList();
  queueSeatingSave();
});

// ---- Sitzplan vorschlagen (Los + Regelprüfung) ----
function proposeSeating() {
  const names = getNames();
  if (names.length === 0) {
    seatingHint.textContent = 'Erst Namen im Feld oben eintragen.';
    return;
  }

  const deskCount = Math.ceil(names.length / 2);
  const layoutData = computeDeskPositions(seatingLayout, deskCount);
  const desks = layoutData.positions.map((p, i) => ({ id: 'd' + i, col: p.col, row: p.row, seats: [null, null] }));

  let flatSeats = [];
  desks.forEach((d, di) => { flatSeats.push({ di, si: 0 }); flatSeats.push({ di, si: 1 }); });
  flatSeats.sort((a, b) => desks[a.di].row - desks[b.di].row);

  const frontNames = shuffle(names.filter(n => frontRowSet.has(n)));
  const otherNames = shuffle(names.filter(n => !frontRowSet.has(n)));

  let pointer = 0;
  const place = (name) => { if (pointer < flatSeats.length) { const s = flatSeats[pointer++]; desks[s.di].seats[s.si] = name; } };
  frontNames.forEach(place);
  otherNames.forEach(place);

  function findConflictDeskIndexes() {
    const idxs = [];
    desks.forEach((d, di) => {
      const [a, b] = d.seats;
      if (a && b && notTogetherPairs.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a))) idxs.push(di);
    });
    return idxs;
  }

  let tries = 0;
  let conflicts = findConflictDeskIndexes();
  while (conflicts.length > 0 && tries < 300) {
    const di = conflicts[0];
    const si = Math.random() < 0.5 ? 0 : 1;
    const otherDi = Math.floor(Math.random() * desks.length);
    const otherSi = Math.random() < 0.5 ? 0 : 1;
    const tmp = desks[di].seats[si];
    desks[di].seats[si] = desks[otherDi].seats[otherSi];
    desks[otherDi].seats[otherSi] = tmp;
    conflicts = findConflictDeskIndexes();
    tries++;
  }

  currentDesks = desks;
  selectedSeat = null;
  renderSeating(conflicts);
  seatingHint.textContent = conflicts.length > 0
    ? conflicts.length + ' Tisch(e) verletzen eine "nicht zusammen"-Regel (rot markiert) – bitte manuell tauschen.'
    : 'Sitzplan erstellt. Zwei Plätze antippen, um sie zu tauschen.';
  queueSeatingSave();
}
proposeSeatingBtn.addEventListener('click', proposeSeating);

// ---- Rendering ----
function renderSeating(conflictIdxs) {
  conflictIdxs = conflictIdxs || [];
  deskGrid.innerHTML = '';
  if (currentDesks.length === 0) return;

  const maxCol = Math.max(...currentDesks.map(d => d.col));
  const maxRow = Math.max(...currentDesks.map(d => d.row));
  deskGrid.style.gridTemplateColumns = 'repeat(' + maxCol + ', minmax(90px, 1fr))';
  deskGrid.style.gridTemplateRows = 'repeat(' + maxRow + ', auto)';

  currentDesks.forEach((desk, di) => {
    const deskEl = document.createElement('div');
    deskEl.className = 'desk' + (conflictIdxs.includes(di) ? ' conflict' : '');
    deskEl.style.gridColumn = desk.col;
    deskEl.style.gridRow = desk.row;

    desk.seats.forEach((name, si) => {
      const seatEl = document.createElement('div');
      const isFront = name && frontRowSet.has(name);
      seatEl.className = 'seat' + (name ? '' : ' empty') + (isFront ? ' front-marked' : '');
      seatEl.textContent = name || 'frei';
      seatEl.addEventListener('click', () => handleSeatClick(di, si));
      deskEl.appendChild(seatEl);
    });

    deskGrid.appendChild(deskEl);
  });

  markSelectedSeat();
}

function markSelectedSeat() {
  document.querySelectorAll('.seat.selected').forEach(el => el.classList.remove('selected'));
  if (!selectedSeat) return;
  const deskEl = deskGrid.children[selectedSeat.deskIdx];
  if (deskEl) deskEl.children[selectedSeat.seatIdx].classList.add('selected');
}

function handleSeatClick(deskIdx, seatIdx) {
  if (!selectedSeat) {
    if (!currentDesks[deskIdx].seats[seatIdx]) return; // leere Plätze nicht als Start wählbar
    selectedSeat = { deskIdx, seatIdx };
    markSelectedSeat();
    return;
  }
  if (selectedSeat.deskIdx === deskIdx && selectedSeat.seatIdx === seatIdx) {
    selectedSeat = null;
    markSelectedSeat();
    return;
  }
  const a = currentDesks[selectedSeat.deskIdx].seats[selectedSeat.seatIdx];
  const b = currentDesks[deskIdx].seats[seatIdx];
  currentDesks[selectedSeat.deskIdx].seats[selectedSeat.seatIdx] = b;
  currentDesks[deskIdx].seats[seatIdx] = a;
  selectedSeat = null;
  renderSeating(checkConflictsOnly());
  queueSeatingSave();
}

function checkConflictsOnly() {
  const idxs = [];
  currentDesks.forEach((d, di) => {
    const [a, b] = d.seats;
    if (a && b && notTogetherPairs.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a))) idxs.push(di);
  });
  return idxs;
}

// ---- Persistenz (pro Gruppe) ----
export function loadSeatingFromGroup(g) {
  const s = (g && g.seating) || null;
  seatingLayout = (s && s.layout) || 'reihen';
  setLayout(seatingLayout);
  currentDesks = (s && s.desks) || [];
  frontRowSet = new Set((s && s.frontRow) || []);
  notTogetherPairs = (s && s.notTogether) || [];
  selectedSeat = null;
  refreshRuleOptions();
  renderSeating(checkConflictsOnly());
  seatingHint.textContent = currentDesks.length > 0
    ? 'Gespeicherter Sitzplan geladen.'
    : 'Noch kein Sitzplan erstellt.';
}

function queueSeatingSave() {
  const user = auth && auth.currentUser;
  if (!user || !activeGroupId) return;
  seatingSaveIndicator.textContent = 'Speichert…';
  clearTimeout(seatingSaveTimer);
  seatingSaveTimer = setTimeout(() => {
    set(ref(db, 'groups/' + activeGroupId + '/seating'), {
      layout: seatingLayout,
      desks: currentDesks,
      frontRow: Array.from(frontRowSet),
      notTogether: notTogetherPairs,
      updatedAt: Date.now()
    });
    seatingSaveIndicator.textContent = 'Gespeichert';
    setTimeout(() => { if (seatingSaveIndicator.textContent === 'Gespeichert') seatingSaveIndicator.textContent = ''; }, 1500);
  }, 700);
}

// ---- PDF-Export (Drucken-Dialog) ----
exportPdfBtn.addEventListener('click', () => {
  if (currentDesks.length === 0) {
    seatingHint.textContent = 'Erst einen Sitzplan vorschlagen, bevor du exportierst.';
    return;
  }
  const groupTitle = activeGroupName.textContent || 'Sitzplan';
  const dateStr = new Date().toLocaleDateString('de-DE');
  printRoot.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = groupTitle + ' – Sitzplan';
  const meta = document.createElement('p');
  meta.className = 'print-meta';
  meta.textContent = 'Erstellt am ' + dateStr;

  const roomClone = document.getElementById('seatingRoom').cloneNode(true);
  roomClone.querySelectorAll('.seat').forEach(el => el.replaceWith(el.cloneNode(true))); // Klick-Handler entfernen

  printRoot.append(heading, meta, roomClone);
  document.body.classList.add('print-mode');
  window.print();
});
window.addEventListener('afterprint', () => {
  document.body.classList.remove('print-mode');
  printRoot.innerHTML = '';
});

// Namensänderungen -> Regel-Auswahllisten aktuell halten
namesEl.addEventListener('input', refreshRuleOptions);
refreshRuleOptions();
