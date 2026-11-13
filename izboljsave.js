/* Izboljsave vmesnika: hitro dodajanje terminov, predloge, kopiranje, ponavljanje,
   statistika po osebah, izvoz, opozorilo na proste termine, izbira imena.
   Datoteka se nalozi za glavno skripto in pred initUI(); obstojece funkcije samo ovije. */
(function(){
'use strict';

var TIP_COLORS={NE:'#21834b',DA:'#8051bd',FBX:'#c77b09'};
var TIP_SHORT={NE:'Navaden',DA:'Admin',FBX:'FBX'};
var WD_NAMES=['Pon','Tor','Sre','Čet','Pet','Sob','Ned'];

function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function num(n){return Math.round((Number(n)||0)*100)/100}
function isAdmin(){return !!state.adminPin}
function dsOf(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parseDs(ds){var p=ds.split('-').map(Number);return new Date(p[0],p[1]-1,p[2])}
function addDays(ds,n){var d=parseDs(ds);d.setDate(d.getDate()+n);return dsOf(d)}
function wd(ds){return (parseDs(ds).getDay()+6)%7}
function mondayOf(ds){return addDays(ds,-wd(ds))}
function lastOfMonth(ym){var p=ym.split('-').map(Number);return ym+'-'+pad(new Date(p[0],p[1],0).getDate())}
function validDs(v){return /^\d{4}-\d{2}-\d{2}$/.test(v||'')}
function validYm(v){return /^\d{4}-\d{2}$/.test(v||'')}
function dayShort(ds){return Number(ds.slice(8))+'. '+Number(ds.slice(5,7))+'.'}
function rerenderCalendar(){renderCalendar(state.monthCache[state.ym]||[])}

/* ------------------------------------------------------------------ objava */
function publishSlots(items,okMsg){
  if(!items.length){toast('Ni terminov za dodajanje.');return Promise.resolve(false)}
  if(items.length>500){toast('Naenkrat je dovoljenih največ 500 terminov.');return Promise.resolve(false)}
  if(items.some(function(x){return !validDraftItem(x)})){toast('Preveri datum in čas (konec mora biti po začetku).');return Promise.resolve(false)}
  setSheetButtonsDisabled(true);
  return call('addSlotsBatch',items,state.adminPin,newDraftId()).then(function(res){
    if(!res||res.ok!==true){toast((res&&res.msg)||'Napaka pri objavi.');setSheetButtonsDisabled(false);return false}
    closeSheet();toast(okMsg||('Objavljeno: '+termCountLabel(res.added)+'.'));
    refreshAfterMutation(res);return true;
  }).catch(function(e){handleErr(e);return false});
}

/* ---------------------------------------------------------------- predloge */
var TPL_KEY='razpored.predloge';
function tplValid(t){return t&&validDraftItem({datum:'2026-01-01',start:t.start,end:t.end,tip:t.tip})}
function loadTpl(){
  try{var a=JSON.parse(localStorage.getItem(TPL_KEY)||'null');if(Array.isArray(a))return a.filter(tplValid)}catch(e){}
  return [{start:'07:00',end:'14:00',tip:'NE'},{start:'14:00',end:'19:00',tip:'DA'},{start:'07:00',end:'18:00',tip:'FBX'}];
}
function saveTpl(a){try{localStorage.setItem(TPL_KEY,JSON.stringify(a))}catch(e){}}
function tplLabel(t){return shortHM(t.start)+'–'+shortHM(t.end)+' '+TIP_SHORT[t.tip]}
function tplRow(getCur,apply){
  var box=el('div','tpl-row');
  function draw(){
    box.innerHTML='';box.appendChild(el('span','hint','Predloge:'));
    loadTpl().forEach(function(t,i){
      var w=el('span','tpl'),b=el('button','tpl-use',tplLabel(t)),x=el('button','tpl-del','×');
      b.type='button';b.onclick=function(){apply(t)};
      x.type='button';x.title='Odstrani predlogo';x.setAttribute('aria-label','Odstrani predlogo '+tplLabel(t));
      x.onclick=function(){var l=loadTpl();l.splice(i,1);saveTpl(l);draw()};
      w.appendChild(b);w.appendChild(x);box.appendChild(w);
    });
    var s=el('button','ghost tpl-save','+ Shrani trenutno');s.type='button';
    s.onclick=function(){
      var c=getCur();if(!tplValid(c)){toast('Najprej nastavi veljaven čas.');return}
      var l=loadTpl();if(l.some(function(t){return t.start===c.start&&t.end===c.end&&t.tip===c.tip})){toast('Ta predloga že obstaja.');return}
      l.push({start:c.start,end:c.end,tip:c.tip});saveTpl(l);draw();toast('Predloga shranjena.');
    };
    box.appendChild(s);
  }
  draw();return box;
}
function typeSelect(val){
  var s=document.createElement('select');s.setAttribute('aria-label','Tip');
  [['NE','Navaden'],['DA','Administracija'],['FBX','FuzijaBX']].forEach(function(o){var op=document.createElement('option');op.value=o[0];op.textContent=o[1];op.selected=o[0]===val;s.appendChild(op)});
  return s;
}

/* ------------------------------------- hitro dodajanje + ponavljanje (1, 4) */
function openQuickAdd(ds){
  var sheet=document.getElementById('sheet');sheet.innerHTML='';
  sheet.appendChild(el('h3',null,'Dodaj termin'));sheet.appendChild(el('div','sub',dPretty(ds)));
  var last=state.lastQuick||loadTpl()[0]||{start:'07:00',end:'14:00',tip:'NE'};
  var od=adminField('Od','time',last.start),doo=adminField('Do','time',last.end),tw=el('div'),tip=typeSelect(last.tip);
  tw.appendChild(el('label','lab','Tip'));tw.appendChild(tip);
  var cp=adminField('Število mest','number','1');cp.input.min=1;cp.input.max=20;
  sheet.appendChild(tplRow(
    function(){return {start:od.input.value,end:doo.input.value,tip:tip.value}},
    function(t){od.input.value=t.start;doo.input.value=t.end;tip.value=t.tip;upd()}
  ));
  var grid=el('div','admin-form-grid');[od.wrap,doo.wrap,tw,cp.wrap].forEach(function(x){grid.appendChild(x)});sheet.appendChild(grid);

  var rep=el('div','repeat-box');rep.appendChild(el('div','lab','Ponovi tudi na dneve (neobvezno)'));
  var days=el('div','wd-toggle'),sel={};
  WD_NAMES.forEach(function(n,i){
    var b=el('button',null,n);b.type='button';b.setAttribute('aria-pressed','false');
    b.onclick=function(){sel[i]=!sel[i];b.classList.toggle('on',!!sel[i]);b.setAttribute('aria-pressed',String(!!sel[i]));upd()};
    days.appendChild(b);
  });
  rep.appendChild(days);
  var until=adminField('Ponavljaj do vključno','date',lastOfMonth(ds.slice(0,7)));until.input.min=ds;rep.appendChild(until.wrap);
  sheet.appendChild(rep);
  var info=el('div','hint quick-info');sheet.appendChild(info);

  function dates(){
    var out=[ds],any=Object.keys(sel).some(function(k){return sel[k]}),u=until.input.value;
    if(!any||!validDs(u))return out;
    for(var d=addDays(ds,1),n=0;d<=u&&n<370;d=addDays(d,1),n++){if(sel[wd(d)])out.push(d)}
    return out;
  }
  function items(){
    var c=Math.max(1,Math.min(20,parseInt(cp.input.value,10)||1)),out=[];
    dates().forEach(function(d){for(var i=0;i<c;i++)out.push({datum:d,start:od.input.value,end:doo.input.value,tip:tip.value})});
    return out;
  }
  function upd(){
    var dd=dates(),n=items().length;
    info.textContent=dd.length===1?'Število terminov: '+n+' · samo '+dayShort(ds):'Število terminov: '+n+' · dni: '+dd.length+' · zadnji dan: '+dayShort(dd[dd.length-1]);
  }
  [od.input,doo.input,tip,cp.input,until.input].forEach(function(i){i.addEventListener('input',upd)});upd();
  addActions(sheet,[
    {label:'Objavi',cls:'primary',fn:function(){state.lastQuick={start:od.input.value,end:doo.input.value,tip:tip.value};publishSlots(items())}},
    {label:'Zapri',cls:'ghost',fn:closeSheet}
  ]);
  openScrim();
}

/* ------------------------------------------------ kopiranje tedna/meseca (3) */
function adminRows(yms){
  var pin=state.adminPin;
  return Promise.all(yms.map(function(ym){
    return call('adminGetMonth',ym,pin).then(function(res){if(!res||res.ok===false)throw Error((res&&res.msg)||'Terminov ni mogoče prebrati.');return res.rows||[]});
  })).then(function(a){return [].concat.apply([],a)});
}
// n-ti dan v tednu izvornega meseca -> n-ti isti dan v tednu ciljnega meseca
function nthMap(dstYm){
  var first=dstYm+'-01',fw=wd(first),last=Number(lastOfMonth(dstYm).slice(8));
  return function(ds){var n=Math.floor((Number(ds.slice(8))-1)/7),d=1+((wd(ds)-fw+7)%7)+n*7;return d>last?null:dstYm+'-'+pad(d)};
}
function openCopy(){
  var sheet=document.getElementById('sheet');sheet.innerHTML='';
  sheet.appendChild(el('h3',null,'Kopiraj termine'));
  sheet.appendChild(el('div','sub','Kopirajo se samo osnovni termini (ura in tip), brez vpisov. Kar v cilju že obstaja, se preskoči.'));
  var mode='week',items=[],ticket=0,today=todayStr();
  var sw=el('div','view-switch');var bW=el('button',null,'Teden'),bM=el('button',null,'Mesec');bW.type=bM.type='button';sw.appendChild(bW);sw.appendChild(bM);sheet.appendChild(sw);
  var fields=el('div','admin-form-grid');sheet.appendChild(fields);
  var prev=el('div','copy-preview');sheet.appendChild(prev);
  var wSrc=adminField('Iz tedna (katerikoli dan v njem)','date',today),wDst=adminField('V teden (katerikoli dan v njem)','date',addDays(today,7));
  var mSrc=adminField('Iz meseca','month',state.ym),mDst=adminField('V mesec','month',addMonths(state.ym,1));
  addActions(sheet,[{label:'Objavi',cls:'primary',fn:function(){publishSlots(items)}},{label:'Zapri',cls:'ghost',fn:closeSheet}]);
  var pub=sheet.querySelector('.actions .primary');

  function setMode(m){
    mode=m;bW.classList.toggle('on',m==='week');bM.classList.toggle('on',m==='month');bW.setAttribute('aria-pressed',String(m==='week'));bM.setAttribute('aria-pressed',String(m==='month'));
    fields.innerHTML='';(m==='week'?[wSrc,wDst]:[mSrc,mDst]).forEach(function(f){fields.appendChild(f.wrap)});compute();
  }
  function msg(t){items=[];pub.disabled=true;pub.textContent='Objavi';prev.textContent=t}
  function compute(){
    var my=++ticket,inSrc,map,yms={},label1,label2;
    if(mode==='week'){
      if(!validDs(wSrc.input.value)||!validDs(wDst.input.value)){msg('Izberi oba tedna.');return}
      var sM=mondayOf(wSrc.input.value),tM=mondayOf(wDst.input.value);
      if(sM===tM){msg('Izberi dva različna tedna.');return}
      var idx={};for(var i=0;i<7;i++){idx[addDays(sM,i)]=addDays(tM,i);yms[addDays(sM,i).slice(0,7)]=1;yms[addDays(tM,i).slice(0,7)]=1}
      inSrc=function(ds){return Object.prototype.hasOwnProperty.call(idx,ds)};map=function(ds){return idx[ds]};
      label1=dayShort(sM)+'–'+dayShort(addDays(sM,6));label2=dayShort(tM)+'–'+dayShort(addDays(tM,6));
    }else{
      var a=mSrc.input.value,b=mDst.input.value;
      if(!validYm(a)||!validYm(b)){msg('Izberi oba meseca.');return}
      if(a===b){msg('Izberi dva različna meseca.');return}
      yms[a]=1;yms[b]=1;inSrc=function(ds){return ds.slice(0,7)===a};map=nthMap(b);label1=label(a);label2=label(b);
    }
    msg('Preverjam termine…');
    adminRows(Object.keys(yms)).then(function(rows){
      if(my!==ticket||!prev.isConnected)return;
      var seen={},uniq=rows.filter(function(r){if(seen[r.id])return false;seen[r.id]=1;return true});
      var src=uniq.filter(function(r){return inSrc(r.datum)}),noDay=0,dup=0,cnt={},out=[];
      uniq.forEach(function(r){var k=[r.datum,r.start,r.end,r.tip].join('|');cnt[k]=(cnt[k]||0)+1});
      src.forEach(function(r){
        var d=map(r.datum);if(!d){noDay++;return}
        var k=[d,r.start,r.end,r.tip].join('|');
        if(cnt[k]>0){cnt[k]--;dup++;return}
        out.push({datum:d,start:r.start,end:r.end,tip:r.tip});
      });
      out.sort(function(x,y){return (x.datum+x.start).localeCompare(y.datum+y.start)});
      items=out;prev.innerHTML='';
      prev.appendChild(el('div',null,label1+' → '+label2));
      prev.appendChild(el('strong',null,'Dodanih bo: '+out.length+' · že obstaja: '+dup+(noDay?' · brez ustreznega dne: '+noDay:'')+' · v izvoru: '+src.length));
      if(out.length){
        var by={},ul=el('ul');out.forEach(function(x){(by[x.datum]=by[x.datum]||[]).push(shortHM(x.start)+'–'+shortHM(x.end)+' '+TIP_SHORT[x.tip])});
        Object.keys(by).sort().forEach(function(d){ul.appendChild(el('li',null,dPretty(d)+': '+by[d].join(', ')))});
        prev.appendChild(ul);
      }
      pub.disabled=!out.length||out.length>500;pub.textContent=out.length?'Objavi '+out.length:'Objavi';
      if(out.length>500)prev.appendChild(el('div','hint','Več kot 500 terminov naenkrat ni dovoljeno.'));
    }).catch(function(e){if(my===ticket&&prev.isConnected)msg('Napaka: '+(e&&e.message||e))});
  }
  bW.onclick=function(){setMode('week')};bM.onclick=function(){setMode('month')};
  [wSrc,wDst,mSrc,mDst].forEach(function(f){f.input.addEventListener('change',compute)});
  openScrim();setMode('week');
}

/* ----------------------------------------------- opozorilo na prosto (7) */
function renderFreeAlert(slots){
  var tc=document.getElementById('tab-cal'),box=document.getElementById('freeAlert');
  if(!box){box=el('div');box.id='freeAlert'}
  var anchor=document.getElementById('legend')||tc.querySelector('.week-head');
  if(box.nextSibling!==anchor)anchor.parentNode.insertBefore(box,anchor);
  if(box.dataset.ym!==state.ym){box.dataset.ym=state.ym;box.dataset.all=''}
  box.innerHTML='';
  var free=slots.filter(function(s){return s.kind==='free'&&!isPastSlot(s)}).sort(function(a,b){return (a.datum+a.start).localeCompare(b.datum+b.start)});
  var upcoming=slots.some(function(s){return !isPastSlot(s)});
  if(!free.length){box.className='free-alert ok';box.hidden=!upcoming;if(upcoming)box.textContent='✓ V tem mesecu ni več prostih terminov.';return}
  box.hidden=false;box.className='free-alert';
  var h=free.reduce(function(a,s){return a+Math.max(0,hours(s.start,s.end))},0);
  box.appendChild(el('strong',null,'Še prosto: '+free.length+' ('+num(h)+' h)'));
  var show=box.dataset.all==='1'?free:free.slice(0,5);
  show.forEach(function(s){
    var b=el('button','free-pill',dayShort(s.datum)+' · '+shortHM(s.start)+'–'+shortHM(s.end)+' · '+TIP_SHORT[s.tip]);
    b.title=dPretty(s.datum);b.onclick=function(){if(isAdmin())openAdminFromCalendar(s);else openSlot(s)};box.appendChild(b);
  });
  if(free.length>show.length){var m=el('button','ghost free-more','+'+(free.length-show.length)+' več');m.onclick=function(){box.dataset.all='1';renderFreeAlert(slots)};box.appendChild(m)}
}

/* ----------------------------------------------------- izbira imena (9) */
function canonName(v){
  v=String(v||'').replace(/\s+/g,' ').trim();var k=v.toLowerCase(),hit=null;
  knownNames().forEach(function(n){if(personKey(n)===k)hit=n});
  return hit||v;
}
function setName(v){
  v=canonName(v);document.getElementById('name').value=v;state.name=v;saveName(v);nextRead('mine');
  rerenderCalendar();if(state.tab==='mine')renderMine();
}
function drawNamePick(){
  var box=document.getElementById('namePick'),dl=document.getElementById('nameList');if(!box||!dl)return;
  var names=knownNames();dl.innerHTML='';names.forEach(function(n){var o=document.createElement('option');o.value=n;dl.appendChild(o)});
  box.innerHTML='';
  if(state.name||!names.length){box.hidden=true;return}
  box.hidden=false;box.appendChild(el('span','hint','Izberi svoje ime:'));
  names.forEach(function(n){var c=personColor(n),b=el('button','name-pill',n);b.type='button';b.style.background=c[0];b.style.borderColor=c[1];b.style.color=c[2];b.onclick=function(){setName(n)};box.appendChild(b)});
}

/* ------------------------------------------------- koledar: ovoj izrisa */
var baseRenderCalendar=renderCalendar;
renderCalendar=function(slots){
  baseRenderCalendar(slots);slots=slots||[];
  if(isAdmin()&&!state.deleteMode){
    document.querySelectorAll('#grid .cell:not(.empty)').forEach(function(cell,i){
      var ds=state.ym+'-'+pad(i+1),b=el('button','day-add','+');
      b.title='Dodaj termin: '+dPretty(ds);b.setAttribute('aria-label',b.title);b.onclick=function(){openQuickAdd(ds)};cell.appendChild(b);
    });
  }
  renderFreeAlert(slots);drawNamePick();
};
var baseShowDay=showDay;
showDay=function(ds){
  baseShowDay(ds);if(!isAdmin())return;
  var a=document.querySelector('#sheet .actions');if(!a)return;
  var b=el('button','primary','+ Dodaj termin');b.onclick=function(){openQuickAdd(ds)};a.insertBefore(b,a.firstChild);
};
var baseUnlock=unlockAdmin;
unlockAdmin=function(pin){baseUnlock(pin);rerenderCalendar()};

/* -------------------------------------- statistika po osebah + izvoz (5, 6) */
function fmt(n){return String(num(n)).replace('.',',')}
function toSV(rows,sep){
  return rows.map(function(r){return r.map(function(v,i){
    v=String(v);if(i===0&&/^[=+\-@]/.test(v))v="'"+v;
    return /[";\t\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
  }).join(sep)}).join('\r\n');
}
function download(name,text){
  var blob=new Blob(['﻿'+text],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500);
}
function copyText(t,okMsg){
  function fb(){var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}ta.remove();toast(ok?okMsg:'Kopiranje ni uspelo.')}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(function(){toast(okMsg)},fb);else fb();
}
function monthRows(ym,mode){
  var by={};
  (state.monthCache[ym]||[]).forEach(function(s){
    if(s.kind!=='taken'||!s.ime)return;var past=isPastSlot(s);
    if(mode==='past'&&!past)return;if(mode==='planned'&&past)return;
    var k=personKey(s.ime),r=by[k]||(by[k]={ime:s.ime,NE:0,DA:0,FBX:0,total:0,count:0});
    var h=s.ure!=null?Number(s.ure)||0:Math.max(0,hours(s.start,s.end)),t=TIP_COLORS[s.tip]?s.tip:'NE';
    r[t]+=h;r.total+=h;r.count++;
  });
  return Object.keys(by).map(function(k){var r=by[k];['NE','DA','FBX','total'].forEach(function(f){r[f]=num(r[f])});return r})
    .sort(function(a,b){return b.total-a.total||a.ime.localeCompare(b.ime,'sl')});
}
function exportMonth(rows,sep){
  var out=[['Oseba','Navaden (h)','Administracija (h)','FBX (h)','Skupaj (h)','Vpisi']],sum={NE:0,DA:0,FBX:0,total:0,count:0};
  rows.forEach(function(r){out.push([r.ime,fmt(r.NE),fmt(r.DA),fmt(r.FBX),fmt(r.total),r.count]);['NE','DA','FBX','total','count'].forEach(function(f){sum[f]+=r[f]})});
  out.push(['Skupaj',fmt(sum.NE),fmt(sum.DA),fmt(sum.FBX),fmt(sum.total),sum.count]);
  return toSV(out,sep);
}
function renderPeopleTop(raw){
  var d=document.getElementById('statsDetail'),ym=state.statsMonth,mode=state.statsMode;if(!d||!ym)return;
  d.innerHTML='';
  var head=el('div','people-head'),nav=el('div','people-nav'),pv=el('button','arrow','‹'),nx=el('button','arrow','›');
  pv.title='Prejšnji mesec';nx.title='Naslednji mesec';pv.setAttribute('aria-label',pv.title);nx.setAttribute('aria-label',nx.title);
  function go(delta){
    var n=addMonths(ym,delta);state.statsMonth=n;
    if(n.slice(0,4)!==String(state.statsYear)){state.statsYear=Number(n.slice(0,4));loadStatsYear(false)}else renderStatsDashboard(raw);
  }
  pv.onclick=function(){go(-1)};nx.onclick=function(){go(1)};
  nav.appendChild(pv);nav.appendChild(el('h3',null,label(ym)));nav.appendChild(nx);head.appendChild(nav);
  var tools=el('div','people-tools'),cpy=el('button',null,'Kopiraj tabelo'),csv=el('button',null,'Prenesi CSV');
  cpy.disabled=csv.disabled=true;tools.appendChild(cpy);tools.appendChild(csv);head.appendChild(tools);d.appendChild(head);
  var sub=el('div','hint',statsScopeLabel()+' · ure po osebah');d.appendChild(sub);
  var body=el('div','people-bars');body.appendChild(el('div','loading','Nalagam…'));d.appendChild(body);
  function draw(){
    if(state.statsMonth!==ym||state.statsMode!==mode||!body.isConnected||!state.monthCache[ym])return;
    var rows=monthRows(ym,mode),tot=num(rows.reduce(function(a,r){return a+r.total},0));
    body.innerHTML='';sub.textContent=statsScopeLabel()+' · '+tot+' h · oseb: '+rows.length+' · klikni osebo za datume';
    if(!rows.length){body.appendChild(el('p','hint','Za izbrani prikaz ni vpisov.'));cpy.disabled=csv.disabled=true;return}
    var max=rows[0].total||1;
    rows.forEach(function(r){
      var c=personColor(r.ime),row=el('button','pbar');row.setAttribute('aria-label',r.ime+', '+r.total+' ur; pokaži datume');
      var nm=el('span','pbar-name',r.ime);nm.style.background=c[0];nm.style.borderColor=c[1];nm.style.color=c[2];
      var tr=el('span','pbar-track');
      ['NE','DA','FBX'].forEach(function(t){if(!r[t])return;var seg=el('span','pbar-seg');seg.style.width=(r[t]/max*100)+'%';seg.style.background=TIP_COLORS[t];seg.title=tipName(t)+': '+r[t]+' h';tr.appendChild(seg)});
      var br=['NE','DA','FBX'].filter(function(t){return r[t]}).map(function(t){return TIP_SHORT[t]+' '+r[t]+' h'}).join(' · ')+' · vpisov: '+r.count;
      row.appendChild(nm);row.appendChild(tr);row.appendChild(el('span','pbar-hours mono',r.total+' h'));row.appendChild(el('span','pbar-break',br));
      row.onclick=function(){showPersonDates(r.ime,ym)};body.appendChild(row);
    });
    var lg=el('div','pbar-legend');
    [['NE','Navaden'],['DA','Administracija'],['FBX','FBX']].forEach(function(t){var s=el('span'),i=el('i');i.style.background=TIP_COLORS[t[0]];s.appendChild(i);s.appendChild(document.createTextNode(t[1]));lg.appendChild(s)});
    body.appendChild(lg);
    cpy.disabled=csv.disabled=false;
    cpy.onclick=function(){copyText(exportMonth(rows,'\t'),'Tabela je kopirana.')};
    csv.onclick=function(){download('ure-'+ym+'-'+mode+'.csv',exportMonth(rows,';'))};
  }
  draw();
  fetchMonths([ym],false).then(draw).catch(function(){if(body.isConnected&&!state.monthCache[ym]){body.innerHTML='';body.appendChild(el('p','hint','Podatkov ni mogoče naložiti.'))}});
}
var baseStatsDashboard=renderStatsDashboard;
renderStatsDashboard=function(raw){baseStatsDashboard(raw);renderPeopleTop(raw)};
var baseStatsMatrix=renderStatsMatrix;
renderStatsMatrix=function(data){
  baseStatsMatrix(data);
  var t=document.querySelector('#statsMatrix .stats-matrix-title'),people=(data.annual&&data.annual.people)||[];if(!t||!people.length)return;
  var b=el('button','copy-btn','Prenesi CSV (leto)');
  b.onclick=function(){
    var out=[['Oseba'].concat(data.months.map(function(m){return MONTHS[m.month-1]})).concat(['Skupaj'])];
    people.forEach(function(p){var k=p.ime.toLowerCase();out.push([p.ime].concat(data.months.map(function(m){var f=null;(m.people||[]).forEach(function(x){if(x.ime.toLowerCase()===k)f=x});return fmt(f?f.ure:0)})).concat([fmt(p.ure)]))});
    download('ure-'+data.year+'-'+state.statsMode+'.csv',toSV(out,';'));
  };
  t.appendChild(b);
};

/* --------------------------------- ena statistika namesto dveh (8) */
var baseSetAdminTab=setAdminTab;
setAdminTab=function(tab){
  if(tab==='stats'){var m=state.adminMonth||state.ym;state.statsYear=Number(m.slice(0,4));state.statsMonth=m;state.statsMode='all';showTab('stats');return}
  baseSetAdminTab(tab);
};

/* ----------------------------------------------------------------- zagon */
var baseInit=initUI;
initUI=function(){
  baseInit();
  // statistika: mesec po osebah nad letno mrezo
  var grid=document.getElementById('statsYearGrid'),det=document.getElementById('statsDetail');grid.parentNode.insertBefore(det,grid);
  var sb=document.querySelector('[data-admin-tab="stats"]');if(sb){sb.textContent='Statistika ↗';sb.title='Odpre skupno statistiko za izbrani mesec'}
  // ime: seznam znanih imen + hitra izbira
  var name=document.getElementById('name'),row=document.querySelector('.namerow');
  var dl=document.createElement('datalist');dl.id='nameList';row.appendChild(dl);name.setAttribute('list','nameList');name.placeholder='Vpiši ali izberi ime';
  var pick=el('div');pick.id='namePick';pick.hidden=true;row.appendChild(pick);
  name.addEventListener('change',function(){var c=canonName(this.value);if(c!==this.value||c!==state.name)setName(c);else drawNamePick()});
  name.addEventListener('input',function(){setTimeout(drawNamePick,0)});
  // admin orodja v koledarju
  var tools=document.getElementById('calendarAdminTools'),cb=el('button','copy-btn','⧉ Kopiraj teden/mesec');cb.onclick=openCopy;tools.appendChild(cb);
  var sc=document.querySelector('.batch-shortcuts');if(sc){var cb2=el('button',null,'⧉ Kopiraj teden/mesec');cb2.onclick=openCopy;sc.appendChild(cb2)}
  // predloge v nacrtovalniku namesto fiksnih hitrih casov
  var old=document.querySelector('.time-presets');
  if(old){
    var tr=tplRow(
      function(){return {start:document.getElementById('batchStart').value,end:document.getElementById('batchEnd').value,tip:document.getElementById('batchTip').value}},
      function(t){if(!batchEditable())return;document.getElementById('batchStart').value=t.start;document.getElementById('batchEnd').value=t.end;document.getElementById('batchTip').value=t.tip}
    );
    old.replaceWith(tr);
  }
};
})();
