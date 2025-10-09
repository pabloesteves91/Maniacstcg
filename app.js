// MANIACS · COMPETE — app.js (Login-only, Tabs minimal, Player-Delete fix, Owner-Rechte)

import {
  loginEmail, logout, onUser,
  col, docRef, addDoc, setDoc, getDocs, onSnapshot,
  query, orderBy, deleteDoc
} from './firebase.js';

/* ===== Helpers & Tabs ===== */
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>[...document.querySelectorAll(s)];

function setActiveTab(id){
  $$('.tab')?.forEach(t=>t.classList.toggle('active', t.dataset.tab===id));
  $$('.view')?.forEach(v=>v.classList.toggle('active', v.id===`view-${id}`));
}
$$('.tab')?.forEach(t=>t.addEventListener('click',()=>setActiveTab(t.dataset.tab)));

const OWNER_EMAIL = "fabioberta@me.com";

/* ===== CSV helpers ===== */
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

/* ===== Auth ===== */
$('#login-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email=$('#login-email').value.trim(); const pass=$('#login-pass').value;
  try{ await loginEmail(email,pass); $('#login-pass').value=''; }
  catch(err){ alert('Login fehlgeschlagen: '+(err.message||err)); }
});
$('#btn-logout')?.addEventListener('click', logout);

let currentUser=null;
onUser(async (user)=>{
  currentUser = user || null;

  // Header UI
  $('#user-info').textContent = user ? user.email : '';
  $('#btn-logout')?.classList.toggle('hidden', !user);
  $('#login-form')?.classList.toggle('hidden', !!user);

  const isLoggedIn = !!user;
  document.body.classList.toggle('readonly', !isLoggedIn);

  // Matches
  $('#matches-form-card')?.classList.toggle('hidden', !isLoggedIn);
  $('#matches-list-card')?.classList.toggle('mx-center', !isLoggedIn);

  // Events
  $('#events-form-card')?.classList.toggle('hidden', !isLoggedIn);
  $('#events-list-card')?.classList.toggle('mx-center', !isLoggedIn);

  // Owner-Bereiche
  const isOwner = !!(user && user.email===OWNER_EMAIL);
  $('#sponsor-form')?.classList.toggle('hidden', !isOwner);
  $('#sponsor-form-card')?.classList.toggle('hidden', !isOwner);
  $('#btn-open-player')?.classList.toggle('hidden', !isOwner);
});

/* ===== Collections ===== */
const C_PLAYERS='players', C_MATCHES='matches', C_EVENTS='events', C_SPONS='sponsors';

/* ===== Player Modal ===== */
const playerModal = $('#player-modal');
function openPlayerModal(){
  if(!currentUser) return alert('Bitte zuerst einloggen.');
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
  if(currentUser.email !== OWNER_EMAIL) return alert('Nur Fabio darf Players speichern.');
  const btn = e.submitter || $('#player-form button[type="submit"]');
  try{
    submitting.player = true; btn?.setAttribute('disabled','disabled');
    const name=$('#p-name').value.trim();
    const decks=$('#p-decks').value.split(',').map(s=>s.trim()).filter(Boolean);
    if(!name) return;
    await addDoc(col(C_PLAYERS), {name,wins:0,losses:0,draws:0,top8:0,decks});
    e.target.reset(); playerModal.close?.();
  } finally { submitting.player=false; btn?.removeAttribute('disabled'); }
});

/* ===== Team Stats Targets ===== */
const teamSummaryEl = document.getElementById('team-summary');
const topDeckEl     = document.getElementById('top-deck-list');

/* ===== Players ===== */
const playersTBody=$('#players-table tbody');
const mPlayerSelect=$('#m-player');

function attachPlayerDeleteButtons(){
  $$('[data-del-p]').forEach(b=>{
    b.onclick = async ()=>{
      if(!currentUser) return alert('Login erforderlich.');
      if(currentUser.email !== OWNER_EMAIL) return alert('Nur Fabio darf löschen.');
      if(!confirm('Diesen Player wirklich löschen?')) return;
      try {
        await deleteDoc(docRef(C_PLAYERS, b.dataset.delP));
      } catch(err){
        alert('Fehler beim Löschen: '+(err.message||err));
      }
    };
  });
}

