// ============================================================================
// MODULE: Groups
// PURPOSE: Gruppen anlegen/umbenennen/löschen/verlassen, Teilen per Code,
//          Live-Synchronisierung mehrerer Lehrkräfte über groups/{groupId}
// ============================================================================

import {
  ref, onValue, push, set, remove, off, get
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { auth, db } from './firebase-init.js';
import { resetCalled } from './roll-call.js';
import { loadSeatingFromGroup } from './seating.js';
import { loadDutiesFromGroup } from './duties.js';
import {
  accountStatus, authForm, loggedInRow,
  groupList, newGroupBtn, sidebarHint,
  joinCodeInput, joinGroupBtn, joinMessage,
  shareModalOverlay, shareModalTitle, shareModalCode, shareModalCopyBtn, shareModalClose,
  groupSelect, groupPickerHint,
  activeGroupName, workspaceSub, saveIndicator, namesEl, countHint, resultsEl
} from './dom.js';

let groups = {}; // { groupId: { name, names, ownerUid, joinCode, members, seating, ... } }
export let activeGroupId = null;
let saveTimer = null;

// ================= Sidebar rendering =================
function renderGroupList() {
  groupList.innerHTML = '';
  const ids = Object.keys(groups).sort((a, b) => (groups[a].createdAt || 0) - (groups[b].createdAt || 0));

  newGroupBtn.disabled = ids.length >= MAX_GROUPS;
  newGroupBtn.title = ids.length >= MAX_GROUPS
    ? 'Maximal ' + MAX_GROUPS + ' Gruppen erreicht'
    : 'Neue Gruppe anlegen';

  if (ids.length === 0) {
    sidebarHint.textContent = auth && auth.currentUser
      ? 'Noch keine Gruppe angelegt. Auf "+" klicken, um zu starten.'
      : 'Melde dich an, um Gruppen zu speichern und von jedem Gerät abzurufen.';
    sidebarHint.style.display = 'block';
  } else {
    sidebarHint.style.display = 'none';
  }

  const myUid = auth && auth.currentUser ? auth.currentUser.uid : null;

  ids.forEach(id => {
    const g = groups[id];
    const memberCount = g.members ? Object.keys(g.members).length : 1;
    const isOwner = myUid && g.ownerUid === myUid;

    const li = document.createElement('li');
    li.className = 'group-item' + (id === activeGroupId ? ' active' : '');

    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'group-select';
    selectBtn.textContent = (g.name || 'Ohne Namen') + (memberCount > 1 ? ' 👥' + memberCount : '');
    selectBtn.addEventListener('click', () => selectGroup(id));

    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'mini-btn';
    shareBtn.title = 'Mit Kolleg:in teilen';
    shareBtn.textContent = '👥';
    shareBtn.addEventListener('click', () => shareGroup(id));

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'mini-btn';
    renameBtn.title = 'Umbenennen';
    renameBtn.textContent = '✎';
    renameBtn.addEventListener('click', () => renameGroup(id));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'mini-btn';
    deleteBtn.title = isOwner ? 'Für alle löschen' : 'Gruppe verlassen';
    deleteBtn.textContent = isOwner ? '🗑' : '🚪';
    deleteBtn.addEventListener('click', () => deleteOrLeaveGroup(id, isOwner));

    li.append(selectBtn, shareBtn, renameBtn, deleteBtn);
    groupList.appendChild(li);
  });

  renderGroupDropdown();
}

function renderGroupDropdown() {
  const ids = Object.keys(groups).sort((a, b) => (groups[a].createdAt || 0) - (groups[b].createdAt || 0));
  const prevValue = groupSelect.value;

  groupSelect.innerHTML = '<option value="">– Gruppe wählen –</option>';
  ids.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = groups[id].name || 'Ohne Namen';
    groupSelect.appendChild(opt);
  });

  groupSelect.value = activeGroupId || (ids.includes(prevValue) ? prevValue : '');
  updateGroupPickerHint();
}

function updateGroupPickerHint() {
  if (!activeGroupId || !groups[activeGroupId]) {
    groupPickerHint.textContent = 'Keine Gruppe gewählt.';
    return;
  }
  const n = (groups[activeGroupId].names || '').split('\n').map(s => s.trim()).filter(Boolean).length;
  groupPickerHint.textContent = n === 1 ? '1 Name in dieser Gruppe' : n + ' Namen in dieser Gruppe';
}

groupSelect.addEventListener('change', () => {
  if (groupSelect.value) selectGroup(groupSelect.value);
});

