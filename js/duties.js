// ============================================================================
// MODULE: Duties (Klassendienste)
// PURPOSE: Dienste mit Personenanzahl verwalten, faire Rotation über das
//          Schuljahr erzeugen (Ferien werden automatisch übersprungen,
//          Daten aus data/holliday.json), Speichern pro Gruppe, PDF-Export.
// ============================================================================

import { ref, set } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js';
import { auth, db } from './firebase-init.js';
import { getNames } from './utils.js';
import { activeGroupId } from './groups.js';
import { userBundesland } from './settings.js';
import {
  dutiesSaveIndicator, dutiesIntervalWeeks, dutiesStartDate, dutiesEndDate,
  dutyNameInput, dutyCountInput, addDutyBtn, dutyList,
  generateDutiesBtn, exportDutiesPdfBtn, dutiesHint, dutiesTableWrap,
  printRoot, activeGroupName
} from './dom.js';

let duties = [];        // [{id, name, count}]
let periods = [];       // [{start, end, assignments: {dutyName: [names...]}}] - letztes Rotationsergebnis
let dutiesSaveTimer = null;

// ---- Default-Zeitraum: heute bis in 12 Monaten ----
function toDateInputValue(d) {
  return d.toISOString().slice(0, 10);
}
(function setDefaultDates() {
  const today = new Date();
  const inOneYear = new Date(today);
  inOneYear.setFullYear(inOneYear.getFullYear() + 1);
  dutiesStartDate.value = toDateInputValue(today);
  dutiesEndDate.value = toDateInputValue(inOneYear);
})();

// ---- Dienste-Liste verwalten ----
function renderDutyList() {
  dutyList.innerHTML = '';
  duties.forEach((duty, idx) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = duty.name + ' (' + duty.count + ' SuS)';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      duties.splice(idx, 1);
      renderDutyList();
      queueDutiesSave();
    });
    li.append(label, removeBtn);
    dutyList.appendChild(li);
  });
}

addDutyBtn.addEventListener('click', () => {
  const name = dutyNameInput.value.trim();
  const count = Math.max(1, parseInt(dutyCountInput.value, 10) || 1);
  if (!name) return;
  duties.push({ id: 'duty' + Date.now(), name, count });
  dutyNameInput.value = '';
  dutyCountInput.value = '1';
  renderDutyList();
  queueDutiesSave();
});
dutyNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addDutyBtn.click(); });

// ---- Ferien laden (lokale Datei data/holliday.json, keine externe API mehr) ----
let holidayData = null; // einmal geladen, dann im Speicher gecacht

async function loadHolidayData() {
  if (holidayData) return holidayData;
  const res = await fetch('data/holliday.json');
  if (!res.ok) throw new Error('Ferien-Datei nicht gefunden (' + res.status + ')');
  holidayData = await res.json();
  return holidayData;
}

// Reine "YYYY-MM-DD"-Strings, keine Uhrzeit -> keine Zeitzonen-Fallstricke mehr.
function parseSimpleDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function fetchHolidaysForRange(bundesland, startDate, endDate) {
  const data = await loadHolidayData();
  const stateKey = 'DE-' + bundesland;
  const state = data.states[stateKey];
  if (!state) {
    throw new Error('Für "' + stateKey + '" liegen noch keine Ferientermine in der Datei vor.');
  }

  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();
  const all = [];
  let missingYears = [];
  for (let y = startYear; y <= endYear; y++) {
    const yearData = state.years[String(y)];
    if (yearData) {
      yearData.holidays.forEach(h => {
        all.push({ start: parseSimpleDate(h.start), end: parseSimpleDate(h.end), name: h.name });
      });
    } else {
      missingYears.push(y);
    }
  }
  if (missingYears.length > 0) {
    throw new Error('Für "' + state.name + '" fehlen Ferientermine für: ' + missingYears.join(', ') + '.');
  }
  return all;
}

function isDateInHolidays(date, holidays) {
  return holidays.some(h => date >= h.start && date <= h.end);
}