onSnapshot(query(col(C_PLAYERS), orderBy('name')), (snap)=>{
  const rows=[], opts=[]; let tw=0, t8=0;
  snap.forEach(d=>{
    const p={id:d.id, ...d.data()};
    const g=(p.wins||0)+(p.losses||0)+(p.draws||0);
    const pct=g?Math.round((p.wins||0)/g*100):0;
    rows.push(
      `<tr>
        <td>${p.name}</td>
        <td>${p.wins||0}-${p.losses||0}-${p.draws||0}</td>
        <td><span class="pill ${pct>=55?'ok':pct>=45?'warn':'bad'}">${pct}%</span></td>
        <td>${(p.decks||[]).join(', ')}</td>
        <td>${p.top8||0}</td>
        <td>${currentUser?.email===OWNER_EMAIL ? `<button class="btn ghost" data-del-p="${p.id}">Löschen</button>` : ''}</td>
      </tr>`
    );
    opts.push(`<option value="${p.id}" data-name="${p.name}">${p.name}</option>`);
    tw+=(p.wins||0); t8+=(p.top8||0);
  });
  playersTBody.innerHTML = rows.join('');
  mPlayerSelect.innerHTML = opts.join('');
  $('#kpi-players').textContent = snap.size;
  $('#kpi-wins').textContent = tw;
  $('#kpi-top8').textContent = t8;

  // Team-Top8 in Summary (W/L/D kommt aus Matches)
  if (teamSummaryEl) {
    const existing = teamSummaryEl.querySelector('[data-stat="top8"]');
    const li = existing || document.createElement('li');
    li.setAttribute('data-stat','top8');
    li.innerHTML = `<strong>Top 8 (Team)</strong><span class="grow"></span>${t8}`;
    if (!existing) teamSummaryEl.appendChild(li);
  }

  attachPlayerDeleteButtons();
});

/* ===== Matches ===== */
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

// Player-Stats aus allen Matches neu berechnen
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
  // Player finden & updaten
  const playersSnap = await getDocs(query(col(C_PLAYERS)));
  for (const d of playersSnap.docs) {
    if (d.id === playerId) {
      const p = d.data();
      await setDoc(docRef(C_PLAYERS, playerId), { ...p, wins, losses, draws, decks: [...decksSet] });
    }
  }
}

$('#match-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(submitting.match) return;
  if(!currentUser) return alert('Login erforderlich.');
  const btn = e.submitter || $('#match-form button[type="submit"]');
  const opt=mPlayerSelect.selectedOptions[0];
  const playerId=opt?.value; const playerName=opt?.dataset.name||'';
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
    submitting.match = true; btn?.setAttribute('disabled','disabled');
    await addDoc(col(C_MATCHES), m);
    if (playerId) await recomputePlayerStats(playerId);
    e.target.reset();
  } finally { submitting.match=false; btn?.removeAttribute('disabled'); }
});

const matchesTBody=$('#matches-table tbody');
const latestTBody=$('#latest-results tbody');

