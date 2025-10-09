import {
  loginEmail, logout, onUser,
  col, docRef, addDoc, setDoc, getDocs, onSnapshot,
  query, orderBy, deleteDoc
} from './firebase.js';

if (window.__MANIACS_INIT__) {
  console.warn('MANIACS app already initialized — skipping duplicate init.');
} else {
  window.__MANIACS_INIT__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  let currentUser = null;
  let isAdminUI = false;
  let cachePlayers = [];

  /* Admin-Prüfung */
  async function checkAdminViaRulesProbe(user){
    if (!user) return false;
    try {
      await getDoc(docRef('meta', 'adminProbe'));
      return true;
    } catch {
      return false;
    }
  }

  /* Admin-UI ein-/ausblenden */
  function applyAdminUI(isAdmin){
    isAdminUI = isAdmin;
    $('#btn-open-player')?.classList.toggle('hidden', !isAdmin);
    $('#role-badge')?.classList.toggle('hidden', !isAdmin);
    renderPlayers(cachePlayers);
  }

  /* Spieler Dropdown befüllen */
  function renderPlayerDropdown(players){
    const mPlayerSelect = $('#m-player');
    if(!mPlayerSelect) return;
    mPlayerSelect.innerHTML = '';
    players.forEach(p=>{
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.data().name || 'Unnamed Player';
      mPlayerSelect.appendChild(opt);
    });
  }

  /* Spieler Tabellen- & Dropdown-Rendering */
  function renderPlayers(docs){
    cachePlayers = docs;
    const playersTBody = $('#players-table tbody');
    if(playersTBody){
      playersTBody.innerHTML = docs.map(d=>{
        const p = d.data();
        return `
          <tr data-id="${d.id}">
            <td>${p.name}</td>
            <td>${(p.wins||0)}-${(p.losses||0)}-${(p.draws||0)}</td>
            <td>${p.top8 || 0}</td>
            <td>${(p.decks || []).join(', ')}</td>
            <td>${isAdminUI ? `<button class="btn ghost" data-del-p="${d.id}">Löschen</button>` : ''}</td>
          </tr>`;
      }).join('');
    }
    renderPlayerDropdown(docs);
  }

  /* Eventlistener für Delete Buttons bei Admin */
  function setupPlayerDelete(){
    if(!isAdminUI) return;
    document.querySelectorAll('[data-del-p]').forEach(btn=>{
      btn.onclick = async () => {
        if(!currentUser || !isAdminUI) return;
        if(!confirm('Diesen Player wirklich löschen?')) return;
        try {
          await deleteDoc(docRef('players', btn.dataset.delP));
        } catch(e){
          alert('Fehler beim Löschen: ' + (e.message || e));
        }
      };
    });
  }

  /* Player-Formular Submission */
  $('#player-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    if(!currentUser) return alert('Bitte zuerst einloggen.');
    if(!isAdminUI) return alert('Nur Admins dürfen Players anlegen.');

    const name = $('#p-name').value.trim();
    const decks = $('#p-decks').value.split(',').map(s=>s.trim()).filter(Boolean);

    if(!name){
      alert('Name darf nicht leer sein.');
      return;
    }

    try {
      await addDoc(col('players'), {name, decks, wins:0, losses:0, draws:0, top8:0});
      e.target.reset();
      $('#player-modal')?.close?.() || $('#player-modal').removeAttribute('open');
    } catch (err){
      alert('Fehler beim Anlegen: ' + (err.message || err));
    }
  });

  /* Match-Formular Submission */
  $('#match-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    if(!currentUser) return alert('Login erforderlich.');

    const playerSelect = $('#m-player');
    if(!playerSelect.value){
      alert('Bitte Player auswählen.');
      return;
    }

    const m = {
      date: $('#m-date').value || new Date().toISOString().slice(0,10),
      playerId: playerSelect.value,
      player: playerSelect.selectedOptions[0]?.textContent || '',
      deck: $('#m-deck').value.trim(),
      opp: $('#m-opp').value.trim(),
      res: $('#m-res').value,
      tier: $('#m-tier').value,
      event: $('#m-event').value.trim()
    };

    try {
      await addDoc(col('matches'), m);
      e.target.reset();
    } catch(err){
      alert('Fehler beim Speichern: ' + (err.message || err));
    }
  });

  /* Login-Formular */
  $('#login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#login-email').value.trim();
    const pass = $('#login-pass').value;
    try {
      await loginEmail(email, pass);
      $('#login-pass').value = '';
    } catch (err) {
      alert('Login fehlgeschlagen: ' + (err.message || err));
    }
  });

  /* Logout Button */
  $('#btn-logout')?.addEventListener('click', logout);

  /* User-Status Überwachung */
  onUser(async user => {
    currentUser = user || null;

    $('#user-info').textContent = user ? user.email : '';
    $('#btn-logout')?.classList.toggle('hidden', !user);
    $('#login-form')?.classList.toggle('hidden', !!user);

    if(!user) $('#role-badge')?.classList.add('hidden');

    document.body.classList.toggle('readonly', !user);

    $('#matches-form-card')?.classList.toggle('hidden', !user);
    $('#matches-list-card')?.classList.toggle('mx-center', !user);
    $('#events-form-card')?.classList.toggle('hidden', !user);
    $('#events-list-card')?.classList.toggle('mx-center', !user);

    const admin = await checkAdminViaRulesProbe(user);
    applyAdminUI(admin);
  });

  /* Spieler-Liveupdates */
  onSnapshot(query(col('players'), orderBy('name')), snap => {
    const docs = [];
    snap.forEach(d => docs.push(d));
    renderPlayers(docs);
    setupPlayerDelete();
  });

  /* Matches und Events etc. können analog implementiert werden */
}
