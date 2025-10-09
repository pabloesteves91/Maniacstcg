// MANIACS · COMPETE — app.js (stable final build)
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

  /* ---------- Helpers ---------- */
  const $  = (s)=>document.querySelector(s);
  const $$ = (s)=>[...document.querySelectorAll(s)];
  function setActiveTab(id){
    $$('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===id));
    $$('.view').forEach(v=>v.classList.toggle('active', v.id===`view-${id}`));
  }
  $$('.tab').forEach(t=>t.addEventListener('click',()=>setActiveTab(t.dataset.tab)));

  /* ---------- Rotate Tip (Mobile) ---------- */
  (function(){
    const tip = $('#rotate-tip');
    if(!tip) return;
    const mqPortrait = window.matchMedia('(orientation: portrait)');
    const mqSmall = window.matchMedia('(max-width:700px)');
    const update = ()=>tip.classList.toggle('show', mqSmall.matches && mqPortrait.matches);
    update();
    mqPortrait.addEventListener?.('change', update);
    mqSmall.addEventListener?.('change', update);
    window.addEventListener('resize', update, {passive:true});
  })();

  /* ---------- CSV helpers ---------- */
  function csvEscape(v){if(v==null)return'';const s=String(v);return/[",\n;]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
  function toCSV(rows,order){const bom='\uFEFF';const headers=order||Object.keys(rows[0]||{});const head=headers.map(csvEscape).join(';');const body=rows.map(r=>headers.map(h=>csvEscape(r[h])).join(';')).join('\n');return bom+head+'\n'+body;}
  function downloadCSV(name,rows,order){const blob=new Blob([toCSV(rows,order)],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}

  /* ---------- Admin via Rules-Probe ---------- */
  let currentUser=null,isAdminUI=false;
  async function checkAdminViaRulesProbe(user){
    if(!user)return false;
    try{await getDoc(docRef('meta','adminProbe'));return true;}
    catch{return false;}
  }
  function applyAdminUI(isAdmin){
    isAdminUI=isAdmin;
    $('#sponsor-form')?.classList.toggle('hidden',!isAdmin);
    $('#sponsor-form-card')?.classList.toggle('hidden',!isAdmin);
    $('#btn-open-player')?.classList.toggle('hidden',!isAdmin);
    $('#role-badge')?.classList.toggle('hidden',!isAdmin);
  }

  /* ---------- Auth ---------- */
  $('#login-form')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const email=$('#login-email').value.trim(),pass=$('#login-pass').value;
    try{await loginEmail(email,pass);$('#login-pass').value='';}
    catch(err){alert('Login fehlgeschlagen: '+(err.message||err));}
  });
  $('#btn-logout')?.addEventListener('click',logout);

  onUser(async user=>{
    currentUser=user||null;
    $('#user-info').textContent=user?user.email:'';
    $('#btn-logout')?.classList.toggle('hidden',!user);
    $('#login-form')?.classList.toggle('hidden',!!user);
    $('#role-badge')?.classList.toggle('hidden',!user);
    const isLoggedIn=!!user;
    document.body.classList.toggle('readonly',!isLoggedIn);
    $('#matches-form-card')?.classList.toggle('hidden',!isLoggedIn);
    $('#matches-list-card')?.classList.toggle('mx-center',!isLoggedIn);
    $('#events-form-card')?.classList.toggle('hidden',!isLoggedIn);
    $('#events-list-card')?.classList.toggle('mx-center',!isLoggedIn);
    const admin=await checkAdminViaRulesProbe(user);
    applyAdminUI(admin);
  });

  /* ---------- Collections ---------- */
  const C_PLAYERS='players',C_MATCHES='matches',C_EVENTS='events',C_SPONS='sponsors';
  const submitting={player:false,match:false};

  /* ---------- Player Modal ---------- */
  const playerModal=$('#player-modal');
  $('#btn-open-player')?.addEventListener('click',()=>{
    if(!currentUser)return alert('Bitte zuerst einloggen.');
    if(!isAdminUI)return alert('Nur Admins dürfen Spieler anlegen.');
    try{playerModal.showModal();}catch{playerModal.setAttribute('open','');}
  });

  $('#player-form')?.addEventListener('submit',async e=>{
    e.preventDefault();
    if(submitting.player)return;
    if(!currentUser)return alert('Login erforderlich.');
    if(!isAdminUI)return alert('Nur Admins dürfen Spieler speichern.');
    const btn=e.submitter;
    submitting.player=true;btn?.setAttribute('disabled','');
    try{
      const name=$('#p-name').value.trim();
      const decks=$('#p-decks').value.split(',').map(s=>s.trim()).filter(Boolean);
      if(!name)return;
      await addDoc(col(C_PLAYERS),{name,wins:0,losses:0,draws:0,top8:0,decks});
      e.target.reset();playerModal.close?.();
    }catch(err){alert('Fehler: '+err.message);}
    submitting.player=false;btn?.removeAttribute('disabled');
  });

  /* ---------- Live Player Snapshot ---------- */
  const playersTBody=$('#players-table tbody'),mPlayerSelect=$('#m-player');
  onSnapshot(query(col(C_PLAYERS),orderBy('name')),(snap)=>{
    const rows=[],opts=[];let tw=0,t8=0;
    snap.forEach(d=>{
      const p={id:d.id,...d.data()};
      const g=(p.wins||0)+(p.losses||0)+(p.draws||0);
      const pct=g?Math.round((p.wins||0)/g*100):0;
      rows.push(`
        <tr>
          <td>${p.name}</td>
          <td>${p.wins||0}-${p.losses||0}-${p.draws||0}</td>
          <td><span class="pill ${pct>=55?'ok':pct>=45?'warn':'bad'}">${pct}%</span></td>
          <td>${(p.decks||[]).join(', ')}</td>
          <td>${p.top8||0}</td>
          <td>${isAdminUI?`<button class="btn ghost" data-del-p="${p.id}">Löschen</button>`:''}</td>
        </tr>`);
      opts.push(`<option value="${p.id}" data-name="${p.name}">${p.name}</option>`);
      tw+=(p.wins||0);t8+=(p.top8||0);
    });
    playersTBody.innerHTML=rows.join('');
    mPlayerSelect.innerHTML=opts.join('');
    $('#kpi-players').textContent=snap.size;
    $('#kpi-wins').textContent=tw;
    $('#kpi-top8').textContent=t8;
    $$('[data-del-p]').forEach(b=>b.onclick=async()=>{
      if(!currentUser)return alert('Login erforderlich.');
      if(!isAdminUI)return alert('Keine Adminrechte.');
      if(!confirm('Diesen Spieler wirklich löschen?'))return;
      await deleteDoc(docRef(C_PLAYERS,b.dataset.delP));
    });
  });

  /* ---------- Matches ---------- */
  function tierToText(code){
    return {L:'Local',R:'Regional',I:'International',C:'Challenge',S:'Special',W:'Worlds'}[code]||'';
  }
  async function recomputePlayerStats(pid){
    if(!pid)return;
    const all=await getDocs(col(C_MATCHES));
    let w=0,l=0,d=0;const decks=new Set();
    all.forEach(doc=>{
      const m=doc.data();
      if(m.playerId!==pid)return;
      if(m.res==='W')w++;else if(m.res==='L')l++;else if(m.res==='D')d++;
      if(m.deck)decks.add(m.deck.trim());
    });
    const pSnap=await getDoc(docRef(C_PLAYERS,pid));
    if(pSnap.exists())await setDoc(docRef(C_PLAYERS,pid),{...pSnap.data(),wins:w,losses:l,draws:d,decks:[...decks]});
  }

  $('#match-form')?.addEventListener('submit',async e=>{
    e.preventDefault();
    if(submitting.match)return;
    if(!currentUser)return alert('Login erforderlich.');
    const btn=e.submitter;
    submitting.match=true;btn?.setAttribute('disabled','');
    const opt=mPlayerSelect.selectedOptions[0];
    const pid=opt?.value||'',pname=opt?.dataset.name||'';
    const m={
      date:$('#m-date').value||new Date().toISOString().slice(0,10),
      playerId:pid,player:pname,
      deck:$('#m-deck').value.trim(),
      opp:$('#m-opp').value.trim(),
      res:$('#m-res').value,
      tier:$('#m-tier').value,
      event:$('#m-event').value.trim()
    };
    try{
      await addDoc(col(C_MATCHES),m);
      if(pid)await recomputePlayerStats(pid);
      e.target.reset();
    }catch(err){alert('Fehler: '+err.message);}
    submitting.match=false;btn?.removeAttribute('disabled');
  });

  const matchesTBody=$('#matches-table tbody');
  onSnapshot(query(col(C_MATCHES),orderBy('date','desc')),(snap)=>{
    const rows=[];
    snap.forEach(d=>{
      const m=d.data();
      rows.push(`
        <tr>
          <td>${m.date||''}</td><td>${m.player||''}</td><td>${m.deck||''}</td>
          <td>${m.opp||''}</td><td>${m.res||''}</td>
          <td>${tierToText(m.tier)||''}${m.event?` <span class="muted">– ${m.event}</span>`:''}</td>
          <td>${isAdminUI?`<button class="btn ghost" data-del-match="${d.id}" data-player-id="${m.playerId||''}">Löschen</button>`:''}</td>
        </tr>`);
    });
    matchesTBody.innerHTML=rows.join('');
    $$('[data-del-match]').forEach(b=>b.onclick=async()=>{
      if(!currentUser)return alert('Login erforderlich.');
      if(!isAdminUI)return alert('Keine Adminrechte.');
      if(!confirm('Diesen Match-Eintrag löschen?'))return;
      await deleteDoc(docRef(C_MATCHES,b.dataset.delMatch));
      const pid=b.dataset.playerId;if(pid)await recomputePlayerStats(pid);
    });
  });
}
