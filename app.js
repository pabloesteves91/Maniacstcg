import {
  loginEmail, logout, onUser,
  col, docRef, addDoc, setDoc, getDocs, onSnapshot,
  query, orderBy, deleteDoc
} from './firebase.js';

const $=(s)=>document.querySelector(s);
const $$=(s)=>[...document.querySelectorAll(s)];
function setActiveTab(id){
  $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===id));
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${id}`));
}
$$('.tab').forEach(t=>t.addEventListener('click',()=>setActiveTab(t.dataset.tab)));

const OWNER_EMAIL="fabioberta@me.com";

/* ---------- CSV helper ---------- */
function csvEscape(v){if(v==null)return'';const s=String(v);return/[",\n;]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function toCSV(rows,order){const bom='\uFEFF';const h=order||Object.keys(rows[0]||{});const head=h.map(csvEscape).join(';');const body=rows.map(r=>h.map(x=>csvEscape(r[x])).join(';')).join('\n');return bom+head+'\n'+body;}
function downloadCSV(name,rows,order){const blob=new Blob([toCSV(rows,order)],{type:'text/csv;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();}

/* ---------- Auth ---------- */
$('#login-form').addEventListener('submit',async e=>{
  e.preventDefault();try{await loginEmail($('#login-email').value.trim(),$('#login-pass').value);$('#login-pass').value='';}catch(e2){alert('Login fehlgeschlagen: '+e2.message);}});
$('#btn-logout').addEventListener('click',logout);

let currentUser=null;
onUser(async user=>{
  currentUser=user||null;
  $('#user-info').textContent=user?user.email:'';
  $('#btn-logout').classList.toggle('hidden',!user);
  $('#login-form').classList.toggle('hidden',!!user);
  const logged=!!user;
  document.body.classList.toggle('readonly',!logged);
  $('#matches-form-card')?.classList.toggle('hidden',!logged);
  $('#matches-list-card')?.classList.toggle('mx-center',!logged);
  $('#events-form-card')?.classList.toggle('hidden',!logged);
  $('#events-list-card')?.classList.toggle('mx-center',!logged);
  const isOwner=user&&user.email===OWNER_EMAIL;
  $('#btn-open-player')?.classList.toggle('hidden',!isOwner);
  $('#sponsor-form')?.classList.toggle('hidden',!isOwner);
});

/* ---------- Collections ---------- */
const C_PLAYERS='players',C_MATCHES='matches',C_EVENTS='events',C_SPONS='sponsors';

/* ---------- Player Modal ---------- */
const playerModal=$('#player-modal');
function openPlayerModal(){
  if(!currentUser)return alert('Bitte zuerst einloggen.');
  try{playerModal.showModal();}catch{playerModal.setAttribute('open','');}
}
$('#btn-open-player')?.addEventListener('click',openPlayerModal);
$('#player-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!currentUser)return alert('Login erforderlich.');
  if(currentUser.email!==OWNER_EMAIL)return alert('Nur Fabio darf Players speichern.');
  const name=$('#p-name').value.trim();
  const decks=$('#p-decks').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!name)return;
  await addDoc(col(C_PLAYERS),{name,wins:0,losses:0,draws:0,top8:0,decks});
  e.target.reset();playerModal.close();
});

/* ---------- Players ---------- */
const playersTBody=$('#players-table tbody'),mPlayerSelect=$('#m-player');
onSnapshot(query(col(C_PLAYERS),orderBy('name')),(snap)=>{
  const rows=[],opts=[];let tw=0,t8=0;
  snap.forEach(d=>{
    const p={id:d.id,...d.data()};
    const g=(p.wins||0)+(p.losses||0)+(p.draws||0);
    const pct=g?Math.round((p.wins||0)/g*100):0;
    rows.push(`<tr><td>${p.name}</td><td>${p.wins||0}-${p.losses||0}-${p.draws||0}</td><td><span class="pill ${pct>=55?'ok':pct>=45?'warn':'bad'}">${pct}%</span></td><td>${(p.decks||[]).join(', ')}</td><td>${p.top8||0}</td><td>${currentUser?.email===OWNER_EMAIL?`<button class="btn ghost" data-del-p="${p.id}">Löschen</button>`:''}</td></tr>`);
    opts.push(`<option value="${p.id}" data-name="${p.name}">${p.name}</option>`);tw+=(p.wins||0);t8+=(p.top8||0);
  });
  playersTBody.innerHTML=rows.join('');mPlayerSelect.innerHTML=opts.join('');
  $('#kpi-players').textContent=snap.size;$('#kpi-wins').textContent=tw;$('#kpi-top8').textContent=t8;
  $$('[data-del-p]').forEach(b=>b.addEventListener('click',async()=>{if(!currentUser)return; if(currentUser.email!==OWNER_EMAIL)return; await deleteDoc(docRef(C_PLAYERS,b.dataset.delP));}));
});

/* ---------- Matches ---------- */
$('#match-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!currentUser)return alert('Login erforderlich.');
  const opt=mPlayerSelect.selectedOptions[0];const pid=opt?.value;const pname=opt?.dataset.name||'';
  const m={date:$('#m-date').value||new Date().toISOString().slice(0,10),playerId:pid,player:pname,deck:$('#m-deck').value.trim(),opp:$('#m-opp').value.trim(),res:$('#m-res').value,event:$('#m-event').value.trim()};
  await addDoc(col(C_MATCHES),m);
  e.target.reset();
});
const matchesTBody=$('#matches-table tbody'),latestTBody=$('#latest-results tbody');
onSnapshot(query(col(C_MATCHES),orderBy('date','desc')),(snap)=>{
  const rows=[],latest=[];
  snap.forEach(d=>{
    const m=d.data();
    rows.push(`<tr><td>${m.date||''}</td><td>${m.player||''}</td><td>${m.deck||''}</td><td>${m.opp||''}</td><td>${m.res||''}</td><td>${m.event||''}</td><td>${currentUser?.email===OWNER_EMAIL?`<button class="btn ghost" data-del-match="${d.id}">Löschen</button>`:''}</td></tr>`);
    if(latest.length<6)latest.push(`<tr><td>${m.player}</td><td>${m.deck}</td><td>${m.opp}</td><td>${m.res}</td></tr>`);
  });
  matchesTBody.innerHTML=rows.join('');latestTBody.innerHTML=latest.join('');
  $$('[data-del-match]').forEach(b=>b.addEventListener('click',async()=>{if(!currentUser)return;if(currentUser.email!==OWNER_EMAIL)return;await deleteDoc(docRef(C_MATCHES,b.dataset.delMatch));}));
});

/* ---------- Events ---------- */
$('#event-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!currentUser)return alert('Login erforderlich.');
  const ev={name:$('#ev-name').value.trim(),date:$('#ev-date').value,loc:$('#ev-loc').value.trim(),type:$('#ev-type').value};
  await addDoc(col(C_EVENTS),ev);e.target.reset();
});
const eventsBody=$('#events-table tbody');
onSnapshot(query(col(C_EVENTS),orderBy('date','asc')),(snap)=>{
  const rows=[];snap.forEach(d=>{const e=d.data();rows.push(`<tr><td>${e.date}</td><td>${e.name}</td><td>${e.loc}</td><td>${e.type}</td><td>${currentUser?.email===OWNER_EMAIL?`<button class="btn ghost" data-del-event="${d.id}">Löschen</button>`:''}</td></tr>`);});
  eventsBody.innerHTML=rows.join('');
  $$('[data-del-event]').forEach(b=>b.addEventListener('click',async()=>{if(!currentUser)return;if(currentUser.email!==OWNER_EMAIL)return;await deleteDoc(docRef(C_EVENTS,b.dataset
