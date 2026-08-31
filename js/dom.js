// ============================================================================
// MODULE: DOM
// PURPOSE: Zentrale Sammlung aller DOM-Referenzen, damit kein anderes Modul
//          wild querySelector/getElementById streut.
// ============================================================================

// Account / Auth
export const accountStatus = document.getElementById('accountStatus');
export const authForm = document.getElementById('authForm');
export const authEmail = document.getElementById('authEmail');
export const authPassword = document.getElementById('authPassword');
export const authMessage = document.getElementById('authMessage');
export const registerBtn = document.getElementById('registerBtn');
export const loggedInRow = document.getElementById('loggedInRow');
export const logoutBtn = document.getElementById('logoutBtn');

// Navigation
export const mainNav = document.getElementById('mainNav');
export const navButtons = Array.from(document.querySelectorAll('.nav-item'));
export const views = Array.from(document.querySelectorAll('.view'));

// Gruppen-Auswahl (Dropdown, sichtbar außerhalb von "Gruppen verwalten")
export const groupPickerBar = document.getElementById('groupPickerBar');
export const groupSelect = document.getElementById('groupSelect');
export const groupPickerHint = document.getElementById('groupPickerHint');

// Sidebar / Gruppen (jetzt Teil der "Gruppen verwalten"-Ansicht)
export const groupList = document.getElementById('groupList');
export const newGroupBtn = document.getElementById('newGroupBtn');
export const sidebarHint = document.getElementById('sidebarHint');
export const joinCodeInput = document.getElementById('joinCodeInput');
export const joinGroupBtn = document.getElementById('joinGroupBtn');
export const joinMessage = document.getElementById('joinMessage');

// Workspace / Namen
export const activeGroupName = document.getElementById('activeGroupName');
export const workspaceSub = document.getElementById('workspaceSub');
export const saveIndicator = document.getElementById('saveIndicator');
export const namesEl = document.getElementById('names');
export const countHint = document.getElementById('countHint');

// Gruppen auslosen
export const modeGroupsBtn = document.getElementById('modeGroups');
export const modeSizeBtn = document.getElementById('modeSize');
export const numberInput = document.getElementById('numberInput');
export const numberLabel = document.getElementById('numberLabel');
export const decreaseBtn = document.getElementById('decrease');
export const increaseBtn = document.getElementById('increase');
export const drawBtn = document.getElementById('drawBtn');
export const errorBox = document.getElementById('errorBox');
export const resultsEl = document.getElementById('results');

// Zufällig aufrufen (Slot machine)
export const callCount = document.getElementById('callCount');
export const callDecrease = document.getElementById('callDecrease');
export const callIncrease = document.getElementById('callIncrease');
export const noRepeat = document.getElementById('noRepeat');
export const slotWindow = document.getElementById('slotWindow');
export const slotDisplay = document.getElementById('slotDisplay');
export const calledHint = document.getElementById('calledHint');
export const callBtn = document.getElementById('callBtn');
export const resetCalledBtn = document.getElementById('resetCalledBtn');
export const calledChips = document.getElementById('calledChips');

// Konto-Einstellungen (accountweit)
export const accountSettingsPanel = document.getElementById('accountSettingsPanel');
export const settingsSaveIndicator = document.getElementById('settingsSaveIndicator');
export const accountBundesland = document.getElementById('accountBundesland');

// Klassendienste
export const dutiesSaveIndicator = document.getElementById('dutiesSaveIndicator');
export const dutiesBundeslandDisplay = document.getElementById('dutiesBundeslandDisplay');
export const dutiesIntervalWeeks = document.getElementById('dutiesIntervalWeeks');
export const dutiesStartDate = document.getElementById('dutiesStartDate');
export const dutiesEndDate = document.getElementById('dutiesEndDate');
export const dutyNameInput = document.getElementById('dutyNameInput');
export const dutyCountInput = document.getElementById('dutyCountInput');
export const addDutyBtn = document.getElementById('addDutyBtn');
export const dutyList = document.getElementById('dutyList');
export const generateDutiesBtn = document.getElementById('generateDutiesBtn');
export const exportDutiesPdfBtn = document.getElementById('exportDutiesPdfBtn');
export const dutiesHint = document.getElementById('dutiesHint');
export const dutiesTableWrap = document.getElementById('dutiesTableWrap');
// Sitzplan
export const layoutReihen = document.getElementById('layoutReihen');
export const layoutUform = document.getElementById('layoutUform');
export const layoutGruppen = document.getElementById('layoutGruppen');
export const layoutSchmetterling = document.getElementById('layoutSchmetterling');
export const layoutGitter = document.getElementById('layoutGitter');

export const paramsDeskType = document.getElementById('paramsDeskType');
export const deskTypeSingle = document.getElementById('deskTypeSingle');
export const deskTypeDouble = document.getElementById('deskTypeDouble');

export const paramsReihen = document.getElementById('paramsReihen');
export const paramsUform = document.getElementById('paramsUform');
export const paramsGruppentische = document.getElementById('paramsGruppentische');
export const paramsSchmetterling = document.getElementById('paramsSchmetterling');
export const paramsGitter = document.getElementById('paramsGitter');

export const reihenAnzahlReihen = document.getElementById('reihenAnzahlReihen');
export const reihenTischeProReihe = document.getElementById('reihenTischeProReihe');
export const uformLinks = document.getElementById('uformLinks');
export const uformRechts = document.getElementById('uformRechts');
export const uformBreite = document.getElementById('uformBreite');
export const uformMitte = document.getElementById('uformMitte');
export const gruppenModeCount = document.getElementById('gruppenModeCount');
export const gruppenModeSize = document.getElementById('gruppenModeSize');
export const gruppenAnzahl = document.getElementById('gruppenAnzahl');
export const gruppenAnzahlLabel = document.getElementById('gruppenAnzahlLabel');
export const useExistingDraw = document.getElementById('useExistingDraw');
export const schmetterlingReihen = document.getElementById('schmetterlingReihen');
export const schmetterlingFluegel = document.getElementById('schmetterlingFluegel');
export const schmetterlingMitte = document.getElementById('schmetterlingMitte');
export const gitterAnzahlReihen = document.getElementById('gitterAnzahlReihen');
export const gitterProReihe = document.getElementById('gitterProReihe');

export const generateLayoutBtn = document.getElementById('generateLayoutBtn');
export const activeLayoutLabel = document.getElementById('activeLayoutLabel');
export const toggleEditModeBtn = document.getElementById('toggleEditModeBtn');
export const editModeHint = document.getElementById('editModeHint');
export const proposeSeatingBtn = document.getElementById('proposeSeatingBtn');
export const exportPdfSchuelerBtn = document.getElementById('exportPdfSchuelerBtn');
export const exportPdfLehrerBtn = document.getElementById('exportPdfLehrerBtn');
export const seatingHint = document.getElementById('seatingHint');
export const seatingSaveIndicator = document.getElementById('seatingSaveIndicator');
export const seatingRoom = document.getElementById('seatingRoom');
export const deskGrid = document.getElementById('deskGrid');
export const frontRowList = document.getElementById('frontRowList');
export const ruleNameA = document.getElementById('ruleNameA');
export const ruleNameB = document.getElementById('ruleNameB');
export const addRuleBtn = document.getElementById('addRuleBtn');
export const ruleList = document.getElementById('ruleList');
export const printRoot = document.getElementById('printRoot');
