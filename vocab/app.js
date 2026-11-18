'use strict';
// Vocab 500: 500 words. Daily study with spaced review, learn / quiz by week and day,
// close words side by side, and a searchable index. Progress stays in this browser (localStorage); Settings
// can save it to a file and load it on another device.

// ---------- basics ----------
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const BN='০১২৩৪৫৬৭৮৯',bn=n=>String(n);   // numbers are shown in English digits
const toInt=v=>{const x=parseInt(String(v||'').trim().replace(/[০-৯]/g,c=>BN.indexOf(c)),10);return Number.isFinite(x)?x:0};
const pad=n=>String(n).padStart(2,'0');
const today=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const addDays=(iso,k)=>new Date(Date.parse(iso+'T00:00:00Z')+k*864e5).toISOString().slice(0,10);
const dayDiff=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/864e5);
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const cap=w=>w.charAt(0).toUpperCase()+w.slice(1);
const N=VWL.length;
// ?embed: running inside another app's tab (the Shobdo extension's Library); the menu sits on top instead of at the side
const EMBED=new URLSearchParams(location.search).has('embed');if(EMBED)document.documentElement.classList.add('embed');
const D=n=>WD_DETAIL[n]||null,has=n=>!!WD_DETAIL[n];
const READY=Object.keys(WD_DETAIL).map(Number).sort((a,b)=>a-b);
// a close word's number comes from the list (0 = not one of the 500)
Object.values(WD_CONF).forEach(G=>G.w.forEach(x=>{x.n=VWL.indexOf(x.w)+1}));
const groupsOf=n=>((D(n)||{}).cf||[]).filter(g=>WD_CONF[g]);
// days follow Settings → new words a day. A week is 7 days: Days 1-6 bring new words, Day 7 revises that week's words.
// With 10 a day: Day 1 is #1-10 … Day 6 is #51-60, Day 7 revises #1-60, Day 8 is #61-70.
const per=()=>S.daily||5,WK=()=>6*per();
const WEEKS=()=>Math.ceil(N/WK()),weekOf=d=>Math.ceil(d/7);
const weekRange=w=>[(w-1)*WK()+1,Math.min(N,w*WK())];
const learnDays=w=>{const[a,z]=weekRange(w);return Math.ceil((z-a+1)/per())};   // 6, fewer in the last week
const revDay=w=>(w-1)*7+learnDays(w)+1;                                        // Day 7 (or the day after the last week's last new day)
const isRev=d=>d==revDay(weekOf(d));
const dayOf=n=>{const w=Math.ceil(n/WK());return(w-1)*7+Math.floor(((n-1)%WK())/per())+1};
const dayRange=d=>{const w=weekOf(d);if(isRev(d))return weekRange(w);const a=(w-1)*WK()+((d-1)%7)*per()+1;return[a,Math.min(N,a+per()-1)]};

// ---------- saved progress ----------
// w[n] = {b: box 1-5, due: date, r: right, x: wrong, at: first seen}
// box: 1-2 learning, 3-4 remembered, 5 firmly known. INT = days until the next review for each box
const KEY='vocab500',INT={1:1,2:3,3:7,4:16,5:35};
const S0={v:1,w:{},star:[],daily:5,log:{},newOn:{},extraOn:{},revDone:{},theme:'system'};
let S=load();
function load(){try{const o=JSON.parse(localStorage.getItem(KEY)||'null');if(o&&o.v==1)return{...S0,...o}}catch(e){}return JSON.parse(JSON.stringify(S0))}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
const rec=n=>S.w[n]||null;
const level=n=>{const r=rec(n);if(!r)return 0;return r.b>=5?3:r.b>=3?2:1};   // 0 new · 1 learning · 2 remembered · 3 firmly known
const LEVEL=['New','Learning','Remembered','Mastered'];
const pl=(n,w)=>`${n} ${w}${n==1?'':'s'}`;   // 1 word, 2 words
const starred=n=>S.star.includes(n);
function logDay(newWord){const t=today();S.log[t]=(S.log[t]||0)+1;if(newWord)S.newOn[t]=(S.newOn[t]||0)+1}
function streak(){let d=today(),n=0;if(!S.log[d])d=addDays(d,-1);while(S.log[d]){n++;d=addDays(d,-1)}return n}
const dueList=()=>Object.keys(S.w).map(Number).filter(n=>S.w[n].due<=today()).sort((a,b)=>S.w[a].due<S.w[b].due?-1:S.w[a].due>S.w[b].due?1:a-b);
const revisedToday=()=>Object.values(S.revDone||{}).includes(today());   // a revision day brings no new words (except "more new")
const newLeftToday=()=>Math.max(0,(revisedToday()?0:S.daily)+((S.extraOn||{})[today()]||0)-(S.newOn[today()]||0));
// Day 7 on Today: once every word of a week has been started, the next study day revises that week instead of
// bringing new words. Not on a day that already brought new words; done once the revision session is finished.
const revKey=w=>weekRange(w).join('-');   // revDone['1-60'] = the date week #1-60 was revised
function revWeek(){S.revDone=S.revDone||{};for(let w=1;w<=WEEKS();w++){const[a,z]=weekRange(w);let all=true;for(let n=a;n<=z;n++)if(!rec(n)){all=false;break}
if(!all)return 0;if(!S.revDone[revKey(w)])return w}return 0}
const revToday=()=>{const w=revWeek();return w&&!S.newOn[today()]?w:0};
function todayPlan(){const w=revToday(),due=dueList();if(w){const[a,z]=weekRange(w),wk=[];for(let n=a;n<=z;n++)wk.push(n);
return{w,rev:wk,due:due.filter(n=>n<a||n>z).slice(0,60),nw:[]}}return{w:0,rev:[],due:due.slice(0,60),nw:nextNew(newLeftToday())}}
const nextNew=k=>READY.filter(n=>!rec(n)).slice(0,k);

