let leads=[],saved=JSON.parse(localStorage.cronerRadar||"{}"),current=null;
const $=s=>document.querySelector(s),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const savedEl=$('#saved');

function render(){
 const q=filter.value.toLowerCase(),
 a=leads.filter(x=>(x.company+" "+x.title+" "+x.location+" "+x.signals.join(" ")).toLowerCase().includes(q));
 count.textContent=leads.length;
 hot.textContent=leads.filter(x=>x.score>=70).length;
 savedEl.textContent=Object.keys(saved).length;
 results.innerHTML=a.map(x=>`<article class="card ${saved[x.id]?"saved":""}">
 <div class="top"><div><div class="company">${esc(x.company)}</div><div class="title">${esc(x.title)}</div></div>
 <span class="score">${x.score}</span></div>
 <div class="meta">${esc(x.location)} · ${esc(x.posted)}</div>
 <div class="chips">${x.signals.map(s=>`<span class="chip">${esc(s)}</span>`).join("")}</div>
 <div class="why"><b>Why it surfaced</b><br>${esc(x.signals.join(", "))}</div>
 <div class="actions">
 <button onclick="openLead('${esc(x.id)}')">View</button>
 <button onclick="toggle('${esc(x.id)}')">${saved[x.id]?"Saved ✓":"Save"}</button>
 <a class="dark" href="${esc(x.url)}" target="_blank">Job</a>
 </div></article>`).join("")||'<div class="empty">No prospects. Try another search.</div>';
}

function analyse(j){
 const t=((j.title||"")+" "+(j.description||"")).toLowerCase();
 let s=/first\s+(hr|people|human resources)/.test(t)?42:0;
 if(/build|establish|create|set up|from scratch/.test(t)&&/(hr|human resources|people)/.test(t))s+=25;
 if(/standalone|sole|only hr|only people/.test(t))s+=22;
 if(/founder|ceo|chief executive/.test(t))s+=10;
 if(/growing|growth|scale|scaling/.test(t))s+=6;
 if(/hr manager|people manager|head of people|hr lead/.test((j.title||"").toLowerCase()))s+=12;
 const sig=[];
 if(/first\s+(hr|people|human resources)/.test(t))sig.push("First HR/People hire");
 if(/build|establish|create|set up|from scratch/.test(t)&&/(hr|human resources|people)/.test(t))sig.push("Build HR function");
 if(/standalone|sole|only hr|only people/.test(t))sig.push("Standalone HR");
 if(/founder|ceo|chief executive/.test(t))sig.push("CEO/founder proximity");
 if(/growing|growth|scale|scaling/.test(t))sig.push("Growth signal");
 return {score:Math.min(99,s),signals:sig.length?sig:["HR hiring signal"]};
}

async function run(){
 const key=localStorage.serpapiKey;
 if(!key){mode.textContent="NO KEY";status.textContent="Paste your SerpApi key using Key.";return}
 status.textContent="Searching Google Jobs…";
 search.disabled=true;
 try{
  const loc=location.value||"United Kingdom",
  queries=custom.value?[custom.value]:[
   "first HR hire","first HR manager","first People hire","first People Manager",
   "build HR function","establish HR function","standalone HR manager",
   "sole HR manager","HR function from scratch","build people function"
  ];
  const all=[];
  for(const q of queries){
   const u=new URL("https://serpapi.com/search.json");
   u.searchParams.set("engine","google_jobs");
   u.searchParams.set("q",q);
   u.searchParams.set("location",loc);
   u.searchParams.set("gl","uk");
   u.searchParams.set("hl","en");
   u.searchParams.set("google_domain","google.co.uk");
   u.searchParams.set("api_key",key);
   const r=await fetch(u);
   const d=await r.json();
   if(d.error)throw Error(d.error);
   for(const j of d.jobs_results||[]){
    const a=analyse(j);
    all.push({
     id:j.job_id||btoa((j.company_name||"")+"|"+(j.title||"")+"|"+(j.location||"")),
     company:j.company_name||"Unknown company",
     title:j.title||"HR role",
     location:j.location||loc,
     posted:j.detected_extensions?.posted_at||"",
     score:a.score,
     signals:a.signals,
     url:j.share_link||j.apply_options?.[0]?.link||"#",
     desc:j.description||"",
     source:"Google Jobs"
    });
   }
  }
  const by=new Map();
  for(const x of all){
   const k=x.company.toLowerCase().trim();
   if(!by.has(k)||x.score>by.get(k).score)by.set(k,x);
  }
  leads=[...by.values()].sort((a,b)=>b.score-a.score);
  mode.textContent="LIVE";
  render();
  status.textContent=`${leads.length} company prospects found across ${queries.length} searches.`;
 }catch(e){
  status.textContent=e.message;
 }finally{
  search.disabled=false;
 }
}

function toggle(id){
 if(saved[id])delete saved[id];
 else saved[id]={note:""};
 localStorage.cronerRadar=JSON.stringify(saved);
 render();
}

function openLead(id){
 current=leads.find(x=>x.id===id);
 if(!current)return;
 const note=saved[id]?.note||"";
 detail.innerHTML=`<div class="detail">
 <h2>${esc(current.company)}</h2>
 <div class="title">${esc(current.title)}</div>
 <p>${esc(current.location)} · ${esc(current.posted)}</p>
 <div class="chips">${current.signals.map(s=>`<span class="chip">${esc(s)}</span>`).join("")}</div>
 <h3>Why this is worth calling</h3>
 <p>${esc(current.desc).slice(0,1800)}</p>
 <h3>Croner opener</h3>
 <div class="script">“Hi, I’m calling from Croner. I noticed you’re recruiting for ${esc(current.title)}. I was interested because it looks like you’re putting dedicated HR/People resource in place. What prompted the hire, and have you already got your HR policies, employment support and day-to-day infrastructure covered?”</div>
 <h3>Notes</h3>
 <textarea id="note" class="note">${esc(note)}</textarea>
 </div>
 <button class="save" onclick="saveNote()">Save notes</button>`;
 dialog.showModal();
}

function saveNote(){
 saved[current.id]={note:note.value};
 localStorage.cronerRadar=JSON.stringify(saved);
 dialog.close();
 render();
}

function csv(){
 const rows=[["Company","Role","Location","Posted","Score","Signals","Job URL"]];
 leads.filter(x=>saved[x.id]).forEach(x=>rows.push([
  x.company,x.title,x.location,x.posted,x.score,x.signals.join("; "),x.url
 ]));
 if(rows.length<2)return alert("Save prospects first.");
 const s=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
 const a=document.createElement("a");
 a.href=URL.createObjectURL(new Blob([s],{type:"text/csv"}));
 a.download="croner-google-job-prospects.csv";
 a.click();
}

settings.onclick=()=>{
 keybox.hidden=!keybox.hidden;
 apiKey.value=localStorage.serpapiKey||"";
};

saveKey.onclick=()=>{
 if(!apiKey.value.trim())return;
 localStorage.serpapiKey=apiKey.value.trim();
 keybox.hidden=true;
 status.textContent="Key saved on this iPhone. Tap Find prospects.";
 mode.textContent="READY";
};

search.onclick=run;
filter.oninput=render;
export.onclick=csv;
render();
