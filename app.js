// MANIACS · COMPETE — app.js (FINAL)
// - Init-Guard
// - Admin via rules-probe (read /meta/adminProbe)
// - Live-Rendering + Caches (Buttons sofort korrekt nach Admin-Wechsel)
// - iOS/Safari-sicheres Player-Dropdown im Match-Form
// - Form-Debounce, keine Tab-Sprünge, sauberes Reset
// - CSV-Exporte

import {
  loginEmail, logout, onUser,
  col, docRef, addDoc, setDoc, getDocs, onSnapshot,
  query, orderBy, deleteDoc, getDoc
} from './firebase.js';

// ===== Init Guard =====
if (window.__MANIACS_INIT__) {
  console.warn('MANIACS app already initialized — skipping duplicate init.');
} else {
  window.__MANIACS_INIT__ = true;

  /* ------------------ Helpers ------------------ */
  const $  = (s)=>document.querySelector(s);
  const $$ = (s)=>[...document.querySelectorAll(s)];

  function setActiveTab(id){
    $$('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===id));
    $$('.view').forEach(v=>v.classList.toggle('active', v.id===`view-${id}`));
  }
  $$('.tab').forEach(t=>t.addEventListener('click',()=>setActiveTab(t.dataset.tab)));

  /* ------------------ Rotate Tip (Mobile) ------------------ */
  (function(){
    const tip = document.getElementById('rotate-tip');
    if(!tip) return;
    const mqPortrait = window.matchMedia('(orientation: portrait)');
    const mqSmall    = window.matchMedia('(max-width: 700px)');
    const update = ()=>{
      const show = mqSmall.matches && mqPortrait.matches;
      tip.classList.toggle('show', show);
      tip.setAttribute('aria-hidden', show ? 'false' : 'true');
    };
    update();
    const onCh = ()=>setTimeout(update, 50);
    (mqPortrait.addEventListener||mqPortrait.addListener).call(mqPortrait,'change',onCh);
    (mqSmall.addEventListener||mqSmall.addListener).call(mqSmall,'change',onCh);
    window.addEventListener('resize', update, { passive:true });
    window.addEventListener('orientationchange', ()=>setTimeout(update, 100), { passive:true });
    document.addEventListener('visibilitychange', update);
  })();

  /* ------------------ CSV helpers ------------------ */
  function csvEscape(v){ if(v==null) return ''; const s=String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
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

  // Caches für sofortiges Re-Rendern nach Admin-Wechsel
  let cachePlayers = [];
  let cacheMatches = [];
  let cacheEvents  = [];
  let cacheSponsors= [];

  async function checkAdminViaRulesProbe(user){
    if (!user) return false;
    try {
      await getDoc(docRef('meta', 'adminProbe')); // nur Admins dürfen das lesen
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
    document.getElementById('role-badge')?.classList.toggle('hidden', !isAdmin);
    // Re-render, damit Delete-Buttons sofort korrekt sind
    renderPlayers(cachePlayers);
    renderMatches(cacheMatches);
    renderEvents(cacheEvents);
    renderSponsors(cacheSponsors);
  }

  /* ------------------ Auth ------------------ */
  $('#login-form')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email=$('#login-email').value.trim(); const pass=$('#login-pass').value;
    try{
      await loginEmail(email,pass);
      $('#login-pass').value='';
    } catch(err){
      alert('Login fehlgeschlagen: '+(err.message||err));
    }
  });
  $('#btn-logout')?.addEventListener('click', logout);

  onUser(async (user)=>{
    currentUser = user || null;

    $('#user-info').textContent = user ? user.email : '';
    $('#btn-logout')?.classList.toggle('hidden', !user);
    $('#login-form')?.classList.toggle('hidden', !!user);

    // Read-only Layout
    const isLoggedIn = !!user;
    document.body.classList.toggle('readonly', !isLoggedIn);
    $('#matches-form-card')?.classList.toggle('hidden', !isLoggedIn);
    $('#matches-list-card')?.classList.toggle('mx-center', !isLoggedIn);
    $('#events-form-card')?.classList.toggle('hidden', !isLoggedIn);
    $('#events-list-card')?.classList.toggle('mx-center', !isLoggedIn);

    // Admin via Rules
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

  // Submit-Debounce Flags
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
      const name = ($('#p-name')?.value||'').trim();
      const decks = (($('#p-decks')?.value)||'').split(',').map(s=>s.trim()).filter(Boolean);
      if(!name) return;
      await addDoc(col(C_PLAYERS), {name,wins:0,losses:0,draws:0,top8:0,decks});
      e.target.reset();
      playerModal?.close?.();
    } finally {
      submitting.player = false;
      btn?.removeAttribute('disabled');
    }
  });

  /* ------------------ RENDERERS ------------------ */

  // --- Players & Dropdown ---
  const mPlayerSelect = $('#m-player');
  const playersTBody  = $('#players-table tbody');

  function fillPlayerSelect(playersDocs){
    if (!mPlayerSelect) return;

    const prev = mPlayerSelect.value;
    let html = '<option value="">– Player wählen –</option>';
    playersDocs.forEach(d=>{
      const p = d.data() || {};
      const name = (p.name || '').trim() || 'Unbenannt';
      html += `<option value="${d.id}" data-name="${name}">${name}</option>`;
    });
    mPlayerSelect.innerHTML = html;

    if (prev && [...mPlayerSelect.options].some(o=>o.value === prev)) {
      mPlayerSelect.value = prev;
    } else if (playersDocs.length === 1) {
      mPlayerSelect.value = playersDocs[0].id;
    } else {
      mPlayerSelect.value = "";
    }

    // iOS/Safari: sichere Klickbarkeit & native UI
    mPlayerSelect.disabled = false;
    mPlayerSelect.style.webkitAppearance = 'menulist-button';
    mPlayerSelect.style.appearance = 'menulist';
    mPlayerSelect.style.pointerEvents = 'auto';
    mPlayerSelect.style.position = 'relative';
    mPlayerSelect.style.zIndex = '5';

    setTimeout(()=>{
      const sel = mPlayerSelect.options[mPlayerSelect.selectedIndex] || null;
      mPlayerSelect.dataset.selectedName = sel ? (sel.dataset.name || sel.textContent || "") : "";
      mPlayerSelect.dispatchEvent(new Event('change', { bubbles:true }));
    }, 0);

    const openNativePicker = () => { try{ mPlayerSelect.focus(); }catch{} try{ mPlayerSelect.click(); }catch{} };
    if (!mPlayerSelect.__wiredTap) {
      mPlayerSelect.addEventListener('touchstart', openNativePicker, { passive:true });
      mPlayerSelect.addEventListener('pointerdown', openNativePicker, { passive:true });
      mPlayerSelect.__wiredTap = true;
    }
  }

  function renderPlayers(docs){
    cachePlayers = docs;

    if (playersTBody) {
      const rows=[]; let tw=0, t8=0;
      docs.forEach(d=>{
        const p={id:d.id, ...d.data()};
        const g=(p.wins||0)+(p.losses||0)+(p.draws||0);
        const pct=g?Math.round((p.wins||0)/g*100):0;
        rows.push(`
          <tr data-id="${p.id}">
            <td>${p.name||''}</td>
            <td>${p.wins||0}-${p.losses||0}-${p.draws||0} <span class="pill ${pct>=55?'ok':pct>=45?'warn':'bad'}">${pct}%</span></td>
            <td>${p.top8||0}</td>
            <td>${(p.decks||[]).join(', ')}</td>
            <td>${isAdminUI ? `<button class="btn ghost" data-del-p="${p.id}">Löschen</button>` : ''}</td>
          </tr>
        `);
        tw+=(p.wins||0); t8+=(p.top8||0);
      });
      playersTBody.innerHTML = rows.join('');
      $('#kpi-players') && ($('#kpi-players').textContent = docs.length);
      $('#kpi-wins')    && ($('#kpi-wins').textContent = tw);
      $('#kpi-top8')    && ($('#kpi-top8').textContent = t8);

      if (isAdminUI) {
        document.querySelectorAll('[data-del-p]').forEach(b=>{
          b.onclick = async ()=>{
            if(!currentUser || !isAdminUI) return;
            if(!confirm('Diesen Player wirklich löschen?')) return;
            try { await deleteDoc(docRef(C_PLAYERS, b.dataset.delP)); }
            catch(err){ alert('Fehler beim Löschen: '+(err.message||err)); }
          };
        });
      }
    }

    // entscheidend: Dropdown befüllen
    fillPlayerSelect(docs);
  }

  // --- Matches ---
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

  function renderMatches(docs){
    cacheMatches = docs;

    // Dashboard "Last Matches"
    const latestTBody = document.querySelector('#latest-results tbody');
    if (latestTBody) {
      const latest=[]; const maxRows=6;
      for (const d of docs) {
        const m=d.data();
        latest.push(`
          <tr>
            <td>${m.player || ''}</td>
            <td>${m.deck || ''}</td>
            <td>${m.opp  || ''}</td>
            <td>${m.res  || ''}</td>
          </tr>
        `);
        if (latest.length>=maxRows) break;
      }
      latestTBody.innerHTML = latest.length
        ? latest.join('')
        : `<tr><td colspan="4" class="muted">Noch keine Matches erfasst.</td></tr>`;
    }

    // Matches-Tab
    const matchesTBody = document.querySelector('#matches-table tbody');
    if (matchesTBody) {
      const rows=[]; let teamW=0, teamL=0, teamD=0;
      const deckWinCounts={};

      docs.forEach(d=>{
        const m=d.data();
        rows.push(`
          <tr data-id="${d.id}">
            <td>${m.date||''}</td>
            <td>${m.player||''}</td>
            <td>${m.deck||''}</td>
            <td>${m.opp ||''}</td>
            <td>${m.res ||''}</td>
            <td>${(tierToText(m.tier)||'')}${m.event ? ` <span class="muted">– ${m.event}</span>` : ''}</td>
            <td>${isAdminUI ? `<button class="btn ghost" data-del-match="${d.id}" data-player-id="${m.playerId||''}">Löschen</button>` : ''}</td>
          </tr>
        `);

        if(m.res==='W') teamW++; else if(m.res==='L') teamL++; else if(m.res==='D') teamD++;
        if(m.res==='W' && m.deck){ const key=m.deck.trim(); if(key) deckWinCounts[key]=(deckWinCounts[key]||0)+1; }
      });

      matchesTBody.innerHTML = rows.join('');

      if (isAdminUI) {
        document.querySelectorAll('[data-del-match]').forEach(b=>{
          b.onclick = async ()=>{
            if(!currentUser || !isAdminUI) return;
            const pid = b.dataset.playerId || '';
            await deleteDoc(docRef(C_MATCHES, b.dataset.delMatch));
            if (pid) await recomputePlayerStats(pid);
          };
        });
      }

      // Team summary (falls vorhanden)
      const teamSummaryEl = document.getElementById('team-summary');
      const topDeckEl     = document.getElementById('top-deck-list');
      if (teamSummaryEl) {
        const wlExisting = teamSummaryEl.querySelector('[data-stat="wld"]');
        const wlLi = wlExisting || document.createElement('li');
        wlLi.setAttribute('data-stat','wld');
        wlLi.innerHTML = `<strong>Team Record</strong><span class="grow"></span>${teamW}-${teamL}-${teamD}`;
        if (!wlExisting) teamSummaryEl.appendChild(wlLi);
      }
      if (topDeckEl) {
        topDeckEl.innerHTML = '';
        const best = Object.entries(deckWinCounts).sort((a,b)=>b[1]-a[1])[0];
        if (best) {
          const li = document.createElement('li');
          li.innerHTML = `<strong>${best[0]}</strong><span class="grow"></span>${best[1]} Wins`;
          topDeckEl.appendChild(li);
        } else {
          const li = document.createElement('li');
          li.className = 'muted';
          li.textContent = 'Noch keine Siege erfasst.';
          topDeckEl.appendChild(li);
        }
      }
    }
  }

  // --- Events ---
  function renderEvents(docs){
    cacheEvents = docs;
    const eventsBody = $('#events-table tbody');
    if (!eventsBody) return;

    const rows=[];
    docs.forEach(d=>{
      const e=d.data();
      rows.push(`
        <tr data-id="${d.id}">
          <td>${e.date||''}</td>
          <td>${e.name||''}</td>
          <td>${e.loc||''}</td>
          <td>${e.type||''}</td>
          <td>${isAdminUI ? `<button class="btn ghost" data-del-event="${d.id}">Löschen</button>` : ''}</td>
        </tr>
      `);
    });
    eventsBody.innerHTML = rows.join('');

    if (isAdminUI) {
      document.querySelectorAll('[data-del-event]').forEach(b=>{
        b.onclick = async ()=>{
          if(!currentUser || !isAdminUI) return;
          await deleteDoc(docRef(C_EVENTS, b.dataset.delEvent));
        };
      });
    }
  }

  // --- Sponsors ---
  function renderSponsors(docs){
    cacheSponsors = docs;
    const sponsList = $('#sponsor-list');
    if (!sponsList) return;

    const items=[];
    docs.forEach(d=>{
      const s={id:d.id, ...d.data()};
      const host = s.url ? new URL(s.url).host : '—';
      items.push(`
        <li data-id="${s.id}">
          <strong>${s.name}</strong>
          <a class="muted" href="${s.url||'#'}" target="_blank" rel="noopener">${host}</a>
          <span class="grow"></span>
          ${isAdminUI ? `<button class="btn ghost" data-del-s="${s.id}">Entfernen</button>` : ''}
        </li>
      `);
    });
    sponsList.innerHTML = items.join('');

    if (isAdminUI) {
      document.querySelectorAll('[data-del-s]').forEach(b=>{
        b.onclick = async ()=>{
          if(!currentUser || !isAdminUI) return;
          await deleteDoc(docRef(C_SPONS, b.dataset.delS));
        };
      });
    }
  }

  /* ------------------ Snapshots (live) ------------------ */
  onSnapshot(query(col(C_PLAYERS), orderBy('name')), (snap)=>{
    const docs = []; snap.forEach(d=>docs.push(d));
    renderPlayers(docs);
  });

  onSnapshot(query(col(C_MATCHES), orderBy('date','desc')), (snap)=>{
    const docs = []; snap.forEach(d=>docs.push(d));
    renderMatches(docs);
  });

  onSnapshot(query(col(C_EVENTS), orderBy('date','asc')), (snap)=>{
    const docs = []; snap.forEach(d=>docs.push(d));
    renderEvents(docs);
  });

  onSnapshot(col(C_SPONS), (snap)=>{
    const docs = []; snap.forEach(d=>docs.push(d));
    renderSponsors(docs);
  });

  /* ------------------ Recompute Player Stats ------------------ */
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
    const pRef = docRef(C_PLAYERS, playerId);

    // bestehende Felder beibehalten
    const playersSnap = await getDocs(query(col(C_PLAYERS)));
    for (const d of playersSnap.docs) {
      if (d.id === playerId) {
        const p = d.data();
        await setDoc(pRef, { ...p, wins, losses, draws, decks: [...decksSet] });
      }
    }
  }

  /* ------------------ Forms ------------------ */
  $('#match-form')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(submitting.match) return;
    if(!currentUser) return alert('Login erforderlich.');

    const btn = e.submitter || $('#match-form button[type="submit"]');
    const sel = $('#m-player');
    const opt = sel?.options[sel?.selectedIndex || 0];
    const playerId   = opt?.value || "";
    const playerName = (opt?.dataset?.name || opt?.textContent || "").trim();

    if (!playerId) {
      alert('Bitte zuerst einen Player wählen.');
      sel?.focus();
      return;
    }

    const m={
      date: $('#m-date').value || new Date().toISOString().slice(0,10),
      playerId, player:playerName,
      deck: $('#m-deck').value.trim(),
      opp:  $('#m-opp').value.trim(),
      res:  $('#m-res').value,
      tier: $('#m-tier').value,
      event: $('#m-event').value.trim()
    };

    try{
      submitting.match = true;
      btn?.setAttribute('disabled','disabled');
      await addDoc(col(C_MATCHES), m);
      if (playerId) await recomputePlayerStats(playerId);
      e.target.reset();                 // auf dem Tab bleiben
      if (sel) {                        // Platzhalter wieder setzen
        sel.selectedIndex = 0;
        sel.dispatchEvent(new Event('change', { bubbles:true }));
      }
    } finally {
      submitting.match = false;
      btn?.removeAttribute('disabled');
    }
  });

  $('#event-form')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!currentUser) return alert('Login erforderlich.');
    const ev={
      name: $('#ev-name').value.trim(),
      date: $('#ev-date').value,
      loc:  $('#ev-loc').value.trim(),
      type: $('#ev-type').value
    };
    await addDoc(col(C_EVENTS), ev);
    e.target.reset();
  });

  $('#sponsor-form')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!currentUser) return alert('Login erforderlich.');
    if(!isAdminUI)   return alert('Nur Admins dürfen Sponsoren speichern.');
    const s={ name:$('#sp-name').value.trim(), url:$('#sp-url').value.trim() };
    await addDoc(col(C_SPONS), s);
    e.target.reset();
  });

  /* ------------------ Exports ------------------ */
  $('#export-players')?.addEventListener('click', async ()=>{
    const snap=await getDocs(query(col(C_PLAYERS), orderBy('name'))); const rows=[];
    snap.forEach(d=>{
      const p={id:d.id,...d.data()}; const g=(p.wins||0)+(p.losses||0)+(p.draws||0);
      rows.push({ name:p.name||'', wins:p.wins||0, losses:p.losses||0, draws:p.draws||0, win_pct:g?Math.round((p.wins||0)/g*100):0, top8:p.top8||0, decks:(p.decks||[]).join(', ') });
    });
    downloadCSV('players.csv', rows, ['name','wins','losses','draws','win_pct','top8','decks']);
  });

  $('#export-matches')?.addEventListener('click', async ()=>{
    const snap=await getDocs(query(col(C_MATCHES), orderBy('date','desc'))); const rows=[];
    snap.forEach(d=>{
      const m=d.data();
      rows.push({
        date:m.date||'', player:m.player||'', playerId:m.playerId||'',
        deck:m.deck||'', opponent:m.opp||'', result:m.res||'',
        tier: tierToText(m.tier||''), event:m.event||''
      });
    });
    downloadCSV('matches.csv', rows, ['date','player','playerId','deck','opponent','result','tier','event']);
  });

  $('#export-events')?.addEventListener('click', async ()=>{
    const snap=await getDocs(query(col(C_EVENTS), orderBy('date','asc'))); const rows=[];
    snap.forEach(d=>{
      const e=d.data(); rows.push({ date:e.date||'', name:e.name||'', location:e.loc||'', type:e.type||'' });
    });
    downloadCSV('events.csv', rows, ['date','name','location','type']);
  });

  $('#export-sponsors')?.addEventListener('click', async ()=>{
    const snap=await getDocs(col(C_SPONS)); const rows=[];
    snap.forEach(d=>{
      const s=d.data(); const host=s.url?new URL(s.url).host:'';
      rows.push({ name:s.name||'', url:s.url||'', host });
    });
    downloadCSV('sponsors.csv', rows, ['name','url','host']);
  });

  $('#export-stats')?.addEventListener('click', async ()=>{
    const ps=await getDocs(col(C_PLAYERS)); const players=[]; ps.forEach(d=>players.push({id:d.id,...d.data()}));
    const total_players=players.length;
    const total_wins=players.reduce((a,p)=>a+(p.wins||0),0);
    const total_top8=players.reduce((a,p)=>a+(p.top8||0),0);
    const rows=[
      {metric:'total_players', value: total_players},
      {metric:'total_wins',    value: total_wins},
      {metric:'total_top8',    value: total_top8},
      {metric:'generated_at',  value: new Date().toISOString()}
    ];
    downloadCSV('stats.csv', rows, ['metric','value']);
  });

} // end init-guard