// rating a card: again (back later today) · hard (tomorrow) · good (next box) · easy (two boxes up)
function rate(n,r){const o=rec(n),wasNew=!o,x=o?{...o}:{b:0,due:today(),r:0,x:0,at:today()};
if(r=='again'){x.b=1;x.due=today();x.x++}
else if(r=='hard'){x.b=Math.max(1,x.b);x.due=addDays(today(),1);x.r++}
else{x.b=wasNew?(r=='easy'?3:2):Math.min(5,x.b+(r=='easy'?2:1));x.due=addDays(today(),INT[x.b]);x.r++}
S.w[n]=x;logDay(wasNew);save()}
// what each rating would do, for the button labels
function preview(n){const o=rec(n),b=o?o.b:0,g=o?Math.min(5,b+1):2,e=o?Math.min(5,b+2):3,d=k=>k==1?'tomorrow':`in ${k} days`;
return{again:'later today',hard:'tomorrow',good:d(INT[g]),easy:d(INT[e])}}
// a quiz answer moves a word too: wrong → back to box 1 for today; right on a due word → like "good"
function quizMark(n,ok){if(!has(n))return;const o=rec(n);
if(!ok){S.w[n]={...(o||{r:0,x:0,at:today()}),b:1,due:today(),x:((o||{}).x||0)+1};logDay(!o);save();return}
if(o&&o.due<=today()){rate(n,'good');return}if(o){o.r++;logDay(false);save()}}

// ---------- small pieces ----------
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),2400)}
let PLAYING=null;
function speak(w){try{if(!speechSynthesis.getVoices().length){toast('No pronunciation for this word yet');return}const u=new SpeechSynthesisUtterance(w);u.lang='en-US';u.rate=.85;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){toast('No pronunciation for this word yet')}}
function say(w){if(typeof AUDIO!='undefined'&&AUDIO.has(w)){try{if(PLAYING)PLAYING.pause();PLAYING=new Audio('audio/'+encodeURIComponent(w)+'.mp3');PLAYING.play().catch(()=>speak(w));return}catch(e){}}speak(w)}
// the word (and its forms: abated, abhors...) marked inside a sentence
function mark(s,w){const stem=w.replace(/e$/,'');return esc(s).replace(new RegExp(`\\b(${stem}[a-z]*)`,'gi'),'<mark>$1</mark>')}
const sayBtn=w=>`<button class="say" data-act="say" data-w="${esc(w)}" aria-label="Hear: ${esc(w)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none"/></svg></button>`;
const findBtn=w=>`<button class="find" data-act="find" data-w="${esc(w)}" title="Search Google: ${esc(w)} Bangla meaning with mnemonic"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><span>Google</span></button>`;
// opens next to the app (desktop) and is reused for the next word; phones open it as a tab
function find(w){const url='https://www.google.com/search?q='+encodeURIComponent(w+' Bangla meaning with mnemonic');
const W=480,H=Math.min(720,(screen.availHeight||800)-100),left=Math.max(0,(window.screenX||0)+(window.outerWidth||W)-W-16),top=(window.screenY||0)+80;
const win=window.open(url,'vocab500-google',innerWidth>760?`popup,width=${W},height=${H},left=${left},top=${top}`:'');
if(win)try{win.focus()}catch(e){}else location.href=url}
const starBtn=n=>`<button class="star${starred(n)?' on':''}" data-act="star" data-n="${n}" aria-pressed="${starred(n)}" aria-label="Star this word">${starred(n)?'★':'☆'}</button>`;
const where=n=>`#${n} · Day ${dayOf(n)}`;

// one close-word group: what each word is for, with its example; the word being studied is outlined
function groupHtml(g,cur){const G=WD_CONF[g];
return `<div class="grp"><h3>${esc(G.t)}</h3><div class="gws">${G.w.map(x=>{const me=x.w==cur,link=x.n&&has(x.n)&&!me&&!SES&&!QZ;   // no links mid-session: a tap would end it
return `<div class="gw${me?' me':''}"><div class="gwh">${link?`<a href="#/w/${x.n}">${esc(x.w)}</a>`:`<b>${esc(x.w)}</b>`}<span class="num">${x.n?'#'+bn(x.n):'not in the 500'}</span></div>
<p class="gu">${esc(x.u)}</p><p class="ex">${mark(x.ex,x.w)}</p></div>`}).join('')}</div><p class="tip">${esc(G.tip)}</p></div>`}

