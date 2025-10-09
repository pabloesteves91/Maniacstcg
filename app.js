// app.js — MANIACS · COMPETE
// Owner-only: Players & Sponsors nur fabioberta@me.com; Matches/Events für alle eingeloggten.
// Enthält CSV-Export-Buttons für stats, players, matches, events, sponsors.

import {
  auth, loginEmail, logout, onUser,
  col, docRef, addDoc, setDoc, getDocs, onSnapshot,
  query, orderBy, deleteDoc
} from './firebase.js';

// ---------- Helpers ----------
const $  = (sel)=>document.querySelector(sel);
const $$ = (sel)=>[...document.querySelectorAll(sel)];
function setActiveTab(id){
  $$('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===id));
  $$('.view').forEach(v=>v.classList.toggle('active', v.id===`view-${id}`));
}
$$('.tab').forEach(t=>t.addEventListener('click',()=>setActiveTab(t.dataset.tab)));

const OWNER_EMAIL = "fabioberta@me.com";

// ---------- CSV Helpers ----------
function csvEscape(v){
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function toCSV(rows, headerOrder){
  const bom = '\uFEFF'; // Excel-friendly
  const headers = headerOrder || Object.keys(rows[0] || {});
  const head = headers.map(csvEscape).join(';');
  const body = rows.map(r => headers.map(h => csvEscape(r[h])).join(';')).join('\n');
  return bom + head + '\n' + body;
}
function downloadCSV(filename, rows, headerOrder){
  const csv = toCSV(rows, headerOrder);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

// ---------- Auth ----------
$('#login-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const pass  = $('#login-pass').value;
  try {
    await loginEmail(email, pass);
    $('#login-pass').value='';
  } catch(err) {
    alert('Login fehlgeschlagen: '+(err.message||err));
  }
});
$('#btn-logout').addEventListener('click', logout);

let currentUser = null;

// Start: Schreib-Formulare verstecken bis Auth geklärt
$('#btn-open-player')?.classList.add('hidden');
$('#sponsor-form')?.classList.add('hidden');
['match-form','event-form','sponsor-form','player-form'].forEach(id=>{
  document.getElementById(id)?.classList.add('hidden');
});

onUser(async (user)=>{
  currentUser = user || null;

  // UI: Login/Logout
  $('#user-info').textContent = user ? user.email : '';
  $('#btn-logout').classList.toggle('hidden', !user);
  $('#login-form').classList.toggle('hidden', !!user);

  // Sichtbarkeit Schreib-Formulare
  const isLoggedIn = !!user;
  ['match-form','event-form'].forEach(id=>{
    document.getElementById(id)?.classList.toggle('hidden', !isLoggedIn);
  });

  // Nur Fabio sieht Player-Button & Sponsor-Form
  const isOwner = !!(user && user.email === OWNER_EMAIL);
  $('#btn-open-player')?.classList.toggle('hidden', !isOwner);
  $('#sponsor-form')?.classList.toggle('hidden', !isOwner);
});

// ---------- Collections ----------
const C_PLAYERS='players', C_MATCHES='matches', C_EVENTS='events', C_SPONS='sponsors';

// ---------- Players ----------
const playerModal = $('#player-modal');

$('#btn-open-player')?.addEventListener('click', ()=>{
  if(!currentUser) return alert('Bitte zuerst einloggen.');
  if(currentUser.email !== OWNER_EMAIL) return alert('Nur Fabio darf Players anlegen.');
  playerModal.showModal();
});

$('#player-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!currentUser) return alert('Login erforderlich.');
  if(currentUser.email !== OWNER_EMAIL) return alert('Nur Fabio darf Players anlegen.');
  const name  = $('#p-name').value.trim();
  const decks = $('#p-decks').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!name) return;
  await addDoc(col(C_PLAYERS), { name, wins:0, losses:0, draws:0, top8:0, decks });
  e.target.reset();
  playerModal.close();
});

const playersTBody = $('#players-table tbody');
const mPlayerSelect = $('#m-player');