onSnapshot(query(col(C_MATCHES), orderBy('date','desc')), (snap)=>{
  const rows=[], latest=[];
  let teamW = 0, teamL = 0, teamD = 0;
  const deckWinCounts = {}; // deck -> wins

  snap.forEach(d=>{
    const m=d.data();
    rows.push(`
      <tr>
        <td>${m.date||''}</td>
        <td>${m.player||''}</td>
        <td>${m.deck||''}</td>
        <td>${m.opp||''}</td>
        <td>${m.res||''}</td>
        <td>${(tierToText(m.tier)||'')}${m.event ? ` <span class="muted">– ${m.event}</span>` : ''}</td>
        <td>${
          currentUser?.email===OWNER_EMAIL
            ? `<button class="btn ghost" data-del-match="${d.id}" data-player-id="${m.playerId||''}">Löschen</button>`
            : ''
        }</td>
      </tr>
    `);

    if(latest.length<6) latest.push(`<tr><td>${m.player}</td><td>${m.deck}</td><td>${m.opp}</td><td>${m.res}</td></tr>`);

    if (m.res === 'W') teamW++;
    else if (m.res === 'L') teamL++;
    else if (m.res === 'D') teamD++;

    if (m.res === 'W' && m.deck) {
      const key = m.deck.trim();
      if (key) deckWinCounts[key] = (deckWinCounts[key] || 0) + 1;
    }
  });

  matchesTBody.innerHTML = rows.join('');
  latestTBody.innerHTML  = latest.join('');

  // Delete Match + Recompute
  $$('[data-del-match]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!currentUser) return;
    if(currentUser.email !== OWNER_EMAIL) return;
    const pid = b.dataset.playerId || '';
    await deleteDoc(docRef(C_MATCHES, b.dataset.delMatch));
    if (pid) await recomputePlayerStats(pid);
  }));

  // Team Summary (W/L/D)
  if (teamSummaryEl) {
    const wlExisting = teamSummaryEl.querySelector('[data-stat="wld"]');
    const wlLi = wlExisting || document.createElement('li');
    wlLi.setAttribute('data-stat','wld');
    wlLi.innerHTML = `<strong>Team Record</strong><span class="grow"></span>${teamW}-${teamL}-${teamD}`;
    if (!wlExisting) teamSummaryEl.appendChild(wlLi);

    if (!teamSummaryEl.querySelector('[data-stat="top8"]')) {
      const top8Li = document.createElement('li');
      top8Li.setAttribute('data-stat','top8');
      top8Li.innerHTML = `<strong>Top 8 (Team)</strong><span class="grow"></span>${$('#kpi-top8').textContent}`;
      teamSummaryEl.appendChild(top8Li);
    }
  }

  // Top Deck (Wins)
  if (topDeckEl) {
    topDeckEl.innerHTML = '';
    const decks = Object.keys(deckWinCounts);
    if (decks.length) {
      decks.sort((a,b)=>deckWinCounts[b]-deckWinCounts[a]);
      const best = decks[0];
      const li = document.createElement('li');
      li.innerHTML = `<strong>${best}</strong><span class="grow"></span>${deckWinCounts[best]} Wins`;
      topDeckEl.appendChild(li);
    } else {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'Noch keine Siege erfasst.';
      topDeckEl.appendChild(li);
    }
  }
});

/* ===== Events ===== */
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

const eventsBody=$('#events-table tbody');
onSnapshot(query(col(C_EVENTS), orderBy('date','asc')), (snap)=>{
  const rows=[];
  snap.forEach(d=>{
    const e=d.data();
    rows.push(`
      <tr>
        <td>${e.date||''}</td>
        <td>${e.name||''}</td>
        <td>${e.loc||''}</td>
        <td>${e.type||''}</td>
        <td>${currentUser?.email===OWNER_EMAIL ? `<button class="btn ghost" data-del-event="${d.id}">Löschen</button>` : ''}</td>
      </tr>
    `);
  });
  eventsBody.innerHTML = rows.join('');

  $$('[data-del-event]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!currentUser) return;
    if(currentUser.email !== OWNER_EMAIL) return;
    await deleteDoc(docRef(C_EVENTS, b.dataset.delEvent));
  }));
});

/* ===== Sponsors ===== */
$('#sponsor-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!currentUser) return alert('Login erforderlich.');
  if(currentUser.email !== OWNER_EMAIL) return alert('Nur Fabio darf Sponsoren speichern.');
  const s={ name:$('#sp-name').value.trim(), url:$('#sp-url').value.trim() };
  await addDoc(col(C_SPONS), s);
  e.target.reset();
});

const sponsList=$('#sponsor-list');
onSnapshot(col(C_SPONS), (snap)=>{
  const items=[];
  snap.forEach(d=>{
    const s={id:d.id, ...d.data()};
    const host = s.url ? new URL(s.url).host : '—';
    items.push(`
      <li>
        <strong>${s.name}</strong>
        <a class="muted" href="${s.url||'#'}" target="_blank" rel="noopener">${host}</a>
        <span class="grow"></span>
        ${currentUser?.email===OWNER_EMAIL ? `<button class="btn ghost" data-del-s="${s.id}">Entfernen</button>` : ''}
      </li>
    `);
  });
  sponsList.innerHTML = items.join('');
  $$('[data-del-s]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!currentUser) return;
    if(currentUser.email !== OWNER_EMAIL) return;
    await deleteDoc(docRef(C_SPONS, b.dataset.delS));
  }));
});

/* ===== CSV Exports ===== */
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