// a word, everything about it (the back of the card)
function backHtml(n){const d=D(n),w=VWL[n-1];if(!d)return `<p class="soon">The meaning, memory trick and example for this word aren't written yet.</p>`;const gs=groupsOf(n);
return `<div class="back">
<p class="bnm">${esc(d.bn)}</p><p class="enm">${esc(d.en)}</p>
<div class="hook"><span class="hk">Memory trick</span><p>${esc(d.mn)}</p></div>
<div class="exb"><p class="ex">${mark(d.ex,w)}</p><p class="exbn">${esc(d.exb)}</p></div>
<dl class="rel"><div><dt>Synonyms</dt><dd>${esc(d.syn)}</dd></div><div><dt>Opposites</dt><dd>${esc(d.ant)}</dd></div>${d.forms?`<div><dt>Forms</dt><dd>${esc(d.forms)}</dd></div>`:''}</dl>
${gs.length?`<section class="close"><h2>Close words: which one goes where</h2>${gs.map(g=>groupHtml(g,w)).join('')}</section>`:''}</div>`}
function cardHead(n,open){const d=D(n),w=VWL[n-1];   // open: the meaning is showing, so the Google button may show too
return `<div class="chead"><span class="where">${where(n)}</span>${starBtn(n)}</div>
<div class="wline"><h1 class="word">${esc(w)}</h1>${sayBtn(w)}${open?findBtn(w):''}</div>${d?`<p class="pos">${esc(d.pos)}</p>`:''}`}

