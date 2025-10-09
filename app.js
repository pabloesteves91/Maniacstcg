// app.js — MANIACS · COMPETE
// Login, CRUD, CSV-Exports, Team-Stats-Charts, Read-only Layout, Owner-only Writes

import {
  auth, loginEmail, logout, onUser,
  col, docRef, addDoc, setDoc, getDocs, onSnapshot,
  query, orderBy, deleteDoc
} from './firebase.js';

/* ------------------ Helpers ------------------ */
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>[...document.querySelectorAll(s)];
function setActiveTab(id){
  $$('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===id));
  $$('.view').forEach(v=>v.classList.toggle('active', v.id===`view-${id}`));
}
$$('.tab').forEach(t=>t.addEventListener('click',()=>setActiveTab(t.dataset.tab)));

const OWNER_EMAIL = "fabioberta@me.com";

/* ---------- CSV helpers ---------- */
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
  const a = document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* ---------- Tiny chart (canvas bars) ---------- */
function drawBars(canvas, labels, values, title){
  const el = typeof canvas==='string' ? document.getElementById(canvas) : canvas;
  if(!el) return;
  const ctx = el.getContext('2d');
  const W = el.width  = el.clientWidth || 520;
  const H = el.height = el.getAttribute('height')|0 || 220;
  ctx.clearRect(0,0,W,H);
  const pad=28, max=Math.max(1,...values); const n=values.length||1; const bw=Math.max(10,(W-pad*2)/(n*1.25)); const gap=bw*0.25;
  ctx.fillStyle='#9aa3b2'; ctx.font='12px system-ui'; ctx.fillText(title||'',8,16);
  ctx.strokeStyle='#252a36'; ctx.beginPath(); ctx.moveTo(pad,pad); ctx.lineTo(pad,H-pad); ctx.lineTo(W-pad,H-pad); ctx.stroke();
  values.forEach((v,i)=>{
    const x=pad+i*(bw+gap)+gap; const h=Math.round((H-pad*2)*(v/max)); const y=H-pad-h;
    ctx.fillStyle='#E30613'; ctx.fillRect(x,y,bw,h);
    ctx.fillStyle='#9aa3b2'; ctx.font='11px system-ui';
    const lab=(labels[i]||'').slice(0,8); const tw=ctx.measureText(lab).width; ctx.fillText(lab,x+bw/2-tw/2,H-6);
    const txt=String(v); const tv=ctx.measureText(txt).width; ctx.fillText(txt,x+bw/2-tv/2,y-4);
  });
}

/* ------------------ Auth ------------------ */
$('#login-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email=$('#login-email').value.trim(); const pass=$('#login-pass').value;
  try{ await loginEmail(email,pass); $('#login-pass').value=''; }catch(err){ alert('Login fehlgeschlagen: '+(err.message||err)); }
});
$('#btn-logout').addEventListener('click', logout);

let currentUser=null;

// start: Schreib-Formulare verbergen bis Auth klar
$('#btn-open-player')?.classList.add('hidden');
$('#sponsor-form')?.classList.add('hidden');
['match-form','event-form','sponsor-form','player-form'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));

onUser(async (user)=>{
  currentUser = user || null;

  // Header UI
  $('#user-info').textContent = user ? user.email : '';
  $('#btn-logout').classList.toggle('hidden', !user);
  $('#login-form').classList.toggle('hidden', !!user);

  // Read-only Layout: linke Karten verstecken, rechte Karte mittig
  const isLoggedIn = !!user;
  document.body.classList.toggle('readonly', !isLoggedIn);

  // Matches
  $('#matches-form-card')?.classList.toggle('hidden', !isLoggedIn);
  $('#matches-list-card')?.classList.toggle('mx-center', !isLoggedIn);

  // Events
  $('#events-form-card')?.classList.toggle('hidden', !isLoggedIn);
  $('#events-list-card')?.classList.toggle('mx-center', !isLoggedIn);

  // Sponsors (Form nur Owner)
  const isOwner = !!(user && user.email===OWNER_EMAIL);
  $('#sponsor-form')?.classList.toggle('hidden', !isOwner);
  $('#sponsor-form-card')?.classList.toggle('hidden', !isOwner);

  // Players (Button nur Owner)
  $('#btn-open-player')?.classList.toggle('hidden', !isOwner);

  // Für eingeloggte auch die Formulare (Matches/Events) sichtbar
  ['match-form','event-form'].forEach(id=>document.getElementById(id)?.classList.toggle('hidden', !isLoggedIn));
});

/* ------------------ Collections ------------------ */
const C_PLAYERS='players', C_MATCHES='matches', C_EVENTS='events', C_SPONS='sponsors';

