// ============================================================================
// MODULE: Seating
// PURPOSE: Sitzplan-Raster (Reihen / U-Form / Gruppentische / Schmetterling /
//          Gitter) mit echten Parametern erzeugen, Tischtyp
//          (Einzel-/Doppeltisch), manuelles Hinzufügen/Entfernen/Drehen von
//          Tischen per Klick, Regeln, Namenszuteilung, Speichern, PDF-Export.
// ============================================================================

import { ref, set } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js';
import { auth, db } from './firebase-init.js';
import { getNames, shuffle } from './utils.js';
import { activeGroupId } from './groups.js';
import { lastGroups } from './draw.js';
import {
  layoutReihen, layoutUform, layoutGruppen, layoutSchmetterling, layoutGitter,
  paramsDeskType, deskTypeSingle, deskTypeDouble,
  paramsReihen, paramsUform, paramsGruppentische, paramsSchmetterling, paramsGitter,
  reihenAnzahlReihen, reihenTischeProReihe,
  uformLinks, uformRechts, uformBreite, uformMitte,
  gruppenModeCount, gruppenModeSize, gruppenAnzahl, gruppenAnzahlLabel, useExistingDraw,
  schmetterlingReihen, schmetterlingFluegel, schmetterlingMitte,
  gitterAnzahlReihen, gitterProReihe,
  generateLayoutBtn, activeLayoutLabel, toggleEditModeBtn, editModeHint, proposeSeatingBtn, exportPdfBtn,
  seatingHint, seatingSaveIndicator, seatingRoom, deskGrid,
  frontRowList, ruleNameA, ruleNameB, addRuleBtn, ruleList, printRoot,
  namesEl, activeGroupName
} from './dom.js';

const GRID_COLS = 16;
const GRID_ROWS = 12;

const LAYOUT_PANELS = {
  reihen: paramsReihen,
  uform: paramsUform,
  gruppentische: paramsGruppentische,
  schmetterling: paramsSchmetterling,
  gitter: paramsGitter
};
const LAYOUT_BUTTONS = {
  reihen: layoutReihen,
  uform: layoutUform,
  gruppentische: layoutGruppen,
  schmetterling: layoutSchmetterling,
  gitter: layoutGitter
};

let currentLayout = 'reihen';
let gruppenMode = 'count';
let deskType = 'double';      // 'single' | 'double' - gilt für alle Vorlagen außer Gitter (dort immer 'single')
let desks = [];               // [{id, col, row, rotation, seats:[nameOrNull, ...]}]
let frontRowSet = new Set();
let notTogetherPairs = [];    // [[nameA, nameB], ...]
let selectedSeat = null;      // {deskIdx, seatIdx} - nur im Namen-Modus
let editMode = false;
let seatingSaveTimer = null;