function selectGroup(id) {
  activeGroupId = id;
  const g = groups[id];
  activeGroupName.textContent = g ? g.name : 'Ohne Gruppe';
  workspaceSub.textContent = 'Änderungen werden automatisch gespeichert.';
  namesEl.value = (g && g.names) || '';
  namesEl.dispatchEvent(new Event('input'));
  resultsEl.innerHTML = '';
  resetCalled();
  loadSeatingFromGroup(g);
  loadDutiesFromGroup(g);
  renderGroupList();
  updateGroupPickerHint();
}

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne O/0, I/1 (Verwechslungsgefahr)
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const MAX_GROUPS = 10;

function createGroup() {
  const user = auth && auth.currentUser;
  if (!user) return;

  if (Object.keys(groups).length >= MAX_GROUPS) {
    alert('Du hast bereits ' + MAX_GROUPS + ' Gruppen. Lösche erst eine bestehende Gruppe, bevor du eine neue anlegst.');
    return;
  }

  const name = prompt('Name der neuen Gruppe (z. B. Klasse 5a):');
  if (!name || !name.trim()) return;

  const newRef = push(ref(db, 'groups'));
  const groupId = newRef.key;
  const code = generateJoinCode();

  set(newRef, {
    name: name.trim(),
    names: '',
    ownerUid: user.uid,
    joinCode: code,
    members: { [user.uid]: true },
    createdAt: Date.now(),
    updatedAt: Date.now()
  })
    .then(() => set(ref(db, 'groupCodes/' + code), { groupId }))
    .then(() => set(ref(db, 'userGroups/' + user.uid + '/' + groupId), true))
    .then(() => selectGroup(groupId));
}

function renameGroup(id) {
  const user = auth && auth.currentUser;
  if (!user) return;
  const current = groups[id];
  const name = prompt('Neuer Name für die Gruppe:', current ? current.name : '');
  if (!name || !name.trim()) return;
  set(ref(db, 'groups/' + id + '/name'), name.trim());
}

function deleteOrLeaveGroup(id, isOwner) {
  const user = auth && auth.currentUser;
  if (!user) return;
  const current = groups[id];
  const label = current ? current.name : '';

  if (isOwner) {
    if (!confirm('Gruppe "' + label + '" für ALLE Mitglieder löschen? Das kann nicht rückgängig gemacht werden.')) return;
    remove(ref(db, 'groups/' + id));
    remove(ref(db, 'userGroups/' + user.uid + '/' + id));
  } else {
    if (!confirm('Gruppe "' + label + '" verlassen? Du verlierst den Zugriff, andere Mitglieder behalten ihn.')) return;
    remove(ref(db, 'groups/' + id + '/members/' + user.uid));
    remove(ref(db, 'userGroups/' + user.uid + '/' + id));
  }

  if (activeGroupId === id) {
    activeGroupId = null;
    activeGroupName.textContent = 'Ohne Gruppe';
    workspaceSub.textContent = 'Wähle links eine Gruppe aus oder lege eine neue an.';
    namesEl.value = '';
    namesEl.dispatchEvent(new Event('input'));
    resultsEl.innerHTML = '';
  }
}

function openShareModal(groupName, code) {
  shareModalTitle.textContent = 'Gruppe teilen: ' + groupName;
  shareModalCode.textContent = code;
  shareModalCopyBtn.textContent = 'Code kopieren';
  shareModalOverlay.classList.remove('is-hidden');
}
function closeShareModal() {
  shareModalOverlay.classList.add('is-hidden');
}

function shareGroup(id) {
  const g = groups[id];
  if (!g) return;
  if (g.joinCode) {
    openShareModal(g.name || 'Ohne Namen', g.joinCode);
  } else {
    alert('Für diese Gruppe existiert noch kein Code. Bitte kurz neu laden und erneut versuchen.');
  }
}

shareModalClose.addEventListener('click', closeShareModal);
shareModalOverlay.addEventListener('click', (e) => {
  if (e.target === shareModalOverlay) closeShareModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !shareModalOverlay.classList.contains('is-hidden')) closeShareModal();
});
shareModalCopyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(shareModalCode.textContent).then(() => {
    shareModalCopyBtn.textContent = 'Kopiert!';
    setTimeout(() => { shareModalCopyBtn.textContent = 'Code kopieren'; }, 1500);
  });
});

newGroupBtn.addEventListener('click', createGroup);

