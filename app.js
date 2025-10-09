// MANIACS · COMPETE — app.js (final stable admin+snapshot fix)
import {
  loginEmail, logout, onUser,
  col, docRef, addDoc, setDoc, getDocs, onSnapshot,
  query, orderBy, deleteDoc, getDoc
} from './firebase.js';

// ===== Global Init Guard =====
if (window.__MANIACS_INIT__) {
  console.warn('MANIACS app already initialized — skipping duplicate init.');
} else {
  window.__MANIACS_INIT__ = true;

  /* ------------------ Helpers ------------------ */
  const $  = (s)=>document.querySelector(s);
  const $$ = (s)=>[...document.querySelectorAll(s)];
  function setActiveTab(id){
    $$('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===id));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${id}`));
  }
  $$('.tab').forEach(t=>t.addEventListener('click',()=>setActiveTab(t.dataset.tab)));

  /* ------------------ Rotate Tip (Mobile) ------------------ */
  (function(){
    const tip = document.getElementById('rotate-tip');
    if(!tip) return;
    const mqPortrait = window.matchMedia('(orientation: portrait)');
    const mqSmall = window.matchMedia('(max-width: 700px)');
    function updateRotateTip(){
      const show = mqSmall.matches && mqPortrait.matches;
      tip.classList.toggle('show', show);
    }
    updateRotateTip();
    const onPortrait = ()=>updateRotateTip();
    const onSmall = ()=>updateRotateTip();
    mqPortrait.addEventListener?.('change', onPortrait);
    mqSmall.addEventListener?.('change', onSmall);
    window.addEventListener('resize', updateRotateTip, { passive:true });
  })();

  // CSV helpers
  function csvEscape(v){ if(v==null) return ''; const s=String(v); return /[",\n;]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }
  function toCSV(rows, order){
    const bom='\uFEFF';
    const headers = order || Object.keys(rows[0]||{});
    const head = headers.map(csvEscape).join(';');
    const body = rows.map(r=>headers.map(h=>csvEscape(r[h])).join(';')).join('\n');
    return bom + head + '\n' + body;
  }
  function downloadCSV(filename, rows, order){
    const blob = new Blob([toCSV(rows,order)], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  /* ------------------ Admin via Rules-Probe ------------------ */
  let currentUser = null;
  let isAdminUI = false;

  async function checkAdminViaRulesProbe(user){
    if (!user) return false;
    try {
      await getDoc(docRef('meta', 'adminProbe'));
      return true;
    } catch {
      return false;
    }
  }

  function applyAdminUI(isAdmin){
    isAdminUI = isAdmin;
    $('#sponsor-form')?.classList.toggle('hidden', !isAdmin);
    $('#sponsor-form-card')?.classList.toggle('hidden', !isAdmin);
    $('#btn-open-player')?.classList.toggle('hidden', !isAdmin);
    const badge = document.getElementById('role-badge');
    if (badge) badge.classList.toggle('hidden', !isAdmin);
  }

  /* ------------------ Auth ------------------ */
  $('#login-form')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email=$('#login-email').value.trim(); const pass=$('#login-pass').value;
    try{ await loginEmail(email,pass); $('#login-pass').value=''; }
    catch(err){ alert('Login fehlgeschlagen: '+(err.message||err)); }
  });
  $('#btn-logout')?.addEventListener('click', logout);

  onUser(async (user)=>{
    currentUser = user || null;

    $('#user-info').textContent = user ? user.email : '';
    $('#btn-logout')?.classList.toggle('hidden', !user);
    $('#login-form')?.classList.toggle('hidden', !!user);
    document.getElementById('role-badge')?.classList.toggle('hidden', !user);

    const isLoggedIn = !!user;
    document.body.classList.toggle('readonly', !isLoggedIn);
    $('#matches-form-card')?.classList.toggle('hidden', !isLoggedIn);
    $('#matches-list-card')?.classList.toggle('mx-center', !isLoggedIn);
    $('#events-form-card')?.classList.toggle('hidden', !isLoggedIn);
    $('#events-list-card')?.classList.toggle('mx-center', !isLoggedIn);

    const admin = await checkAdminViaRulesProbe(user);
    applyAdminUI(admin);
  });

  /* ------------------ Collections ------------------ */
  const C_PLAYERS='players', C_MATCHES='matches', C_EVENTS='events', C_SPONS='sponsors';

  /* ------------------ Player Modal ------------------ */
  const playerModal = $('#player-modal');
  function openPlayerModal(){
    if(!currentUser) return alert('Bitte zuerst einloggen.');
    if(!isAdminUI)   return alert('Nur Admins dürfen Players anlegen.');
    try{ playerModal.showModal(); }
    catch{ playerModal.setAttribute('open',''); }
  }
  $('#btn-open-player')?.addEventListener('click', openPlayerModal);

  const submitting = { player:false, match:false };

  $('#player-form')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(submitting.player) return;
    if(!currentUser) return alert('Login erforderlich.');
    if(!isAdminUI)   return alert('Nur Admins dürfen Players speichern.');

    const btn = e.submitter || $('#player-form button[type="submit"]');
    try{
      submitting.player = true;
      btn?.setAttribute('disabled','disabled');
      const name=$('#p-name').value.trim();
      const decks=$('#p-decks').value.split(',').map(s=>s.trim()).filter(Boolean);
      if(!name) return;
      await addDoc(col(C_PLAYERS), {name,wins:0,losses:0,draws:0,top8:0,decks});
      e.target.reset();
      playerModal.close?.();
    } finally {
      submitting.player = false;
      btn?.removeAttribute('disabled');
    }
  });

  const playersTBody=$('#players-table tbody'); 
  const mPlayerSelect=$('#m-player');
  const teamSummaryEl = $('#team-summary');
  const topDeckEl = $('#top-deck-list');

  function attachPlayerDeleteButtons(){
    $$('[data-del-p]').forEach(b=>{
      b.onclick = async ()=>{
        if(!currentUser) return alert('Login erforderlich.');
        if(!isAdminUI)   return alert('Keine Adminrechte.');
        if(!confirm('Diesen Player wirklich löschen?')) return;
        try { await deleteDoc(docRef(C_PLAYERS, b.dataset.delP)); }
        catch(err){ alert('Fehler beim Löschen: '+(err.message||err)); }
      };
    });
  }

  /* ------------------ Live Player Snapshot ------------------ */
  onSnapshot(query(col(C_PLAYERS), orderBy('name')), (snap)=>{
    const rows=[], opts=[]; let tw=0, t8=0;
    snap.forEach(d=>{
      const p={id:d.id, ...d.data()};
      const g=(p.wins||0)+(p.losses||0)+(p.draws||0);
      const pct=g?Math.round((p.wins||0)/g*100):0;
      rows.push(`
        <tr>
          <td>${p.name}</td>
          <td>${p.wins||0}-${p.losses||0}-${p.draws||0}</td>
          <td><span class="pill ${pct>=55?'ok':pct>=45?'warn':'bad'}">${pct}%</span></td>
          <td>${(p.decks||[]).join(', ')}</td>
          <td>${p.top8||0}</td>
          <td>${isAdminUI ? `<button class="btn ghost" data-del-p="${p.id}">Löschen</button>` : ''}</td>
        </tr>
      `);
      opts.push(`<option value="${p.id}" data-name="${p.name}">${p.name}</option>`);
      tw+=(p.wins||0); t8+=(p.top8||0);
    });
    playersTBody.innerHTML = rows.join('');
    mPlayerSelect.innerHTML = opts.join('');
    $('#kpi-players').textContent = snap.size;
    $('#kpi-wins').textContent = tw;
    $('#kpi-top8').textContent = t8;
    attachPlayerDeleteButtons();
  });

  /* ------------------ Matches ------------------ */
  function tierToText(code){
    switch(code){
      case 'L': return 'Local';
      case 'R': return 'Regional';
      case 'I': return 'International';
      case 'C': return 'Challenge';
      case 'S': return 'Special';
      case 'W': return 'Worlds';
      default: return '';
    }
  }

  async function recomputePlayerStats(playerId){
    if(!playerId) return;
    const allMatchesSnap = await getDocs(query(col(C_MATCHES), orderBy('date','desc')));
    let wins=0, losses=0, draws=0; const decksSet = new Set();
    allMatchesSnap.forEach(doc=>{
      const m = doc.data();
      if (m.playerId !== playerId) return;
      if(m.res==='W') wins++; else if(m.res==='L') losses++; else if(m.res==='D') draws++;
      if(m.deck) decksSet.add(String(m.deck).trim());
    });
    const playersSnap = await getDocs(query(col(C_PLAYERS)));
    for (const d of playersSnap.docs) {
      if (d.id === playerId) {
        const p = d.data();
        await setDoc(docRef(C_PLAYERS, playerId), { ...p, wins, losses, draws, decks: [...decksSet] });
      }
    }
  }

  // ✅ Fix: Match speichern ohne Tab-Wechsel oder Reload
  const matchForm = document.getElementById('match-form');
  if (matchForm) {
    matchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if(submitting.match) return;
      if(!currentUser) return alert('Login erforderlich.');

      const btn = e.submitter || matchForm.querySelector('button[type="submit"]');
      const opt = document.querySelector('#m-player')?.selectedOptions[0];
      const playerId = opt?.value || '';
      const playerName = opt?.dataset.name || '';

      const m = {
        date: document.getElementById('m-date').value || new Date().toISOString().slice(0,10),
        playerId,
        player: playerName,
        deck: document.getElementById('m-deck').value.trim(),
        opp: document.getElementById('m-opp').value.trim(),
        res: document.getElementById('m-res').value,
        tier: document.getElementById('m-tier').value,
        event: document.getElementById('m-event').value.trim()
      };

      try {
        submitting.match = true;
        btn?.setAttribute('disabled', 'disabled');
        btn.textContent = 'Speichere...';
        await addDoc(col(C_MATCHES), m);
        if (playerId) await recomputePlayerStats(playerId);
        matchForm.reset();
        btn.textContent = 'Gespeichert ✅';
        setTimeout(() => (btn.textContent = 'Match speichern'), 1500);
      } catch (err) {
        alert('Fehler beim Speichern: ' + (err.message || err));
      } finally {
        submitting.match = false;
        btn?.removeAttribute('disabled');
      }
    });
  }

  // Live-Snapshot: Matches automatisch aktualisieren
  const matchesTBody = document.querySelector('#matches-table tbody');
  onSnapshot(query(col(C_MATCHES), orderBy('date','desc')), (snap)=>{
    const rows = [];
    snap.forEach(d=>{
      const m = d.data();
      rows.push(`
        <tr>
          <td>${m.date||''}</td>
          <td>${m.player||''}</td>
          <td>${m.deck||''}</td>
          <td>${m.opp||''}</td>
          <td>${m.res||''}</td>
          <td>${tierToText(m.tier)||''}${m.event ? ` <span class="muted">– ${m.event}</span>` : ''}</td>
          <td>${isAdminUI ? `<button class="btn ghost" data-del-match="${d.id}" data-player-id="${m.playerId||''}">Löschen</button>` : ''}</td>
        </tr>
      `);
    });
    matchesTBody.innerHTML = rows.join('');

    // Admin-Löschen
    $$('[data-del-match]').forEach(b=>b.addEventListener('click', async ()=>{
      if(!currentUser) return alert('Login erforderlich.');
      if(!isAdminUI)   return alert('Keine Adminrechte.');
      const pid = b.dataset.playerId || '';
      if (!confirm('Diesen Match-Eintrag wirklich löschen?')) return;
      await deleteDoc(docRef(C_MATCHES, b.dataset.delMatch));
      if (pid) await recomputePlayerStats(pid);
    }));
  });