onSnapshot(query(col(C_PLAYERS), orderBy('name')), (snap)=>{
  const rows=[], opts=[];
  let tw=0, t8=0;
  snap.forEach(d=>{
    const p={id:d.id,...d.data()};
    const g=(p.wins||0)+(p.losses||0)+(p.draws||0);
    const pct=g?Math.round((p.wins||0)/g*100):0;
    rows.push(
      `<tr>
        <td>${p.name}</td>
        <td>${p.wins||0}-${p.losses||0}-${p.draws||0}</td>
        <td><span class="pill ${pct>=55?'ok':pct>=45?'warn':'bad'}">${pct}%</span></td>
        <td>${(p.decks||[]).join(', ')}</td>
        <td>${p.top8||0}</td>
        <td>${currentUser?.email === OWNER_EMAIL ? `<button class="btn ghost" data-del-p="${p.id}">Löschen</button>` : ''}</td>
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

  $$('[data-del-p]').forEach(b=>b.addEventListener('click', async()=>{
    if(!currentUser) return alert('Login erforderlich.');
    if(currentUser.email !== OWNER_EMAIL) return alert('Nur Fabio darf Players löschen.');
    await deleteDoc(docRef(C_PLAYERS, b.dataset.delP));
  }));
});

// ---------- Matches ----------
$('#match-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!currentUser) return alert('Login erforderlich.');
  const opt = mPlayerSelect.selectedOptions[0];
  const playerId   = opt?.value;
  const playerName = opt?.dataset.name || '';
  const m = {
    date:  $('#m-date').value || new Date().toISOString().slice(0,10),
    playerId,
    player: playerName,
    deck:  $('#m-deck').value.trim(),
    opp:   $('#m-opp').value.trim(),
    res:   $('#m-res').value,
    event: $('#m-event').value.trim()
  };
  await addDoc(col(C_MATCHES), m);

  if(playerId){
    const all = await getDocs(query(col(C_PLAYERS)));
    all.forEach(async d=>{
      if(d.id===playerId){
        const p=d.data();
        const wins   = (p.wins||0)   + (m.res==='W'?1:0);
        const losses = (p.losses||0) + (m.res==='L'?1:0);
        const draws  = (p.draws||0)  + (m.res==='D'?1:0);
        const decks  = [...new Set([...(p.decks||[]), m.deck].filter(Boolean))];
        await setDoc(docRef(C_PLAYERS, playerId), { ...p, wins, losses, draws, decks });
      }
    });
  }
  e.target.reset();
});

const matchesTBody = $('#matches-table tbody');
const latestTBody  = $('#latest-results tbody');

onSnapshot(query(col(C_MATCHES), orderBy('date','desc')), (snap)=>{
  const rows=[], latest=[];
  snap.forEach(d=>{
    const m=d.data();
    rows.push(`<tr><td>${m.date}</td><td>${m.player}</td><td>${m.deck}</td><td>${m.opp}</td><td>${m.res}</td><td>${m.event||''}</td></tr>`);
    if(latest.length<6) latest.push(`<tr><td>${m.player}</td><td>${m.deck}</td><td>${m.opp}</td><td>${m.res}</td></tr>`);
  });
  matchesTBody.innerHTML = rows.join('');
  latestTBody.innerHTML  = latest.join('');
});

// ---------- Events ----------
$('#event-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!currentUser) return alert('Login erforderlich.');
  const ev = {
    name: $('#ev-name').value.trim(),
    date: $('#ev-date').value,
    loc:  $('#ev-loc').value.trim(),
    type: $('#ev-type').value
  };
  await addDoc(col(C_EVENTS), ev);
  e.target.reset();
});

const eventsBody = $('#events-table tbody');
const eventsMini = $('#events-mini tbody');
onSnapshot(query(col(C_EVENTS), orderBy('date','asc')), (snap)=>{
  const rows=[], mini=[]; let i=0;
  snap.forEach(d=>{
    const e=d.data();
    rows.push(`<tr><td>${e.date}</td><td>${e.name}</td><td>${e.loc}</td><td>${e.type}</td></tr>`);
    if(i<5){ mini.push(`<tr><td>${e.date}</td><td>${e.name}</td><td>${e.loc}</td></tr>`); i++; }
  });
  eventsBody.innerHTML = rows.join('');
  eventsMini.innerHTML = mini.join('');
});

// ---------- Sponsors ----------
$('#sponsor-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!currentUser) return alert('Login erforderlich.');
  if(currentUser.email !== OWNER_EMAIL) return alert('Nur Fabio darf Sponsoren anlegen.');
  const s = { name: $('#sp-name').value.trim(), url: $('#sp-url').value.trim() };
  await addDoc(col(C_SPONS), s);
  e.target.reset();
});

const sponsList = $('#sponsor-list');
onSnapshot(col(C_SPONS), (snap)=>{
  const items=[];
  snap.forEach(d=>{
    const s={id:d.id,...d.data()};
    const host = s.url ? new URL(s.url).host : '—';
    items.push(
      `<li>
        <strong>${s.name}</strong>
        <a class="muted" href="${s.url||'#'}" target="_blank" rel="noopener">${host}</a>
        <span class="grow"></span>
        ${currentUser?.email === OWNER_EMAIL ? `<button class="btn ghost" data-del-s="${s.id}">Entfernen</button>` : ''}
      </li>`
    );
  });
  sponsList.innerHTML = items.join('');
  $$('[data-del-s]').forEach(b=>b.addEventListener('click', async()=>{
    if(!currentUser) return alert('Login erforderlich.');
    if(currentUser.email !== OWNER_EMAIL) return alert('Nur Fabio darf Sponsoren löschen.');
    await deleteDoc(docRef(C_SPONS, b.dataset.delS));
  }));
});

// ---------- CSV Exports ----------
document.getElementById('export-players')?.addEventListener('click', async ()=>{
  const snap = await getDocs(query(col(C_PLAYERS), orderBy('name')));
  const rows = [];
  snap.forEach(d=>{
    const p = { id:d.id, ...d.data() };
    const g=(p.wins||0)+(p.losses||0)+(p.draws||0);
    const winpct = g ? Math.round((p.wins||0)/g*100) : 0;
    rows.push({
      name: p.name || '',
      wins: p.wins||0,
      losses: p.losses||0,
      draws: p.draws||0,
      win_pct: winpct,
      top8: p.top8||0,
      decks: (p.decks||[]).join(', ')
    });
  });
  downloadCSV('players.csv', rows, ['name','wins','losses','draws','win_pct','top8','decks']);
});

document.getElementById('export-matches')?.addEventListener('click', async ()=>{
  const snap = await getDocs(query(col(C_MATCHES), orderBy('date','desc')));
  const rows = [];
  snap.forEach(d=>{
    const m = d.data();
    rows.push({
      date: m.date||'',
      player: m.player||'',
      playerId: m.playerId||'',
      deck: m.deck||'',
      opponent: m.opp||'',
      result: m.res||'',
      event: m.event||''
    });
  });
  downloadCSV('matches.csv', rows, ['date','player','playerId','deck','opponent','result','event']);
});

document.getElementById('export-events')?.addEventListener('click', async ()=>{
  const snap = await getDocs(query(col(C_EVENTS), orderBy('date','asc')));
  const rows = [];
  snap.forEach(d=>{
    const e = d.data();
    rows.push({
      date: e.date||'',
      name: e.name||'',
      location: e.loc||'',
      type: e.type||''
    });
  });
  downloadCSV('events.csv', rows, ['date','name','location','type']);
});

document.getElementById('export-sponsors')?.addEventListener('click', async ()=>{
  const snap = await getDocs(col(C_SPONS));
  const rows = [];
  snap.forEach(d=>{
    const s = d.data();
    const host = s.url ? new URL(s.url).host : '';
    rows.push({
      name: s.name||'',
      url: s.url||'',
      host
    });
  });
  downloadCSV('sponsors.csv', rows, ['name','url','host']);
});

document.getElementById('export-stats')?.addEventListener('click', async ()=>{
  const ps = await getDocs(col(C_PLAYERS));
  const players = []; ps.forEach(d=>players.push({id:d.id, ...d.data()}));
  const total_players = players.length;
  const total_wins = players.reduce((a,p)=>a+(p.wins||0),0);
  const total_top8 = players.reduce((a,p)=>a+(p.top8||0),0);
  const generated_at = new Date().toISOString();

  const rows = [
    { metric:'total_players', value: total_players },
    { metric:'total_wins',    value: total_wins },
    { metric:'total_top8',    value: total_top8 },
    { metric:'generated_at',  value: generated_at }
  ];
  downloadCSV('stats.csv', rows, ['metric','value']);
});