// ---- Gruppe per Code beitreten ----
async function joinGroupByCode() {
  const user = auth && auth.currentUser;
  if (!user) { joinMessage.textContent = 'Bitte zuerst anmelden.'; return; }

  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) return;

  joinGroupBtn.disabled = true;
  joinMessage.textContent = 'Prüfe Code…';

  try {
    await set(ref(db, 'pendingJoinCode/' + user.uid), code);
    const snap = await get(ref(db, 'groupCodes/' + code));
    if (!snap.exists()) {
      joinMessage.textContent = 'Code nicht gefunden. Bitte prüfen.';
      joinGroupBtn.disabled = false;
      return;
    }
    const groupId = snap.val().groupId;
    await set(ref(db, 'groups/' + groupId + '/members/' + user.uid), true);
    await set(ref(db, 'userGroups/' + user.uid + '/' + groupId), true);
    joinCodeInput.value = '';
    joinMessage.textContent = 'Beigetreten!';
    setTimeout(() => { joinMessage.textContent = ''; }, 2500);
  } catch (err) {
    joinMessage.textContent = 'Beitreten fehlgeschlagen. Code prüfen oder erneut versuchen.';
  } finally {
    joinGroupBtn.disabled = false;
  }
}
joinGroupBtn.addEventListener('click', joinGroupByCode);
joinCodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGroupByCode(); });

// ================= Autosave (Namen) =================
namesEl.addEventListener('input', () => {
  const n = namesEl.value.split('\n').map(s => s.trim()).filter(Boolean).length;
  countHint.textContent = n === 1 ? '1 Name erkannt' : n + ' Namen erkannt';
  groupPickerHint.textContent = activeGroupId
    ? (n === 1 ? '1 Name in dieser Gruppe' : n + ' Namen in dieser Gruppe')
    : 'Keine Gruppe gewählt.';

  const user = auth && auth.currentUser;
  if (!user || !activeGroupId) return;

  saveIndicator.textContent = 'Tippt…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    set(ref(db, 'groups/' + activeGroupId + '/names'), namesEl.value);
    set(ref(db, 'groups/' + activeGroupId + '/updatedAt'), Date.now());
    saveIndicator.textContent = 'Gespeichert';
    setTimeout(() => { if (saveIndicator.textContent === 'Gespeichert') saveIndicator.textContent = ''; }, 1500);
  }, 700);
});

// ================= Live-Synchronisierung (userGroups-Index -> Gruppen) =================
let groupListeners = {}; // groupId -> unsubscribe function
let userGroupsUnsub = null;

function attachGroupListener(groupId) {
  if (groupListeners[groupId]) return;
  const user = auth.currentUser;
  const gRef = ref(db, 'groups/' + groupId);
  onValue(gRef, (snapshot) => {
    if (snapshot.exists()) {
      groups[groupId] = snapshot.val();
    } else {
      // Gruppe existiert nicht mehr (z. B. von Owner gelöscht) -> eigenen Index-Eintrag aufräumen
      delete groups[groupId];
      if (user) remove(ref(db, 'userGroups/' + user.uid + '/' + groupId));
      if (activeGroupId === groupId) {
        activeGroupId = null;
        activeGroupName.textContent = 'Ohne Gruppe';
        namesEl.value = '';
        namesEl.dispatchEvent(new Event('input'));
      }
    }
    renderGroupList();
  });
  groupListeners[groupId] = () => off(gRef);
}

function detachGroupListener(groupId) {
  if (groupListeners[groupId]) {
    groupListeners[groupId]();
    delete groupListeners[groupId];
  }
  delete groups[groupId];
}

function detachAllGroupListeners() {
  Object.keys(groupListeners).forEach(detachGroupListener);
}

if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (userGroupsUnsub) { userGroupsUnsub(); userGroupsUnsub = null; }
    detachAllGroupListeners();
    groups = {};
    activeGroupId = null;

    if (user) {
      accountStatus.textContent = 'Angemeldet als ' + user.email;
      authForm.style.display = 'none';
      loggedInRow.style.display = 'flex';

      const userGroupsRef = ref(db, 'userGroups/' + user.uid);
      onValue(userGroupsRef, (snapshot) => {
        const ids = snapshot.exists() ? Object.keys(snapshot.val()) : [];

        // Listener für neue Gruppen-IDs anhängen
        ids.forEach(id => attachGroupListener(id));
        // Listener für nicht mehr zugängliche Gruppen entfernen
        Object.keys(groupListeners).forEach(id => {
          if (!ids.includes(id)) {
            detachGroupListener(id);
            if (activeGroupId === id) {
              activeGroupId = null;
              activeGroupName.textContent = 'Ohne Gruppe';
              namesEl.value = '';
              namesEl.dispatchEvent(new Event('input'));
            }
          }
        });
        renderGroupList();
      });
      userGroupsUnsub = () => off(userGroupsRef);
    } else {
      accountStatus.textContent = 'Nicht angemeldet';
      authForm.style.display = 'flex';
      loggedInRow.style.display = 'none';
      activeGroupName.textContent = 'Ohne Gruppe';
      workspaceSub.textContent = 'Trage Namen ein und lose Gruppen aus. Ohne Anmeldung wird nichts gespeichert.';
      namesEl.value = '';
      namesEl.dispatchEvent(new Event('input'));
      renderGroupList();
    }
  });
}

renderGroupList();