// ---- Zeiträume berechnen (Ferienwochen werden übersprungen) ----
// Arbeitet konsequent mit UTC-Mitternacht-Daten, damit Cursor- und Ferien-Daten
// unabhängig von der Zeitzone des Browsers immer vergleichbar sind.
function toUtcMidnight(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function computeSchoolPeriods(startDate, endDate, intervalWeeks, holidays) {
  const result = [];
  const endUtc = toUtcMidnight(endDate);
  let cursor = toUtcMidnight(startDate);

  while (cursor <= endUtc) {
    const periodEnd = new Date(cursor.getTime());
    periodEnd.setUTCDate(periodEnd.getUTCDate() + intervalWeeks * 7 - 1);
    if (!isDateInHolidays(cursor, holidays)) {
      result.push({ start: new Date(cursor.getTime()), end: periodEnd > endUtc ? endUtc : periodEnd });
    }
    cursor = new Date(cursor.getTime());
    cursor.setUTCDate(cursor.getUTCDate() + intervalWeeks * 7);
  }
  return result;
}

// ---- Faire Rotation: Diensteplätze wandern durch die Klasse, UND welcher Dienst
//      an welchem Platz hängt, verschiebt sich nach jedem vollen Durchlauf -
//      so bekommt niemand immer denselben Dienst. ----
function generateAssignments(names, dutyList_, rawPeriods) {
  const slots = [];
  dutyList_.forEach(d => { for (let i = 0; i < d.count; i++) slots.push(d.name); });
  const S = slots.length;
  const N = names.length;

  return rawPeriods.map((period, w) => {
    if (S === 0 || N === 0) return { ...period, assignments: {} };
    const offset = (w * S) % N;
    const lap = Math.floor((w * S) / N);
    const assignments = {};
    for (let i = 0; i < S; i++) {
      const student = names[(offset + i) % N];
      const duty = slots[(i + lap) % S];
      if (!assignments[duty]) assignments[duty] = [];
      assignments[duty].push(student);
    }
    return { ...period, assignments };
  });
}

function formatDate(d) {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

// ---- Rotation erzeugen ----
async function generateDuties() {
  const names = getNames();
  if (names.length === 0) {
    dutiesHint.textContent = 'Erst Namen in "Gruppen verwalten" eintragen.';
    return;
  }
  if (duties.length === 0) {
    dutiesHint.textContent = 'Erst mindestens einen Dienst eintragen.';
    return;
  }
  const startDate = new Date(dutiesStartDate.value);
  const endDate = new Date(dutiesEndDate.value);
  if (!(startDate instanceof Date) || isNaN(startDate) || !(endDate instanceof Date) || isNaN(endDate) || endDate < startDate) {
    dutiesHint.textContent = 'Start- und Enddatum prüfen.';
    return;
  }
  const intervalWeeks = Math.max(1, parseInt(dutiesIntervalWeeks.value, 10) || 4);
  const bundesland = userBundesland;

  dutiesHint.textContent = 'Lade Ferientermine…';
  generateDutiesBtn.disabled = true;

  let holidays;
  try {
    holidays = await fetchHolidaysForRange(bundesland, startDate, endDate);
  } catch (err) {
    generateDutiesBtn.disabled = false;
    const proceed = confirm(
      'Ferientermine konnten nicht geladen werden:\n\n' + err.message +
      '\n\nOhne Ferientermine werden ALLE Zeiträume erzeugt, auch während der Ferien. ' +
      'Trotzdem fortfahren?'
    );
    if (!proceed) {
      dutiesHint.textContent = 'Abgebrochen: ' + err.message;
      return;
    }
    holidays = [];
    dutiesHint.textContent = 'Fortgefahren ohne Ferien-Ausschluss.';
  }

  generateDutiesBtn.disabled = true;
  const rawPeriods = computeSchoolPeriods(startDate, endDate, intervalWeeks, holidays);
  periods = generateAssignments(names, duties, rawPeriods);
  renderDutiesTable();
  queueDutiesSave();
  generateDutiesBtn.disabled = false;
  dutiesHint.textContent = periods.length + ' Zeiträume erzeugt' + (holidays.length > 0 ? ' (Ferien übersprungen).' : ' (OHNE Ferien-Ausschluss).');
}
generateDutiesBtn.addEventListener('click', generateDuties);

// ---- Tabelle rendern ----
function buildDutiesTableElement() {
  const table = document.createElement('table');
  table.className = 'duties-table';

  const dutyNames = duties.map(d => d.name);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const thPeriod = document.createElement('th');
  thPeriod.textContent = 'Zeitraum';
  headRow.appendChild(thPeriod);
  dutyNames.forEach(name => {
    const th = document.createElement('th');
    th.textContent = name;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  periods.forEach(period => {
    const tr = document.createElement('tr');
    const tdPeriod = document.createElement('td');
    tdPeriod.className = 'period-cell';
    tdPeriod.textContent = formatDate(period.start) + ' – ' + formatDate(period.end);
    tr.appendChild(tdPeriod);

    dutyNames.forEach(name => {
      const td = document.createElement('td');
      const namesWrap = document.createElement('div');
      namesWrap.className = 'duty-names';
      (period.assignments[name] || []).forEach(personName => {
        const chip = document.createElement('span');
        chip.textContent = personName;
        namesWrap.appendChild(chip);
      });
      td.appendChild(namesWrap);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function renderDutiesTable() {
  dutiesTableWrap.innerHTML = '';
  if (periods.length === 0) return;
  dutiesTableWrap.appendChild(buildDutiesTableElement());
}

// ---- PDF-Export ----
function setPrintPageOrientation(orientation) {
  let styleEl = document.getElementById('printPageSizeStyle');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'printPageSizeStyle';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = '@media print { @page { size: A4 ' + orientation + '; margin: 12mm; } }';
}

exportDutiesPdfBtn.addEventListener('click', () => {
  if (periods.length === 0) {
    dutiesHint.textContent = 'Erst eine Rotation erzeugen, bevor du exportierst.';
    return;
  }
  const groupTitle = activeGroupName.textContent || 'Klassendienste';
  const dateStr = new Date().toLocaleDateString('de-DE');

  // Viele Dienste nebeneinander -> Querformat, sonst Hochformat
  setPrintPageOrientation(duties.length > 3 ? 'landscape' : 'portrait');

  printRoot.innerHTML = '';
  const heading = document.createElement('h2');
  heading.textContent = groupTitle + ' – Klassendienste';
  const meta = document.createElement('p');
  meta.className = 'print-meta';
  meta.textContent = 'Zeitraum ' + formatDate(periods[0].start) + ' – ' + formatDate(periods[periods.length - 1].end) + ' · Erstellt am ' + dateStr;

  printRoot.append(heading, meta, buildDutiesTableElement());
  document.body.classList.add('print-mode');
  window.print();
});

window.addEventListener('afterprint', () => {
  document.body.classList.remove('print-mode');
  printRoot.innerHTML = '';
});

// ---- Persistenz (pro Gruppe) ----
export function loadDutiesFromGroup(g) {
  const d = (g && g.duties) || null;
  duties = (d && d.list) || [];
  dutiesIntervalWeeks.value = (d && d.intervalWeeks) || 4;
  if (d && d.startDate) dutiesStartDate.value = d.startDate;
  if (d && d.endDate) dutiesEndDate.value = d.endDate;
  periods = [];
  renderDutyList();
  dutiesTableWrap.innerHTML = '';
  dutiesHint.textContent = duties.length > 0 ? 'Gespeicherte Dienste geladen. "Rotation erzeugen" klicken für die Termine.' : 'Noch keine Rotation erzeugt.';
}

function queueDutiesSave() {
  const user = auth && auth.currentUser;
  if (!user || !activeGroupId) return;
  dutiesSaveIndicator.textContent = 'Speichert…';
  clearTimeout(dutiesSaveTimer);
  dutiesSaveTimer = setTimeout(() => {
    set(ref(db, 'groups/' + activeGroupId + '/duties'), {
      list: duties,
      intervalWeeks: parseInt(dutiesIntervalWeeks.value, 10) || 4,
      startDate: dutiesStartDate.value,
      endDate: dutiesEndDate.value,
      updatedAt: Date.now()
    });
    dutiesSaveIndicator.textContent = 'Gespeichert';
    setTimeout(() => { if (dutiesSaveIndicator.textContent === 'Gespeichert') dutiesSaveIndicator.textContent = ''; }, 1500);
  }, 700);
}

[dutiesIntervalWeeks, dutiesStartDate, dutiesEndDate].forEach(el => {
  el.addEventListener('change', queueDutiesSave);
});
