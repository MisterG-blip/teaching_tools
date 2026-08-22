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

// Sitzplan
export const layoutReihen = document.getElementById('layoutReihen');
export const layoutUform = document.getElementById('layoutUform');
export const layoutGruppen = document.getElementById('layoutGruppen');
export const proposeSeatingBtn = document.getElementById('proposeSeatingBtn');
export const exportPdfBtn = document.getElementById('exportPdfBtn');
export const seatingHint = document.getElementById('seatingHint');
export const seatingSaveIndicator = document.getElementById('seatingSaveIndicator');
export const deskGrid = document.getElementById('deskGrid');
export const frontRowList = document.getElementById('frontRowList');
export const ruleNameA = document.getElementById('ruleNameA');
export const ruleNameB = document.getElementById('ruleNameB');
export const addRuleBtn = document.getElementById('addRuleBtn');
export const ruleList = document.getElementById('ruleList');
export const printRoot = document.getElementById('printRoot');