/* ------------------ Players ------------------ */
const playerModal = $('#player-modal');
$('#btn-open-player')?.addEventListener('click', ()=>{
  if(!currentUser) return alert('Bitte zuerst einloggen.');
  if(currentUser.email !== OWNER_EMAIL) return alert('Nur Fabio darf Players anlegen.');
  if(playerModal?.showModal) playerModal.showModal(); else playerModal?.classList.remove('hidden');
});

$('#player-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!currentUser) return alert('Login erforderlich.');
  if(currentUser.email !== OWNER_EMAIL) return alert('Nur Fabio darf Players anlegen.');
  const name=$('#p-name').value.trim();
  const decks=$('#p-decks').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!name) return;
  await addDoc(col(C_PLAYERS), {name,wins:0,losses:0,draws:0,top8:0,decks});
  e.target.reset(); playerModal?.close?.();
});

let _playersCache=[]; let _deckCounts={};
const playersTBody=$('#players-table tbody'); const mPlayerSelect=$('#m-player');

onSnapshot(query(col(C_PLAYERS), orderBy('name')), (snap)=>{
  const rows=[], opts=[]; let tw=0, t8=0;
  _playersCache=[]; _deckCounts={};
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
        <td>${currentUser?.email===OWNER_EMAIL ? `<button class="btn ghost" data-del-p="${p.id}">Löschen</button>` : ''}</td>
      </tr>`
    );
    opts.push(`<option value="${p.id}" data-name="${p.name}">${p.name}</option>`);
    tw+=(p.wins||0); t8+=(p.top8||0);
    _playersCache.push(p);
    (p.decks||[]).forEach(n=>{ if(!n) return; const k=n.trim(); _deckCounts[k]=(_deckCounts[k]||0)+1; });
  });
  playersTBody.innerHTML=rows.join(''); mPlayerSelect.innerHTML=opts.join('');
  $('#kpi-players').textContent=snap.size; $('#kpi-wins').textContent=tw; $('#kpi-top8').textContent=t8;

  $$('[data-del-p]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!currentUser) return alert('Login erforderlich.');
    if(currentUser.email!==OWNER_EMAIL) return alert('Nur Fabio darf Players löschen.');
    await deleteDoc(docRef(C_PLAYERS, b.dataset.delP));
  }));

  // Charts
  try{
    const labels=_playersCache.map(p=>p.name);
    const values=_playersCache.map(p=>{const g=(p.wins||0)+(p.losses||0)+(p.draws||0); return g?Math.round((p.wins||0)/g*100):0;});
    drawBars('chart-winrates', labels, values, 'Winrate % / Player');
    const deckLabels=Object.keys(_deckCounts).sort((a,b)=>_deckCounts[b]-_deckCounts[a]).slice(0,10);
    const deckVals=deckLabels.map(k=>_deckCounts[k]);
    drawBars('chart-decks', deckLabels, deckVals, 'Decks (Anzahl Spieler)');
  }catch(e){}
});

/* ------------------ Matches ------------------ */
$('#match-form').addEventListener('submit', async (e)=>{
  e.preventDefault(); if(!currentUser) return alert('Login erforderlich.');
  const opt=mPlayerSelect.selectedOptions[0]; const playerId=opt?.value; const playerName=opt?.dataset.name||'';
  const m={ date: $('#m-date').value || new Date().toISOString().slice(0,10),
            playerId, player:playerName, deck:$('#m-deck').value.trim(),
            opp:$('#m-opp').value.trim(), res:$('#m-res').value, event:$('#m-event').value.trim() };
  await addDoc(col(C_MATCHES), m);
  if(playerId){
    const all=await getDocs(query(col(C_PLAYERS)));
    all.forEach(async d=>{
      if(d.id===playerId){
        const p=d.data();
        const wins=(p.wins||0)+(m.res==='W'?1:0);
        const losses=(p.losses||0)+(m.res==='L'?1:0);
        const draws=(p.draws||0)+(m.res==='D'?1:0);
        const decks=[...(new Set([...(p.decks||[]), m.deck].filter(Boolean)))];
        await setDoc(docRef(C_PLAYERS,playerId), {...p,wins,losses,draws,decks});
      }
    });
  }
  e.target.reset();
});

const matchesTBody=$('#matches-table tbody'); const latestTBody=$('#latest-results tbody');
onSnapshot(query(col(C_MATCHES), orderBy('date','desc')),(snap)=>{
  const rows=[], latest=[];
  snap.forEach(d=>{
    const m=d.data();
    rows.push(`
      <tr>
        <td>${m.date||''}</td>
        <td>${m.player||''}</td>
        <td>${m.deck||''}</td>
        <td>${m.opp||''}</td>
        <td>${m.res||''}</td>
        <td>${m.event||''}</td>
        <td>${currentUser?.email===OWNER_EMAIL ? `<button class="btn ghost" data-del-match="${d.id}">Löschen</button>` : ''}</td>
      </tr>
    `);
    if(latest.length<6) latest.push(`<tr><td>${m.player}</td><td>${m.deck}</td><td>${m.opp}</td><td>${m.res}</td></tr>`);
  });
  matchesTBody.innerHTML=rows.join(''); latestTBody.innerHTML=latest.join('');

  $$('[data-del-match]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!currentUser) return alert('Login erforderlich.');
    if(currentUser.email!==OWNER_EMAIL) return alert('Nur Fabio darf Matches löschen.');
    await deleteDoc(docRef(C_MATCHES, b.dataset.delMatch));
  }));
});

/* ------------------ Events ------------------ */
$('#event-form').addEventListener('submit', async (e)=>{
  e.preventDefault(); if(!currentUser) return alert('Login erforderlich.');
  const ev={ name:$('#ev-name').value.trim(), date:$('#ev-date').value, loc:$('#ev-loc').value.trim(), type:$('#ev-type').value };
  await addDoc(col(C_EVENTS), ev); e.target.reset();
});
const eventsBody=$('#events-table tbody');
onSnapshot(query(col(C_EVENTS), orderBy('date','asc')),(snap)=>{
  const rows=[]; snap.forEach(d=>{const e=d.data(); rows.push(`<tr><td>${e.date}</td><td>${e.name}</td><td>${e.loc}</td><td>${e.type}</td></tr>`);});
  eventsBody.innerHTML=rows.join('');
});

/* ------------------ Sponsors ------------------ */
$('#sponsor-form').addEventListener('submit', async (e)=>{
  e.preventDefault(); if(!currentUser) return alert('Login erforderlich.');
  if(currentUser.email!==OWNER_EMAIL) return alert('Nur Fabio darf Sponsoren anlegen.');
  const s={name:$('#sp-name').value.trim(), url:$('#sp-url').value.trim()};
  await addDoc(col(C_SPONS), s); e.target.reset();
});
const sponsList=$('#sponsor-list');
onSnapshot(col(C_SPONS),(snap)=>{
  const items=[]; snap.forEach(d=>{
    const s={id:d.id,...d.data()}; const host=s.url?new URL(s.url).host:'—';
    items.push(
      `<li>
        <strong>${s.name}</strong>
        <a class="muted" href="${s.url||'#'}" target="_blank" rel="noopener">${host}</a>
        <span class="grow"></span>
        ${currentUser?.email===OWNER_EMAIL ? `<button class="btn ghost" data-del-s="${s.id}">Entfernen</button>` : ''}
      </li>`
    );
  });
  sponsList.innerHTML=items.join('');
  $$('[data-del-s]').forEach(b=>b.addEventListener('click', async()=>{
    if(!currentUser) return alert('Login erforderlich.');
    if(currentUser.email!==OWNER_EMAIL) return alert('Nur Fabio darf Sponsoren löschen.');
    await deleteDoc(docRef(C_SPONS, b.dataset.delS));
  }));
});

/* ------------------ CSV Exports ------------------ */
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
  snap.forEach(d=>{ const m=d.data(); rows.push({date:m.date||'',player:m.player||'',playerId:m.playerId||'',deck:m.deck||'',opponent:m.opp||'',result:m.res||'',event:m.event||''}); });
  downloadCSV('matches.csv', rows, ['date','player','playerId','deck','opponent','result','event']);
});
$('#export-events')?.addEventListener('click', async ()=>{
  const snap=await getDocs(query(col(C_EVENTS), orderBy('date','asc'))); const rows=[];
  snap.forEach(d=>{const e=d.data(); rows.push({date:e.date||'',name:e.name||'',location:e.loc||'',type:e.type||''});});
  downloadCSV('events.csv', rows, ['date','name','location','type']);
});
$('#export-sponsors')?.addEventListener('click', async ()=>{
  const snap=await getDocs(col(C_SPONS)); const rows=[];
  snap.forEach(d=>{const s=d.data(); const host=s.url?new URL(s.url).host:''; rows.push({name:s.name||'',url:s.url||'',host});});
  downloadCSV('sponsors.csv', rows, ['name','url','host']);
});
$('#export-stats')?.addEventListener('click', async ()=>{
  const ps=await getDocs(col(C_PLAYERS)); const players=[]; ps.forEach(d=>players.push({id:d.id,...d.data()}));
  const total_players=players.length;
  const total_wins=players.reduce((a,p)=>a+(p.wins||0),0);
  const total_top8=players.reduce((a,p)=>a+(p.top8||0),0);
  const rows=[ {metric:'total_players',value:total_players}, {metric:'total_wins',value:total_wins}, {metric:'total_top8',value:total_top8}, {metric:'generated_at',value:new Date().toISOString()} ];
  downloadCSV('stats.csv', rows, ['metric','value']);
});
