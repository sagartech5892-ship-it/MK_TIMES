import { siteRef, onSnapshot } from "./firebase.js";

const fallback = {
  live: [
    {id:"1", name:"Morning Update", time:"11:50 AM", value:"Published", locked:false},
    {id:"2", name:"Afternoon Update", time:"02:45 PM", value:"Published", locked:false}
  ],
  next: [{id:"3", name:"Evening Update", time:"04:15 PM", value:"Scheduled", locked:false}],
  records: {}
};
let data = fallback;

function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function cards(id,items){
  const el=document.getElementById(id); if(!el)return;
  el.innerHTML=(items||[]).map(x=>`<article class="card"><div><small>${escapeHtml(x.time)}</small><h3>${escapeHtml(x.name)}</h3></div><strong>${escapeHtml(x.value)}</strong></article>`).join("")||'<p class="empty">No announcements yet.</p>';
}
function render(){
  cards("live",data.live); cards("next",data.next);
  const month=document.getElementById("month");
  if(month){
    const current=month.value; month.innerHTML="";
    Object.keys(data.records||{}).sort().reverse().forEach(k=>{const o=document.createElement("option");o.value=k;o.textContent=k;month.appendChild(o);});
    if([...month.options].some(o=>o.value===current))month.value=current;
    showRecords();
  }
}
const today=document.getElementById("today");
if(today)today.textContent=new Date().toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"});
const year=document.getElementById("year"); if(year)year.textContent=new Date().getFullYear();

let refreshing=false;
window.refreshResults=function(){
  if(refreshing) return;
  refreshing=true;
  const btn=document.getElementById("refreshBtn");
  if(btn){btn.disabled=true;btn.textContent="↻ Refreshing...";}
  // Firestore onSnapshot is already real-time; reload forces a fresh connection.
  setTimeout(()=>location.reload(),150);
};

window.showRecords=function(){
  const month=document.getElementById("month"),el=document.getElementById("records");if(!month||!el)return;
  const rows=data.records?.[month.value]||[];
  el.innerHTML=`<table><thead><tr><th>Date</th><th>Status</th><th>Value</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td><td>${escapeHtml(r[2])}</td></tr>`).join("")}</tbody></table>`;
};

onSnapshot(siteRef,(snap)=>{ if(snap.exists()) data={...fallback,...snap.data()}; render(); },(err)=>{console.error(err);render();});
render();