function intval(el, fallback) {
  const n = parseInt(el.value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function intvalMin0(el) {
  const n = parseInt(el.value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

const LAYOUT_DISPLAY_NAMES = {
  reihen: 'Reihen',
  uform: 'U-Form',
  gruppentische: 'Gruppentische',
  schmetterling: 'Schmetterling',
  gitter: 'Gitter'
};

// ---- Layout-Auswahl: welches Parameter-Panel ist sichtbar ----
function setLayout(newLayout) {
  currentLayout = newLayout;
  Object.entries(LAYOUT_BUTTONS).forEach(([key, btn]) => btn.setAttribute('aria-pressed', String(key === newLayout)));
  Object.entries(LAYOUT_PANELS).forEach(([key, panel]) => { panel.classList.toggle('is-hidden', key !== newLayout); });
  // Tischtyp gilt für alle außer Gitter (dort fest Einzeltisch)
  paramsDeskType.classList.toggle('is-hidden', newLayout === 'gitter');
  activeLayoutLabel.innerHTML = 'Aktuell gewählt: <strong>' + LAYOUT_DISPLAY_NAMES[newLayout] + '</strong>';
}
layoutReihen.addEventListener('click', () => setLayout('reihen'));
layoutUform.addEventListener('click', () => setLayout('uform'));
layoutGruppen.addEventListener('click', () => setLayout('gruppentische'));
layoutSchmetterling.addEventListener('click', () => setLayout('schmetterling'));
layoutGitter.addEventListener('click', () => setLayout('gitter'));

// ---- Tischtyp-Umschalter ----
function setDeskType(newType) {
  deskType = newType;
  deskTypeSingle.setAttribute('aria-pressed', String(newType === 'single'));
  deskTypeDouble.setAttribute('aria-pressed', String(newType === 'double'));
}
deskTypeSingle.addEventListener('click', () => setDeskType('single'));
deskTypeDouble.addEventListener('click', () => setDeskType('double'));

// ---- Gruppentische: Anzahl-Gruppen / Personen-pro-Gruppe Umschalter ----
function setGruppenMode(newMode) {
  gruppenMode = newMode;
  gruppenModeCount.setAttribute('aria-pressed', String(newMode === 'count'));
  gruppenModeSize.setAttribute('aria-pressed', String(newMode === 'size'));
  gruppenAnzahlLabel.textContent = newMode === 'count' ? 'Anzahl Gruppen' : 'Personen pro Gruppe';
}
gruppenModeCount.addEventListener('click', () => setGruppenMode('count'));
gruppenModeSize.addEventListener('click', () => setGruppenMode('size'));

// ---- Positions-Generatoren (liefern nur {col,row}-Listen, keine Namen/Sitze) ----
function generateReihenPositions(rows, perRow) {
  const positions = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= perRow; c++) positions.push({ col: c, row: r });
  }
  return positions;
}

function generateUformPositions(leftLen, rightLen, breite, mitte) {
  const totalCols = breite + 2;
  const bottomRow = Math.max(leftLen, rightLen, 0) + 1;
  const positions = [];
  // Linker Arm: Tische drehen sich nach rechts (zur Mitte hin)
  for (let r = 1; r <= leftLen; r++) positions.push({ col: 1, row: r, rotation: 90 });
  // Rechter Arm: Tische drehen sich nach links (zur Mitte hin)
  for (let r = 1; r <= rightLen; r++) positions.push({ col: totalCols, row: r, rotation: 270 });
  // Bodenreihe: normal ausgerichtet (Richtung Tafel)
  for (let c = 1; c <= breite; c++) positions.push({ col: c + 1, row: bottomRow, rotation: 0 });

  // Tische in der Mitte: zeilenweise mittig und symmetrisch platzieren
  const interiorWidth = totalCols - 2; // Spalten 2..totalCols-1
  let placed = 0, midRow = 1;
  while (placed < mitte) {
    const remaining = mitte - placed;
    const rowCount = Math.min(remaining, interiorWidth);
    const startCol = 2 + Math.floor((interiorWidth - rowCount) / 2);
    for (let i = 0; i < rowCount; i++) {
      positions.push({ col: startCol + i, row: midRow, rotation: 0 });
      placed++;
    }
    midRow++;
  }
  return positions;
}

function generateSchmetterlingPositions(mainRows, wingCount, mitte) {
  const positions = [];
  // Hauptblock: 2 Spalten (links/rechts) mit Mittelgang dazwischen (Spalte 3, leer)
  for (let r = 1; r <= mainRows; r++) {
    positions.push({ col: 2, row: r, rotation: 0 });
    positions.push({ col: 4, row: r, rotation: 0 });
  }
  // Flügel: linker Flügel dreht sich nach rechts (zur Mitte), rechter nach links
  for (let r = 1; r <= wingCount; r++) {
    positions.push({ col: 1, row: r, rotation: 90 });
    positions.push({ col: 5, row: r, rotation: 270 });
  }
  // Tische in der Mitte: hinten im Gang, hinter dem Hauptblock
  for (let i = 0; i < mitte; i++) {
    positions.push({ col: 3, row: mainRows + 1 + i, rotation: 0 });
  }
  return positions;
}

function computeGroupSizes(totalNames, groupsCount) {
  const base = Math.floor(totalNames / groupsCount);
  const rem = totalNames % groupsCount;
  const sizes = [];
  for (let i = 0; i < groupsCount; i++) sizes.push(base + (i < rem ? 1 : 0));
  return sizes.filter(s => s > 0);
}

function generateGruppentischePositions(groupSizes, seatsPerDesk) {
  const positions = [];
  const podsPerRow = 2; // Räume sind meist schmaler als lang: max. 2 Tischgruppen nebeneinander,
                         // weitere Gruppen wachsen als zusätzliche Zeilen-Bänke nach unten statt in die Breite.
  const deskCounts = groupSizes.map(size => Math.ceil(size / seatsPerDesk));
  let rowCursor = 1;

  for (let bandStart = 0; bandStart < deskCounts.length; bandStart += podsPerRow) {
    const bandCounts = deskCounts.slice(bandStart, bandStart + podsPerRow);
    // Zeilen je Pod = 2 Tische pro Pod-Zeile -> ceil(deskCount/2); Bank-Höhe = höchster Pod in dieser Bank,
    // damit unterschiedlich große Gruppen nebeneinander nicht in die nächste Bank hineinragen.
    const rowsPerPod = bandCounts.map(c => Math.ceil(c / 2));
    const bandHeight = Math.max(...rowsPerPod);

    bandCounts.forEach((deskCount, i) => {
      const podCol = i * 3 + 1;
      let placed = 0;
      let localRow = rowCursor;
      while (placed < deskCount) {
        for (let c = 0; c < 2 && placed < deskCount; c++) {
          positions.push({ col: podCol + c, row: localRow });
          placed++;
        }
        localRow++;
      }
    });

    rowCursor += bandHeight + 1; // +1 Zeile Abstand zwischen den Bänken
  }

  return positions;
}

function makeDesks(positions, seatsPerDesk) {
  return positions.map((p, i) => ({
    id: 'd' + i,
    col: p.col,
    row: p.row,
    rotation: p.rotation || 0,
    seats: Array(seatsPerDesk).fill(null)
  }));
}

// ---- Layout erzeugen ----
function generateLayout() {
  const effectiveDeskType = currentLayout === 'gitter' ? 'single' : deskType;
  const seatsPerDesk = effectiveDeskType === 'single' ? 1 : 2;

  if (currentLayout === 'gruppentische' && useExistingDraw.checked) {
    if (!lastGroups || lastGroups.length === 0) {
      seatingHint.textContent = 'Noch keine Auslosung vorhanden. Erst unter "Gruppen auslosen" Teams bilden.';
      return;
    }
    buildFromExistingDraw(seatsPerDesk);
    return;
  }

  let positions;
  if (currentLayout === 'reihen') {
    positions = generateReihenPositions(intval(reihenAnzahlReihen, 4), intval(reihenTischeProReihe, 3));
  } else if (currentLayout === 'uform') {
    positions = generateUformPositions(
      intvalMin0(uformLinks), intvalMin0(uformRechts), intval(uformBreite, 4), intvalMin0(uformMitte)
    );
  } else if (currentLayout === 'schmetterling') {
    positions = generateSchmetterlingPositions(
      intval(schmetterlingReihen, 3), Math.max(0, parseInt(schmetterlingFluegel.value, 10) || 0), Math.max(0, parseInt(schmetterlingMitte.value, 10) || 0)
    );
  } else if (currentLayout === 'gitter') {
    positions = generateReihenPositions(intval(gitterAnzahlReihen, 5), intval(gitterProReihe, 5));
  } else {
    const names = getNames();
    if (names.length === 0) {
      seatingHint.textContent = 'Erst Namen in "Gruppen verwalten" eintragen.';
      return;
    }
    const n = intval(gruppenAnzahl, 4);
    const groupsCount = gruppenMode === 'count' ? Math.max(1, n) : Math.max(1, Math.ceil(names.length / n));
    const groupSizes = computeGroupSizes(names.length, groupsCount);
    positions = generateGruppentischePositions(groupSizes, seatsPerDesk);
  }

  desks = makeDesks(positions, seatsPerDesk);
  selectedSeat = null;
  renderRoom();
  queueSeatingSave();
  seatingHint.textContent = 'Layout erzeugt. Jetzt "Namen zuteilen" klicken oder Tische manuell anpassen.';
}
generateLayoutBtn.addEventListener('click', generateLayout);

function buildFromExistingDraw(seatsPerDesk) {
  const groupSizes = lastGroups.map(g => g.length);
  const positions = generateGruppentischePositions(groupSizes, seatsPerDesk);
  desks = makeDesks(positions, seatsPerDesk);

  let deskCursor = 0;
  lastGroups.forEach(group => {
    const deskCount = Math.ceil(group.length / seatsPerDesk);
    const groupDesks = desks.slice(deskCursor, deskCursor + deskCount);
    let namePointer = 0;
    groupDesks.forEach(d => {
      for (let si = 0; si < d.seats.length; si++) {
        d.seats[si] = group[namePointer++] || null;
      }
    });
    deskCursor += deskCount;
  });

  selectedSeat = null;
  renderRoom();
  queueSeatingSave();
  seatingHint.textContent = 'Sitzplan aus der bestehenden Auslosung erstellt (jede Tischgruppe = ein ausgelostes Team).';
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

// ---- Namen zuteilen (Los + Regelprüfung), füllt NUR die bestehenden Tische ----
function deskHasConflict(desk) {
  for (let i = 0; i < desk.seats.length; i++) {
    for (let j = i + 1; j < desk.seats.length; j++) {
      const a = desk.seats[i], b = desk.seats[j];
      if (a && b && notTogetherPairs.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a))) return true;
    }
  }
  return false;
}

function checkConflictsOnly() {
  const idxs = [];
  desks.forEach((d, di) => { if (deskHasConflict(d)) idxs.push(di); });
  return idxs;
}

function proposeSeating() {
  if (desks.length === 0) {
    seatingHint.textContent = 'Erst ein Layout erzeugen, bevor Namen zugeteilt werden.';
    return;
  }
  const names = getNames();
  if (names.length === 0) {
    seatingHint.textContent = 'Erst Namen in "Gruppen verwalten" eintragen.';
    return;
  }

  desks.forEach(d => { d.seats = d.seats.map(() => null); });

  // Reihenfolge = Erzeugungsreihenfolge der Tische (bei Reihen/U-Form/Schmetterling = vorne
  // zuerst, bei Gruppentischen = tischgruppenweise zusammenhängend)
  let flatSeats = [];
  desks.forEach((d, di) => { d.seats.forEach((_, si) => flatSeats.push({ di, si })); });

  const frontNames = shuffle(names.filter(n => frontRowSet.has(n)));
  const otherNames = shuffle(names.filter(n => !frontRowSet.has(n)));

  let pointer = 0;
  const place = (name) => { if (pointer < flatSeats.length) { const s = flatSeats[pointer++]; desks[s.di].seats[s.si] = name; } };
  frontNames.forEach(place);
  otherNames.forEach(place);

  let tries = 0;
  let conflicts = checkConflictsOnly();
  while (conflicts.length > 0 && tries < 300) {
    const di = conflicts[0];
    const desk = desks[di];
    const si = Math.floor(Math.random() * desk.seats.length);
    const otherDi = Math.floor(Math.random() * desks.length);
    const otherDesk = desks[otherDi];
    const otherSi = Math.floor(Math.random() * otherDesk.seats.length);
    const tmp = desk.seats[si];
    desk.seats[si] = otherDesk.seats[otherSi];
    otherDesk.seats[otherSi] = tmp;
    conflicts = checkConflictsOnly();
    tries++;
  }

  selectedSeat = null;
  renderRoom();
  seatingHint.textContent = conflicts.length > 0
    ? conflicts.length + ' Tisch(e) verletzen eine "nicht zusammen"-Regel (rot markiert) – bitte manuell tauschen.'
    : 'Namen zugeteilt. Zwei Plätze antippen, um sie zu tauschen.';
  queueSeatingSave();
}
proposeSeatingBtn.addEventListener('click', proposeSeating);

// ---- Bearbeitungsmodus: Tische per Klick hinzufügen/entfernen/drehen ----
function setEditMode(on) {
  editMode = on;
  seatingRoom.classList.toggle('edit-mode', on);
  toggleEditModeBtn.textContent = on ? 'Fertig' : 'Tische bearbeiten';
  editModeHint.style.display = on ? 'block' : 'none';
  selectedSeat = null;
  renderRoom();
}
editModeHint.style.display = 'none';
toggleEditModeBtn.addEventListener('click', () => setEditMode(!editMode));

function findDeskAt(col, row) {
  return desks.find(d => d.col === col && d.row === row);
}

function handleGridCellClick(col, row) {
  const desk = findDeskAt(col, row);
  if (desk) {
    const occupied = desk.seats.some(Boolean);
    if (occupied && !confirm('Dieser Tisch ist besetzt (' + desk.seats.filter(Boolean).join(', ') + '). Trotzdem entfernen?')) return;
    desks = desks.filter(d => d !== desk);
  } else {
    const seatsPerDesk = (currentLayout === 'gitter' ? 'single' : deskType) === 'single' ? 1 : 2;
    desks.push({ id: 'd' + Date.now() + Math.random().toString(16).slice(2), col, row, rotation: 0, seats: Array(seatsPerDesk).fill(null) });
  }
  renderRoom();
  queueSeatingSave();
}

function rotateDesk(desk) {
  desk.rotation = (desk.rotation + 90) % 360;
  renderRoom();
  queueSeatingSave();
}

// ---- Rendering ----
function renderRoom() {
  if (editMode) {
    renderGridEditor();
  } else {
    renderSeatingNormal();
  }
}

function renderGridEditor() {
  deskGrid.innerHTML = '';

  const maxDeskCol = desks.length ? Math.max(...desks.map(d => d.col)) : 0;
  const maxDeskRow = desks.length ? Math.max(...desks.map(d => d.row)) : 0;
  const cols = Math.max(GRID_COLS, maxDeskCol + 3);
  const rows = Math.max(GRID_ROWS, maxDeskRow + 3);

  deskGrid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(48px, 1fr))';
  deskGrid.style.gridTemplateRows = 'repeat(' + rows + ', auto)';

  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= cols; col++) {
      const desk = findDeskAt(col, row);
      const cell = document.createElement('div');
      cell.className = 'grid-cell' + (desk ? ' has-desk' : ' empty-cell');
      cell.style.gridColumn = col;
      cell.style.gridRow = row;

      if (desk) {
        cell.style.setProperty('--rot', desk.rotation + 'deg');
        const occupied = desk.seats.some(Boolean);
        const iconSpan = document.createElement('span');
        iconSpan.className = 'grid-cell-icon';
        iconSpan.textContent = occupied ? '🪑✎' : '🪑';
        cell.appendChild(iconSpan);
        cell.title = 'Klicken zum Entfernen';
        cell.addEventListener('click', () => handleGridCellClick(col, row));

        const rotateBtn = document.createElement('button');
        rotateBtn.type = 'button';
        rotateBtn.className = 'rotate-btn';
        rotateBtn.textContent = '↻';
        rotateBtn.title = 'Tisch drehen';
        rotateBtn.addEventListener('click', (e) => { e.stopPropagation(); rotateDesk(desk); });
        cell.appendChild(rotateBtn);
      } else {
        cell.textContent = '+';
        cell.title = 'Klicken zum Platzieren';
        cell.addEventListener('click', () => handleGridCellClick(col, row));
      }
      deskGrid.appendChild(cell);
    }
  }
}

