// ============================================================================
// MODULE: Nav
// PURPOSE: Schaltet zwischen den Ansichten um (Gruppen verwalten, Organisation,
//          Unterrichtsorganisation) und zeigt/versteckt die Gruppen-Auswahlleiste
// ============================================================================

import { navButtons, views, groupPickerBar } from './dom.js';

function showView(viewName) {
  views.forEach(section => {
    section.classList.toggle('is-hidden', section.dataset.view !== viewName);
  });
  navButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  // Die Gruppen-Auswahlleiste braucht man nur außerhalb von "Gruppen verwalten" -
  // dort gibt es die ausführlichere Liste inklusive Bearbeiten.
  groupPickerBar.classList.toggle('is-hidden', viewName === 'manage');
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

showView('draw');
