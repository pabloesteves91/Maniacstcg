import { auth, loginEmail, logout, onUser, col, docRef, addDoc, setDoc, getDocs, onSnapshot, query, orderBy, deleteDoc, cfCreateUser, cfSetUserRole } from './firebase.js';

// ---------- Helpers ----------
const $  = (sel)=>document.querySelector(sel);
const $$ = (sel)=>[...document.querySelectorAll(sel)];
function setActiveTab(id){
  $$('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===id));
  $$('.view').forEach(v=>v.classList.toggle('active', v.id===`view-${id}`));
}
$$('.tab').forEach(t=>t.addEventListener('click',()=>setActiveTab(t.dataset.tab)));

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
let currentRole = 'guest';

// --- Firestore-Fallback für Rolle (ohne Terminal/Custom Claim) ---
async function getRoleFromFirestore(uid){
  try{
    if(!auth.currentUser) return null;
    const idToken   = await auth.currentUser.getIdToken(/* forceRefresh */ true);
    const projectId = auth.app.options.projectId;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?access_token=${idToken}`;
    const r = await fetch(url);
    if(!r.ok) return null;
    const data = await r.json();
    return data?.fields?.role?.stringValue || null;
  }catch{
    return null;
  }
}

onUser(async (user)=>{
  currentUser = user || null;

  // UI: Login/Logout switch
  $('#user-info').textContent = user ? user.email : '';
  $('#btn-logout').classList.toggle('hidden', !user);
  $('#login-form').classList.toggle('hidden', !!user);

  // Rolle ermitteln
  currentRole = 'guest';
  if(user){
    // 1) Versuch: Custom Claim (falls irgendwann gesetzt)
    const tokenRes = await user.getIdTokenResult(true);
    currentRole = tokenRes.claims.role || 'member';

    // 2) Fallback: Firestore users/<uid>.role (online in Console setzbar)
    if(currentRole !== 'admin'){
      const fsRole = await getRoleFromFirestore(user.uid);
      if(fsRole) currentRole = fsRole;
    }
  }

  const isAdmin = currentRole === 'admin';
  $('#tab-admin').classList.toggle('hidden', !isAdmin);
  if(!isAdmin && $$('.tab.active')[0]?.dataset.tab==='admin'){
    setActiveTab('dashboard');
  }
});

// ---------- Collections ----------
const C_PLAYERS='players', C_MATCHES='matches', C_EVENTS='events', C_SPONS='sponsors', C_USERS='users';

// ---------- Players ----------
const playerModal = $('#player-modal');
$('#btn-open-player').addEventListener('click',()=>{
  if(!currentUser) return alert('Bitte zuerst einloggen.');
  playerModal.showModal();
});
$('#player-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!currentUser) return alert('Login erforderlich.');
  const name = $('#p-name').value.trim();
  const decks = $('#p-decks').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!name) return;
  await addDoc(col(C_PLAYERS), { name, wins:0, losses:0, draws:0, top8:0, decks });
  e.target.reset();
  playerModal.close();
});

const playersTBody = $('#players-table tbody');
const mPlayerSelect = $('#m-player');
onSnapshot(query(col(C_PLAYERS), orderBy('name')), (snap)=>{
  const rows=[], opts=[]; let tw=0, t8=0;
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
        <td><button class="btn ghost" data-del-p="${p.id}">Löschen</button></td>
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
    await deleteDoc(docRef(C_PLAYERS, b.dataset.delP));
  }));
});

// ---------- Matches ----------
$('#match-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!currentUser) return alert('Login erforderlich.');
  const opt = mPlayerSelect.selectedOptions[0];
  const playerId = opt?.value;
  const playerName = opt?.dataset.name || '';
  const m = {
    date: $('#m-date').value || new Date().toISOString().slice(0,10),
    playerId,
    player: playerName,
    deck: $('#m-deck').value.trim(),
    opp:  $('#m-opp').value.trim(),
    res:  $('#m-res').value,
    event: $('#m-event').value.trim()
  };
  await addDoc(col(C_MATCHES), m);

  // einfache Zähler-Updates (Demo, nicht transaktional)
  if(playerId){
    const all = await getDocs(query(col(C_PLAYERS)));
    all.forEach(async d=>{
      if(d.id===playerId){
        const p=d.data();
        const wins  = (p.wins||0)   + (m.res==='W'?1:0);
        const losses= (p.losses||0) + (m.res==='L'?1:0);
        const draws = (p.draws||0)  + (m.res==='D'?1:0);
        const decks = [...new Set([...(p.decks||[]), m.deck].filter(Boolean))];
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
        <button class="btn ghost" data-del-s="${s.id}">Entfernen</button>
      </li>`
    );
  });
  sponsList.innerHTML = items.join('');
  $$('[data-del-s]').forEach(b=>b.addEventListener('click', async()=>{
    if(!currentUser) return alert('Login erforderlich.');
    await deleteDoc(docRef(C_SPONS, b.dataset.delS));
  }));
});

// ---------- Admin ----------
$('#admin-create-user').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(currentRole!=='admin') return alert('Nur Admin.');
  const email = $('#a-email').value.trim();
  const pass  = $('#a-pass').value;
  const role  = $('#a-role').value;
  try{
    const res = await cfCreateUser({ email, password: pass, role });
    alert('User erstellt: '+res.data.uid);
    e.target.reset();
  }catch(err){
    // Falls Function noch Custom Claim verlangt, bekommt man hier eine klare Meldung
    alert('Fehler (CreateUser): '+(err.message || JSON.stringify(err)));
  }
});

// Benutzerliste aus users-Collection
const usersTBody = $('#users-table tbody');
onSnapshot(query(col(C_USERS), orderBy('email')), (snap)=>{
  const rows=[];
  snap.forEach(d=>{
    const u=d.data();
    rows.push(
      `<tr>
        <td>${u.displayName||''} ${u.email?`<span class='muted'>(${u.email})</span>`:''}</td>
        <td>${u.role||'member'}</td>
        <td></td>
      </tr>`
    );
  });
  usersTBody.innerHTML = rows.join('');
});