function renderSeatingNormal() {
  deskGrid.innerHTML = '';
  if (desks.length === 0) {
    deskGrid.style.gridTemplateColumns = '';
    deskGrid.style.gridTemplateRows = '';
    return;
  }

  const maxCol = Math.max(...desks.map(d => d.col));
  const maxRow = Math.max(...desks.map(d => d.row));
  deskGrid.style.gridTemplateColumns = 'repeat(' + maxCol + ', minmax(80px, 1fr))';
  deskGrid.style.gridTemplateRows = 'repeat(' + maxRow + ', auto)';

  const conflictIdxs = checkConflictsOnly();

  desks.forEach((desk, di) => {
    const isVertical = desk.rotation === 90 || desk.rotation === 270;
    const deskEl = document.createElement('div');
    deskEl.className = 'desk'
      + (conflictIdxs.includes(di) ? ' conflict' : '')
      + (desk.seats.length === 1 ? ' single-seat' : '')
      + (isVertical ? ' vertical' : '');
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
    if (!desks[deskIdx].seats[seatIdx]) return;
    selectedSeat = { deskIdx, seatIdx };
    markSelectedSeat();
    return;
  }
  if (selectedSeat.deskIdx === deskIdx && selectedSeat.seatIdx === seatIdx) {
    selectedSeat = null;
    markSelectedSeat();
    return;
  }
  const a = desks[selectedSeat.deskIdx].seats[selectedSeat.seatIdx];
  const b = desks[deskIdx].seats[seatIdx];
  desks[selectedSeat.deskIdx].seats[selectedSeat.seatIdx] = b;
  desks[deskIdx].seats[seatIdx] = a;
  selectedSeat = null;
  renderRoom();
  queueSeatingSave();
}

// ---- Persistenz (pro Gruppe) ----
export function loadSeatingFromGroup(g) {
  const s = (g && g.seating) || null;
  currentLayout = (s && s.layout) || 'reihen';
  deskType = (s && s.deskType) || 'double';
  setLayout(currentLayout);
  setDeskType(deskType);
  desks = ((s && s.desks) || []).map(d => ({ rotation: 0, ...d, seats: d.seats || [null, null] }));
  frontRowSet = new Set((s && s.frontRow) || []);
  notTogetherPairs = (s && s.notTogether) || [];
  selectedSeat = null;
  editMode = false;
  seatingRoom.classList.remove('edit-mode');
  toggleEditModeBtn.textContent = 'Tische bearbeiten';
  editModeHint.style.display = 'none';
  refreshRuleOptions();
  renderRoom();
  seatingHint.textContent = desks.length > 0
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
      layout: currentLayout,
      deskType: deskType,
      desks: desks,
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
  if (desks.length === 0) {
    seatingHint.textContent = 'Erst einen Sitzplan erstellen, bevor du exportierst.';
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

  const roomClone = seatingRoom.cloneNode(true);
  roomClone.querySelectorAll('.seat, .grid-cell, .rotate-btn').forEach(el => el.replaceWith(el.cloneNode(true))); // Klick-Handler entfernen

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
setGruppenMode('count');
setDeskType('double');