// ---------- the range picker: by week and day, or any numbers ----------
// R = {k:'learn'|'quiz', w: week, d: day number (0 = the whole week), a, z}
const RG={learn:{},quiz:{}};
function setRange(k,w,d){const r=RG[k];r.w=w;r.d=d;[r.a,r.z]=dayRange(d)}
// Learn starts on the week's first day, Quiz on its revision day
function resetRanges(){setRange('learn',1,1);setRange('quiz',1,revDay(1))}
function rangePicker(k){const r=RG[k],[a,z]=weekRange(r.w),d0=(r.w-1)*7+1,d1=revDay(r.w);
const wdone=w=>{const[x,y]=weekRange(w);let c=0;for(let n=x;n<=y;n++)if(level(n)>=2)c++;return c/(y-x+1)};
return `<div class="picker">
<div class="plabel">Week <small>(${per()} words a day)</small></div>
<div class="blocks" role="group" aria-label="Week">${Array.from({length:WEEKS()},(_,i)=>i+1).map(w=>`<button class="blk${r.w==w?' on':''}" data-act="rb" data-k="${k}" data-b="${w}" style="--p:${Math.round(wdone(w)*100)}%" aria-pressed="${r.w==w}" title="Week ${w}: #${weekRange(w)[0]}–${weekRange(w)[1]}"><span>${w}</span></button>`).join('')}</div>
<div class="plabel">Week ${r.w}: #${a}–${z}</div>
<div class="days">${Array.from({length:d1-d0+1},(_,i)=>d0+i).map(d=>{const[x,y]=dayRange(d),rv=isRev(d);return `<button class="chip${rv?' rev':''}${r.d==d?' on':''}" data-act="rd" data-k="${k}" data-d="${d}">Day ${d}${rv?': revise':''} <small>#${x}–${y}</small></button>`}).join('')}</div>
<details class="custom"${r.custom?' open':''}><summary>Pick your own numbers</summary><div class="nums"><label>From<input type="number" inputmode="numeric" id="${k}a" min="1" max="${N}" value="${r.a}"></label><label>To<input type="number" inputmode="numeric" id="${k}z" min="1" max="${N}" value="${r.z}"></label><button class="ghost" data-act="rc" data-k="${k}">Set</button></div></details>
</div>`}
function rangeNums(k){const r=RG[k];let a=Math.max(1,Math.min(r.a,r.z)),z=Math.min(N,Math.max(r.a,r.z));const out=[];for(let n=a;n<=z;n++)out.push(n);return out}

// ---------- views ----------
let SES=null,QZ=null,IX={q:'',f:'all'};
const NAV=[['today','Today','<path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4"/><circle cx="12" cy="12" r="4"/>'],
['learn','Learn','<path d="M4 5h11a3 3 0 0 1 3 3v12H7a3 3 0 0 1-3-3z"/><path d="M8 9h6M8 13h4"/>'],
['quiz','Quiz','<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01"/>'],
['diff','Close words','<path d="M7 4v16M17 4v16M7 8h10M7 16h10"/>'],
['words','Word list','<path d="M5 4h14v16H5zM9 8h6M9 12h6M9 16h3"/>'],
['settings','Settings','<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>']];
function route(){const h=location.hash.replace(/^#\/?/,'').split('/');return{v:h[0]||'today',p:h[1]||''}}
function render(){applyTheme();const R=route(),focus=!!(SES||QZ);document.body.classList.toggle('focus',focus);
const cur=R.v=='w'?'words':R.v;
$('#nav').innerHTML=`<a class="brand" href="#/" aria-label="Vocab 500: Today"><img src="icon.svg" alt=""><span>Vocab<b>500</b></span></a>`+NAV.map(([k,l,ic])=>`<a href="#/${k=='today'?'':k}" class="ni${cur==k?' on':''}"${cur==k?' aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg><span>${l}</span></a>`).join('');
let h;if(SES)h=vSession();else if(QZ)h=vQuizRun();else h=({today:vToday,learn:vLearn,quiz:vQuiz,diff:vDiff,words:vWords,w:vWord,settings:vSettings}[R.v]||vToday)(R.p);
$('#main').innerHTML=h}

// Today: the day's study, the 500-word map
function vToday(){const P=todayPlan(),st=streak(),started=Object.keys(S.w).length,remembered=Object.keys(S.w).filter(n=>level(+n)>=2).length;
const dt=new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
const rv=P.due.length,nw=P.nw,todo=rv+nw.length+P.rev.length;
let plan;
if(P.w){const[a,z]=weekRange(P.w);plan=`<div class="plan rev"><div class="pl"><p class="big">Day ${revDay(P.w)}: revise week ${P.w}</p><p>${pl(P.rev.length,'word')} (#${a}–${z})${rv?`, plus ${rv} other to review`:''}. No new words today.</p></div><button class="go" data-act="today">Start revising</button></div>`}
else if(todo){plan=`<div class="plan"><div class="pl"><p class="big">${nw.length?`Day ${dayOf(nw[0])}`:'Review'}: ${pl(todo,'word')}</p><p>${[nw.length?`${nw.length} new (#${nw[0]}${nw.length>1?'–'+nw[nw.length-1]:''})`:'',rv?`${rv} to review`:''].filter(Boolean).join(', ')}</p></div><button class="go" data-act="today">Start studying</button></div>`}
else{const more=nextNew(5);plan=`<div class="plan done"><div class="pl"><p class="big">Done for today</p><p>${READY.every(n=>rec(n))?'You have started all 500 words. Reviews keep coming as they fall due.':(revWeek()&&!revisedToday()?`Tomorrow is Day ${revDay(revWeek())}: revise week ${revWeek()}.`:'Words to review come back tomorrow.')}</p></div>${more.length?`<button class="ghost" data-act="extra">${more.length} more new</button>`:''}</div>`}
return `<p class="date">${dt}</p>
<h1 class="title">Today</h1>
${plan}
<div class="facts"><div><b>${bn(started)}</b><span>started</span></div><div><b>${bn(remembered)}</b><span>remembered</span></div><div><b>${bn(st)}</b><span>${st==1?'day':'days'} in a row</span></div></div>
<section class="map"><div class="maph"><h2>All 500 words</h2><div class="legend">${LEVEL.map((l,i)=>`<span><i class="lv${i}"></i>${l}</span>`).join('')}</div></div>
<div class="rows">${Array.from({length:Math.ceil(N/25)},(_,i)=>{const a=i*25+1,z=Math.min(N,a+24);let c='';for(let n=a;n<=z;n++)c+=`<a href="#/w/${n}" class="cell lv${level(n)}${has(n)?'':' nd'}" title="#${n} ${VWL[n-1]}" aria-label="#${n} ${VWL[n-1]}: ${LEVEL[level(n)]}"></a>`;
return `<div class="row"><span class="rn">${a}</span><div class="cells">${c}</div></div>`}).join('')}</div>
<p class="mapnote">Each square is a word, in order: 25 to a row, the number is the row's first word. Tap a square to open its word.</p></section>`}

// Learn: pick a week, a day or any numbers, go through them as cards
function vLearn(){const ns=rangeNums('learn'),ready=ns.filter(has);
return `<h1 class="title">Learn</h1><p class="lead">Pick a week and a day, or any numbers. Days 1–6 bring new words; Day 7 revises the week. Try to recall each word yourself first, then turn the card and check.</p>
${rangePicker('learn')}
<div class="startbar"><p>${pl(ns.length,'word')}${ready.length<ns.length?`, ${ready.length} written so far`:''}</p><button class="go" data-act="learn"${ready.length?'':' disabled'}>Start</button></div>`}

// Quiz: which words, how many questions, what kind
const QO={count:10,weak:false,close:true};
function vQuiz(){const ns=rangeNums('quiz').filter(has),weak=ns.filter(n=>level(n)==1);
return `<h1 class="title">Quiz</h1><p class="lead">A mix of questions: the word to its Bangla meaning, Bangla to the word, the English meaning, fill in the blank, and close words.</p>
${rangePicker('quiz')}
<div class="qopts"><div class="plabel">Questions</div><div class="days">${[5,10,20,30,50].map(c=>`<button class="chip${QO.count==c?' on':''}" data-act="qc" data-c="${c}">${bn(c)}</button>`).join('')}</div>
<label class="tick"><input type="checkbox" data-act="qw"${QO.weak?' checked':''}> Only words I'm still learning <small>(${weak.length})</small></label>
<label class="tick"><input type="checkbox" data-act="qcl"${QO.close?' checked':''}> Include close-word questions</label></div>
<div class="startbar"><p>From ${pl(ns.length,'word')}</p><button class="go" data-act="quiz"${ns.length?'':' disabled'}>Start quiz</button></div>`}

// Close words
function vDiff(g){if(g&&WD_CONF[g])return `<a class="backlink" href="#/diff">← All close words</a><h1 class="title">${esc(WD_CONF[g].t)}</h1>${groupHtml(g,'')}<div class="startbar"><p>${pl(WD_CONF[g].q.length,'question')}</p><button class="go" data-act="gquiz" data-g="${g}">Quiz these</button></div>`;
return `<h1 class="title">Close words</h1><p class="lead">Words that look or mean almost the same: which one goes where, with examples.</p>
<div class="glist">${Object.keys(WD_CONF).map(k=>{const G=WD_CONF[k];return `<a class="gl" href="#/diff/${k}"><b>${esc(G.t)}</b><span>${G.w.map(x=>esc(x.w)).join(', ')}</span></a>`}).join('')}</div>`}

// Index
function vWords(){return `<h1 class="title">Word list</h1>
<div class="search"><input type="search" id="q" value="${esc(IX.q)}" placeholder="Search by word, number or Bangla meaning" autocomplete="off" aria-label="Search"></div>
<div class="days filt">${[['all','All'],['0','New'],['1','Learning'],['2','Remembered'],['3','Mastered'],['star','★ Starred']].map(([v,l])=>`<button class="chip${IX.f==v?' on':''}" data-act="ixf" data-v="${v}">${l}</button>`).join('')}</div>
<div class="list" id="list">${listHtml()}</div>`}
function listHtml(){const q=IX.q.trim().toLowerCase(),qn=toInt(q);let lastB=0;
const ns=VWL.map((w,i)=>i+1).filter(n=>{const d=D(n);if(q&&!(VWL[n-1].includes(q)||(qn&&n==qn)||(d&&d.bn.includes(IX.q.trim()))))return false;
if(IX.f=='star')return starred(n);if(IX.f!='all')return level(n)==+IX.f;return true});
if(!ns.length)return `<p class="empty">No match. Try another spelling or a number.</p>`;
return ns.map(n=>{const d=D(n),b=weekOf(dayOf(n)),hd=!q&&IX.f=='all'&&b!=lastB?`<h3 class="lb">Week ${b}: #${weekRange(b)[0]}–${weekRange(b)[1]}</h3>`:'';lastB=b;
return hd+`<a class="li${d?'':' nd'}" href="#/w/${n}"><span class="num">${bn(n)}</span><i class="dot lv${level(n)}"></i><b>${esc(VWL[n-1])}</b><span class="m">${d?esc(d.bn):'not written yet'}</span>${starred(n)?'<span class="st">★</span>':''}</a>`}).join('')}

// one word, from the index or the map
function vWord(p){const n=Math.min(N,Math.max(1,toInt(p)||1)),r=rec(n);
return `<div class="wnav"><a class="backlink" href="#/words">← Word list</a><span><a class="ghost sm" href="#/w/${n>1?n-1:N}" aria-label="Previous word">‹</a><a class="ghost sm" href="#/w/${n<N?n+1:1}" aria-label="Next word">›</a></span></div>
<article class="card open">${cardHead(n,true)}${backHtml(n)}
${has(n)?`<div class="state"><span>${LEVEL[level(n)]}${r?`, next review ${r.due<=today()?'today':dayDiff(today(),r.due)==1?'tomorrow':'in '+dayDiff(today(),r.due)+' days'}`:''}</span><span>${r?'':`<button class="ghost sm" data-act="add" data-n="${n}">Add to today</button>`}<button class="ghost sm" data-act="known" data-n="${n}">I know this</button></span></div>`:''}</article>`}

function vSettings(){const th=[['system','Same as device'],['light','Light'],['dark','Dark']];
return `<h1 class="title">Settings</h1>
<section class="set"><h2>New words a day</h2><p>Each day brings this many new words: with 10, Day 1 is #1–10. Days 1–6 of a week are new words, Day 7 revises the whole week. More new words also means more reviews.</p><div class="days">${[5,10,15,20].map(c=>`<button class="chip${S.daily==c?' on':''}" data-act="daily" data-c="${c}">${c}</button>`).join('')}</div></section>
<section class="set"><h2>Theme</h2><div class="days">${th.map(([v,l])=>`<button class="chip${S.theme==v?' on':''}" data-act="theme" data-v="${v}">${l}</button>`).join('')}</div></section>
<section class="set"><h2>Move your progress to another device</h2><p>Progress is kept in this browser. Save it to a file and open that file on the other device.</p><div class="days"><button class="ghost" data-act="export">Save to file</button><button class="ghost" data-act="import">Load from file</button></div></section>
<section class="set"><h2>Start over</h2><p>This erases the record of every word you have studied.</p><button class="ghost danger" data-act="reset">Erase progress</button></section>`}

// ---------- study session (Today, or Learn) ----------
// queue items are word numbers; "again" puts the word back a few cards later (at most twice)
function startToday(){const P=todayPlan();startSession('today',[...P.due,...P.rev,...P.nw]);if(SES&&P.w)SES.rev=P.w}
function startSession(kind,ns){ns=ns.filter(has);if(!ns.length){toast('The words in this part are not written yet');return}
SES={kind,q:[...ns],i:0,shown:false,again:{},seen:ns,count:{again:0,hard:0,good:0,easy:0},fresh:ns.filter(n=>!rec(n))};scrollTo(0,0)}
function vSession(){const s=SES;if(s.i>=s.q.length)return vSessionEnd();const n=s.q[s.i],isNew=!rec(n)&&!s.again[n],p=preview(n);
const pct=Math.round(s.i/s.q.length*100);
return `<div class="sbar"><button class="x" data-act="quit" aria-label="Stop">✕</button><div class="prog" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div><span class="cnt">${s.i+1}/${s.q.length}</span></div>
<article class="card${s.shown?' open':''}">${isNew?'<span class="newtag">New word</span>':''}${cardHead(n,s.shown)}
${s.shown?backHtml(n):`<div class="front"><p>Try to recall the meaning. Even if you can't, turning the card still helps you learn it.</p></div>`}</article>
<div class="actions">${s.shown?`<div class="rates">
<button class="r again" data-act="rate" data-r="again"><b>Again</b><small>${p.again}</small></button>
<button class="r hard" data-act="rate" data-r="hard"><b>Hard</b><small>${p.hard}</small></button>
<button class="r good" data-act="rate" data-r="good"><b>Good</b><small>${p.good}</small></button>
<button class="r easy" data-act="rate" data-r="easy"><b>Easy</b><small>${p.easy}</small></button></div><p class="keys">Keys: 1 2 3 4</p>`
:`<button class="go wide" data-act="show">Show meaning</button><p class="keys">Key: Space</p>`}</div>`}
function vSessionEnd(){const s=SES,c=s.count,checked=s.seen.length;
return `<div class="end"><h1 class="title">${s.rev?`Week ${s.rev} revised`:s.kind=='today'?'Done for today':'All done'}</h1>
<p class="lead">You went through ${pl(checked,'word')}: knew it ${c.good+c.easy} times, found it hard ${c.hard} times, needed it again ${c.again} times.</p>
<div class="chips">${s.seen.map(n=>`<a class="wchip lv${level(n)}" href="#/w/${n}">${esc(VWL[n-1])}</a>`).join('')}</div>
<div class="endbtns"><button class="ghost" data-act="done">Done</button><button class="go" data-act="check">Test these (quiz)</button></div></div>`}

// ---------- quiz ----------
// kinds: wb word → Bangla · bw Bangla → word · ew English meaning → word · fb fill the blank · cf close words
function cfItem(g,i){const G=WD_CONF[g],[s,a]=G.q[i];return{kind:'cf',g,n:(G.w.find(x=>x.w==a)||{}).n||0,prompt:s,opts:shuffle(G.w.map(x=>x.w)),ans:a}}
function makeQuiz(ns,count,withClose){const pool=READY,Q=[],used=new Set(),kinds=['wb','bw','ew','fb'];
const others=n=>shuffle(pool.filter(x=>x!=n)).slice(0,3);
const mc=(n,k)=>{const d=D(n),w=VWL[n-1],o=others(n);
if(k=='wb')return{kind:k,n,prompt:w,opts:shuffle([d.bn,...o.map(x=>D(x).bn)]),ans:d.bn};
return{kind:k,n,prompt:k=='bw'?d.bn:k=='ew'?d.en:d.fb,opts:shuffle([w,...o.map(x=>VWL[x-1])]),ans:w}};
if(withClose){const gs=new Set();ns.forEach(n=>groupsOf(n).forEach(g=>gs.add(g)));const cf=[];gs.forEach(g=>WD_CONF[g].q.forEach((_,i)=>cf.push(cfItem(g,i))));
shuffle(cf).slice(0,Math.round(count*.3)).forEach(x=>Q.push(x))}
let order=shuffle(ns),j=0,guard=0;
while(Q.length<count&&guard++<count*30){const n=order[j%order.length],k=kinds[Math.floor(Math.random()*4)];j++;if(j%order.length==0)order=shuffle(ns);
if(used.has(k+n)&&used.size<ns.length*4)continue;used.add(k+n);Q.push(mc(n,k))}
return shuffle(Q)}
function startQuiz(items,again){if(!items.length){toast('No words to quiz in this part');return}QZ={items,i:0,pick:null,right:0,wrong:[],again};scrollTo(0,0)}
const QK={wb:'Which is its Bangla meaning?',bw:'Which word means this?',ew:'Which word has this meaning?',fb:'Which word fills the blank?',cf:'Close words: which one fits?'};
function vQuizRun(){const z=QZ,T=z.items.length;if(z.i>=T)return vQuizEnd();const it=z.items[z.i],ans=z.pick!=null,ok=ans&&it.opts[z.pick]==it.ans;
const blank=s=>esc(s).replace('___','<span class="blank" aria-label="blank">&nbsp;</span>');
const pr=it.kind=='wb'?`<p class="qw">${esc(it.prompt)} ${sayBtn(it.prompt)}</p>`:it.kind=='fb'||it.kind=='cf'?`<p class="qs">${blank(it.prompt)}</p>`:`<p class="qs">${esc(it.prompt)}</p>`;
const pct=Math.round(z.i/T*100);
let why='';if(ans){if(it.kind=='cf'){const G=WD_CONF[it.g],x=G.w.find(y=>y.w==it.ans);why=`<b>${esc(it.ans)}</b>: ${esc(x.u)}<span class="tip">${esc(G.tip)}</span>`}
else{const d=D(it.n);why=`<b>${esc(VWL[it.n-1])}</b>: ${esc(d.bn)}<span class="tip">${esc(d.mn)}</span>`}}
return `<div class="sbar"><button class="x" data-act="qquit" aria-label="Stop">✕</button><div class="prog"><span style="width:${pct}%"></span></div><span class="cnt">${z.i+1}/${T}</span></div>
<article class="card q"><p class="qk">${QK[it.kind]}</p>${pr}
<div class="opts${it.kind=='wb'?' bnopts':''}">${it.opts.map((o,i)=>{const c=!ans?'':o==it.ans?' right':i==z.pick?' wrong':' dim';return `<button class="opt${c}" data-act="pick" data-i="${i}"${ans?' disabled':''}><kbd>${bn(i+1)}</kbd><span>${esc(o)}</span></button>`}).join('')}</div>
${ans?`<div class="why ${ok?'ok':'bad'}"><p class="verdict">${ok?'Right':'Not quite'}</p><p>${why}</p></div>`:''}</article>
<div class="actions">${ans?`<button class="go wide" data-act="next">${z.i+1<T?'Next question':'See result'}</button><p class="keys">Key: Enter</p>`:`<p class="keys">Keys: 1–${it.opts.length}</p>`}</div>`}
function vQuizEnd(){const z=QZ,T=z.items.length,pct=Math.round(z.right/T*100),wn=[...new Set(z.wrong.filter(has))];
return `<div class="end"><p class="score"><b>${bn(z.right)}</b>/${bn(T)}</p><h1 class="title">${pct>=80?'Excellent':pct>=50?'Good going':'Have another look'}</h1>
<p class="lead">${wn.length?`The ${pl(wn.length,'word')} you missed come back in today's review.`:'All correct.'}</p>
${wn.length?`<div class="list">${wn.map(n=>`<a class="li" href="#/w/${n}"><span class="num">${bn(n)}</span><b>${esc(VWL[n-1])}</b><span class="m">${esc(D(n).bn)}</span></a>`).join('')}</div>`:''}
<div class="endbtns"><button class="ghost" data-act="qdone">Done</button>${wn.length?`<button class="ghost" data-act="qwrong">Quiz the missed ones</button>`:''}<button class="go" data-act="qagain">New quiz</button></div></div>`}

// ---------- actions ----------
function readNums(k){const a=$('#'+k+'a'),z=$('#'+k+'z');if(!a)return;const r=RG[k];r.a=Math.min(N,Math.max(1,toInt(a.value)||1));r.z=Math.min(N,Math.max(1,toInt(z.value)||r.a));r.d=-1;r.custom=true}
function act(el){const A=el.dataset,s=SES,z=QZ;
switch(A.act){
case'say':say(A.w);return;
case'find':find(A.w);return;
case'star':{const n=+A.n,i=S.star.indexOf(n);i>=0?S.star.splice(i,1):S.star.push(n);save();break}
case'rb':{const w=+A.b;setRange(A.k,w,A.k=='quiz'?revDay(w):(w-1)*7+1);RG[A.k].custom=false;break}
case'rd':setRange(A.k,RG[A.k].w,+A.d);RG[A.k].custom=false;break;
case'rc':readNums(A.k);break;
case'today':startToday();break;
case'extra':{const t=today();S.extraOn=S.extraOn||{};S.extraOn[t]=(S.extraOn[t]||0)+5;save();startSession('today',nextNew(newLeftToday()));break}
case'learn':startSession('learn',rangeNums('learn'));break;
case'show':s.shown=true;break;
case'rate':{const n=s.q[s.i];rate(n,A.r);s.count[A.r]++;if(A.r=='again'&&(s.again[n]||0)<2){s.again[n]=(s.again[n]||0)+1;s.q.splice(Math.min(s.q.length,s.i+4),0,n)}s.i++;s.shown=false;if(s.i>=s.q.length&&s.rev){S.revDone[revKey(s.rev)]=today();save()}scrollTo(0,0);break}
case'quit':if(s.i>0&&s.i<s.q.length&&!confirm('Stop now? What you have done so far is kept.'))return;SES=null;break;
case'done':SES=null;break;
case'check':{const ns=SES.seen;SES=null;startQuiz(makeQuiz(ns,Math.min(20,Math.max(5,ns.length*2)),true),{ns});break}
case'qc':QO.count=+A.c;break;
case'qw':QO.weak=!QO.weak;break;
case'qcl':QO.close=!QO.close;break;
case'quiz':{let ns=rangeNums('quiz').filter(has);if(QO.weak){ns=ns.filter(n=>level(n)==1);if(!ns.length){toast('No words in this part are still being learnt');return}}startQuiz(makeQuiz(ns,QO.count,QO.close),{ns,count:QO.count,close:QO.close});break}
case'gquiz':startQuiz(shuffle(WD_CONF[A.g].q.map((_,i)=>cfItem(A.g,i))),{g:A.g});break;
case'pick':{if(z.pick!=null)return;z.pick=+A.i;const it=z.items[z.i],ok=it.opts[z.pick]==it.ans;if(ok)z.right++;else z.wrong.push(it.n);if(it.n)quizMark(it.n,ok);break}
case'next':z.i++;z.pick=null;scrollTo(0,0);break;
case'qquit':if(z.i>0&&z.i<z.items.length&&!confirm('Stop the quiz?'))return;QZ=null;break;
case'qdone':QZ=null;break;
case'qwrong':{const wn=[...new Set(z.wrong.filter(has))];startQuiz(makeQuiz(wn,Math.max(5,wn.length*2),false),{ns:wn,count:Math.max(5,wn.length*2)});break}
case'qagain':{const a=z.again||{};startQuiz(a.g?shuffle(WD_CONF[a.g].q.map((_,i)=>cfItem(a.g,i))):makeQuiz(a.ns,a.count||10,a.close!==false),a);break}
case'ixf':IX.f=A.v;break;
case'add':{const n=+A.n;S.w[n]={b:1,due:today(),r:0,x:0,at:today()};save();toast('Added to today');break}
case'known':{const n=+A.n,o=rec(n)||{r:0,x:0,at:today()};S.w[n]={...o,b:4,due:addDays(today(),INT[4])};save();toast(`OK, it will come back once in ${INT[4]} days`);break}
case'daily':S.daily=+A.c;save();resetRanges();break;
case'theme':S.theme=A.v;save();break;
case'export':{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(S)],{type:'application/json'}));a.download=`vocab500-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);return}
case'import':{const f=document.createElement('input');f.type='file';f.accept='.json,application/json';f.onchange=()=>{const x=f.files[0];if(!x)return;x.text().then(t=>{try{const o=JSON.parse(t);if(o.v!=1||!o.w)throw 0;if(!confirm('Replace your current progress with the one in this file?'))return;S={...S0,...o};save();resetRanges();render();toast('Progress loaded')}catch(e){toast('This is not a Vocab 500 progress file')}})};f.click();return}
case'reset':if(!confirm('Erase the record of every word you have studied?'))return;S={...JSON.parse(JSON.stringify(S0)),theme:S.theme};save();resetRanges();toast('Progress erased');break;
default:return}
render()}
function applyTheme(){const t=S.theme=='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):S.theme;document.documentElement.dataset.theme=t}

document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;if(b.tagName=='INPUT'){act(b);return}e.preventDefault();act(b)});
document.addEventListener('input',e=>{if(e.target.id=='q'){IX.q=e.target.value;$('#list').innerHTML=listHtml()}});
document.addEventListener('keydown',e=>{
if(e.target.tagName=='INPUT'){if(e.key=='Enter'&&/^(learn|quiz)[az]$/.test(e.target.id)){readNums(e.target.id.slice(0,-1));render()}return}
if(e.ctrlKey||e.metaKey||e.altKey)return;
const click=s=>{const b=$(s);if(b){e.preventDefault();b.click();return true}return false};
const k=e.key.replace(/[০-৯]/g,c=>BN.indexOf(c));
if(SES){if(e.key=='Escape')return click('[data-act=quit]');if(e.key==' '||e.key=='Enter'){if(click('[data-act=show]'))return;if(e.key=='Enter')click('[data-act=rate][data-r=good]');else e.preventDefault();return}
const r={1:'again',2:'hard',3:'good',4:'easy'}[k];if(r)click(`[data-act=rate][data-r=${r}]`);return}
if(QZ){if(e.key=='Escape')return click('[data-act=qquit]');if(/^[1-9]$/.test(k))return click(`[data-act=pick][data-i="${+k-1}"]:not([disabled])`);if(e.key=='Enter')click('[data-act=next]')}});
window.addEventListener('hashchange',()=>{if(SES||QZ){SES=null;QZ=null}render();scrollTo(0,0)});
try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(S.theme=='system')applyTheme()})}catch(e){}
window.addEventListener('storage',e=>{if(e.key==KEY){S=load();render()}});
// #/start (library.html#vocab/start in Shobdo) opens straight into today's study
if(location.hash=='#/start'){history.replaceState(null,'','#/');if(dueList().length||newLeftToday())startToday()}
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
resetRanges();
render();
