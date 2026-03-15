'use strict';
const API_BASE = 'php/api.php';

const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const fmt   = n => Number(n||0).toLocaleString('mn-MN') + '₮';
const fmtM  = n => { const v=Number(n||0); if(v>=1000000)return(v/1000000).toFixed(1)+'сая₮'; if(v>=1000)return Math.round(v/1000)+'К₮'; return v+'₮'; };
const nts   = (a,b) => Math.max(1, Math.round((new Date(b)-new Date(a))/86400000));
const today = () => new Date().toISOString().slice(0,10);
const tmrw  = () => new Date(Date.now()+86400000).toISOString().slice(0,10);
const bedMn = t => ({single:'Сингл',double:'Давхар',twin:'Твин',queen:'Queen',king:'King',triple:'Гурван орон',suite:'Сюит'}[t]||t||'—');
const esc   = o => JSON.stringify(o).replace(/'/g,"&#39;");

const G = {
  user:null, hotels:[], allHotels:[],
  hotel:null, rt:null,
  bk:null, promo:0,
  pay:{method:null,pid:null,_poll:null},
  otp:{email:'',timers:{}},
  _after:null, _svcs:[],
};

/* ═══════════════════════════════ CURSOR ══════════════════════════════════ */
{
  const cur=$('cur'), dot=$('cur-dot');
  if(cur&&dot){
    let mx=0,my=0,cx=0,cy=0;
    document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;dot.style.cssText=`left:${mx}px;top:${my}px`;},{passive:true});
    (function f(){cx+=(mx-cx)*.13;cy+=(my-cy)*.13;cur.style.cssText=`left:${cx}px;top:${cy}px`;requestAnimationFrame(f)})();
    document.addEventListener('mousedown',()=>cur.classList.add('clk'));
    document.addEventListener('mouseup',  ()=>cur.classList.remove('clk'));
  }
  function hlCur(el){
    if(!cur)return;
    el.addEventListener('mouseenter',()=>cur.classList.add('hov'));
    el.addEventListener('mouseleave',()=>cur.classList.remove('hov'));
  }
  $$('a,button,[onclick]').forEach(hlCur);
  window._hl = hlCur;
}

/* ═══════════════════════════ SCROLL / PARALLAX ═══════════════════════════ */
window.addEventListener('scroll',()=>{
  const p=scrollY/(document.body.scrollHeight-innerHeight)*100;
  const sp=$('scroll-progress'); if(sp) sp.style.width=p+'%';
  $('nav')?.classList.toggle('scrolled',scrollY>60);
  $$('.hero-slide.on').forEach(s=>{ s.style.transform=`translateY(${scrollY*.18}px)`; });
},{passive:true});

const revObs=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&e.target.classList.add('vis')),{threshold:.07});
$$('.reveal').forEach(el=>revObs.observe(el));

/* ══════════════════════════════ PARTICLES ════════════════════════════════ */
const hpts=$('hpts');
if(hpts) setInterval(()=>{
  const p=document.createElement('div'); p.className='pt';
  const s=Math.random()*3+1;
  p.style.cssText=`width:${s}px;height:${s}px;left:${Math.random()*100}%;bottom:0;animation-duration:${Math.random()*9+6}s;animation-delay:${Math.random()*2}s`;
  hpts.appendChild(p); setTimeout(()=>p.remove(),14000);
},1000);

/* ══════════════════════════ HERO SLIDER ═════════════════════════════════ */
let _si=0;
function goSlide(n){
  $$('.hero-slide').forEach((s,i)=>s.classList.toggle('on',i===n));
  $$('.sdot').forEach((d,i)=>d.classList.toggle('on',i===n));
  _si=n;
}
setInterval(()=>goSlide((_si+1)%($$('.hero-slide').length||5)),5500);

/* ════════════════════════════ TICKER ════════════════════════════════════ */
(function buildTicker(){
  const t=$('ticker'); if(!t)return;
  const items=[['8','Тансаг Буудал'],['5★','Олон Улсын Зэрэглэл'],['300+','Тохилог Өрөo'],['QPay','Монгол QR Төлбөр'],['24/7','Тасралтгүй Үйлчилгээ'],['10K+','Сэтгэл Хангалуун Зочид'],['OTP','Gmail Баталгаажуулалт'],['10+','Купон Хөнгөлөлт']];
  const html=[...items,...items].map(([n,l])=>`<div class="titem"><span class="ti-n">${n}</span><span class="ti-l">${l}</span></div>`).join('');
  t.innerHTML=html;
})();

/* ════════════════════════════ DATE DEFAULTS ═════════════════════════════ */
(()=>{
  const t=today(),t2=tmrw();
  [$('s-in'),$('bm-in')].forEach(e=>e&&(e.min=t,!e.value&&(e.value=t)));
  [$('s-out'),$('bm-out')].forEach(e=>e&&(e.min=t2,!e.value&&(e.value=t2)));
})();

/* ════════════════════════════ TOAST ════════════════════════════════════ */
function toast(msg,type='i',ms=4500){
  const icons={s:'✓',e:'✕',i:'◆',w:'⚠'};
  const el=document.createElement('div');
  el.className=`toast t${type}`;
  el.innerHTML=`<span style="flex-shrink:0">${icons[type]||'•'}</span><span>${msg}</span>`;
  const st=$('toasts'); st.appendChild(el);
  while(st.children.length>6) st.removeChild(st.firstChild);
  setTimeout(()=>{ el.style.cssText='opacity:0;transform:translateX(16px);transition:.3s'; setTimeout(()=>el.remove(),310); },ms);
}

function setAlert(id,html,type='e'){
  const el=$(id); if(!el)return;
  const cls={e:'al-e',s:'al-s',i:'al-i',g:'al-g'}[type]||'al-i';
  el.innerHTML=html?`<div class="alert ${cls}">${html}</div>`:'';
}

function btnL(btn,on,lbl=''){
  if(!btn)return;
  if(on){ btn._t=btn.innerHTML; btn.disabled=true; btn.innerHTML=`<span style="display:inline-flex;align-items:center;justify-content:center;gap:8px"><span class="spin" style="width:14px;height:14px;border-width:2px"></span>${lbl||'Уншиж байна...'}</span>`; }
  else { btn.disabled=false; btn.innerHTML=btn._t||lbl; }
}

function cp(txt){
  navigator.clipboard?.writeText(txt).then(()=>toast('Хуулагдлаа ✓','s',2000))
    .catch(()=>{ const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Хуулагдлаа ✓','s',2000); });
}

/* ════════════════════════════ MODALS ════════════════════════════════════ */
const _open=new Set();
function openModal(id){ const el=$(id);if(!el)return; el.classList.add('open'); _open.add(id); document.body.style.overflow='hidden'; }
function closeModal(id){ const el=$(id);if(!el)return; el.classList.remove('open'); _open.delete(id); if(!_open.size&&!$('det-ov')?.classList.contains('on')) document.body.style.overflow=''; }
function switchModal(a,b){ closeModal(a); openModal(b); }
function sStep(show,hide){
  const a=$(show),b=$(hide);
  if(b) b.style.display='none';
  if(a){ a.style.display='block'; a.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:240,easing:'ease',fill:'both'}); }
}
$$('.mlayer').forEach(m=>m.addEventListener('click',e=>{ if(e.target===m) closeModal(m.id); }));
document.addEventListener('keydown',e=>{ if(e.key!=='Escape')return; if(_open.size){ closeModal([..._open].at(-1)); return; } closeDetail(); });
function closeDetail(){ const ov=$('det-ov'); if(!ov)return; ov.classList.remove('on'); if(!_open.size) document.body.style.overflow=''; }

/* ════════════════════════════ API ═══════════════════════════════════════ */
async function api(action,qs={},body=null){
  let url=API_BASE+'?action='+encodeURIComponent(action);
  for(const k in qs) if(qs[k]!=null) url+='&'+encodeURIComponent(k)+'='+encodeURIComponent(qs[k]);
  const opts={method:body?'POST':'GET',credentials:'same-origin'};
  if(body){ opts.headers={'Content-Type':'application/json'}; opts.body=JSON.stringify(body); }
  const res=await fetch(url,opts);
  let data={};
  try{ data=await res.json(); }catch{}
  if(!res.ok){ const err=new Error(data.error||'API Error'); err.api=data; throw err; }
  return data;
}

/* ════════════════════════════ SESSION ══════════════════════════════════ */
async function initApp(){
  try{ const d=await api('get_session'); if(d.logged_in&&d.guest) applyUser(d.guest); }catch{}
  loadHotels();
}
function applyUser(u){
  G.user=u;
  const fn=(u.first_name||u.name||'?').split(' ')[0];
  $('nav-login').style.display='none'; $('nav-reg').style.display='none';
  const nu=$('nav-user'); nu.style.display='flex';
  $('nav-av').textContent=fn[0]?.toUpperCase()||'U';
  $('nav-nm').textContent=fn;
  nu.querySelectorAll('*').forEach(window._hl);
}
function clearUser(){ G.user=null; $('nav-login').style.display=''; $('nav-reg').style.display=''; $('nav-user').style.display='none'; }
async function doLogout(){ try{await api('logout');}catch{} clearUser(); toast('Амжилттай гарлаа','i'); }
function afterLogin(){ if(G._after){ const{fn,args}=G._after; G._after=null; setTimeout(()=>fn(...args),350); } }

/* ════════════════════════════ OTP HELPERS ═══════════════════════════════ */
function oNext(el,nid){ el.value=el.value.replace(/\D/g,''); if(el.value)$(nid)?.focus(); }
function getOTP(p){ return [0,1,2,3,4,5].map(i=>$(p+i)?.value||'').join(''); }
function clearOTP(p){ [0,1,2,3,4,5].forEach(i=>{ const e=$(p+i); if(e) e.value=''; }); }
function fillOTP(p,code){ String(code).padStart(6,'0').split('').forEach((c,i)=>{ const e=$(p+i); if(e) e.value=c; }); }
function startTimer(cdId,rsId,mins=10){
  clearInterval(G.otp.timers[cdId]); let s=mins*60;
  const cd=$(cdId),rs=$(rsId); if(rs) rs.style.display='none';
  G.otp.timers[cdId]=setInterval(()=>{
    s--;
    if(cd) cd.textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
    if(s<=0){ clearInterval(G.otp.timers[cdId]); if(rs) rs.style.display='inline'; }
  },1000);
}

/* ════════════════════════════ AUTH ══════════════════════════════════════ */
async function sendLoginOtp(resend=false){
  const email=($('l-email').value||'').trim(), pass=$('l-pass').value||'';
  const btn=document.querySelector('#ls1 .mbtn');
  setAlert('l-alert','');
  if(!email||!email.includes('@')){ setAlert('l-alert','📧 Gmail хаягаа зөв оруулна уу'); return; }

  if(pass&&!resend){
    btnL(btn,true,'Нэвтэрч байна...');
    try{
      const d=await api('login',{},{email,password:pass});
      if(d.success){ applyUser({first_name:d.name?.split(' ')[0]||'?',email,is_vip:d.is_vip,loyalty_points:d.loyalty_points}); closeModal('login-modal'); toast(`Тавтай морилно уу, ${d.name}! 👋`,'s'); afterLogin(); return; }
      setAlert('l-alert',d.error||'Нэвтрэлт амжилтгүй');
    }catch(e){ setAlert('l-alert',e.api?.error||'⚠️ Серверт холбогдсонгүй'); }
    finally{ btnL(btn,false); }
    return;
  }

  btnL(btn,true,'Код илгээж байна...');
  try{
    const d=await api('send_otp',{},{email,type:'login'});
    G.otp.email=email; $('l-otp-email').textContent=`📧 ${email}`;
    sStep('ls2','ls1'); startTimer('l-cd','l-resend'); clearOTP('l'); setTimeout(()=>$('l0')?.focus(),130);
    if(d.dev_otp){
      setAlert('l-otp-alert',`🔧 <strong>Dev горим</strong> — SMTP тохируулаагүй<br><span style="font-family:'DM Mono',monospace;font-size:30px;letter-spacing:10px;color:var(--gold);display:block;margin-top:8px">${d.dev_otp}</span>`,'i');
      fillOTP('l',d.dev_otp);
    }else{ toast(`${email} хаягт OTP код илгээлээ`,'s'); }
  }catch(e){ setAlert('l-alert',e.api?.error||'⚠️ Серверт холбогдсонгүй. PHP localhost дээр ажиллуулна уу.'); }
  finally{ btnL(btn,false); }
}

async function verifyLoginOtp(){
  const code=getOTP('l');
  if(code.length!==6){ setAlert('l-otp-alert','6 оронтой кодыг бүрэн оруулна уу'); return; }
  setAlert('l-otp-alert','');
  const btn=document.querySelector('#ls2 .mbtn'); btnL(btn,true,'Баталгаажуулж байна...');
  try{
    const d=await api('login',{},{email:G.otp.email,code,type:'login'});
    if(d.success){ applyUser({first_name:d.name?.split(' ')[0]||'?',email:G.otp.email,is_vip:d.is_vip,loyalty_points:d.loyalty_points}); closeModal('login-modal'); toast(`Тавтай морилно уу, ${d.name}! 👋`,'s'); afterLogin(); }
    else setAlert('l-otp-alert',d.error||'Код буруу байна');
  }catch(e){ setAlert('l-otp-alert',e.api?.error||'⚠️ Серверт холбогдсонгүй'); }
  finally{ btnL(btn,false); }
}

async function sendRegOtp(resend=false){
  const first=($('r-first').value||'').trim(), last=($('r-last').value||'').trim(), email=($('r-email').value||'').trim();
  const btn=document.querySelector('#rs1 .mbtn'); setAlert('r-alert','');
  if(!first||!last){ setAlert('r-alert','👤 Нэр, Овгоо оруулна уу'); return; }
  if(!email||!email.includes('@')){ setAlert('r-alert','📧 Gmail хаягаа зөв оруулна уу'); return; }
  btnL(btn,true,'Код илгээж байна...');
  try{
    const d=await api('send_otp',{},{email,type:'register',name:first});
    G.otp.email=email; $('r-otp-email').textContent=`📧 ${email}`;
    sStep('rs2','rs1'); startTimer('r-cd','r-resend'); clearOTP('r'); setTimeout(()=>$('r0')?.focus(),130);
    if(d.dev_otp){
      setAlert('r-otp-alert',`🔧 <strong>Dev горим</strong><br><span style="font-family:'DM Mono',monospace;font-size:30px;letter-spacing:10px;color:var(--gold);display:block;margin-top:8px">${d.dev_otp}</span>`,'i');
      fillOTP('r',d.dev_otp);
    }else{ toast(`${email} хаягт OTP код илгээлээ`,'s'); }
  }catch(e){ setAlert('r-alert',e.api?.error||'⚠️ Серверт холбогдсонгүй'); }
  finally{ btnL(btn,false); }
}

async function verifyRegOtp(){
  const code=getOTP('r');
  if(code.length!==6){ setAlert('r-otp-alert','6 оронтой кодоо бүрэн оруулна уу'); return; }
  setAlert('r-otp-alert','');
  const btn=document.querySelector('#rs2 .mbtn'); btnL(btn,true,'Баталгаажуулж байна...');
  try{
    const d=await api('verify_otp',{},{email:G.otp.email,code,type:'register'});
    if(d.success) await registerUser();
    else setAlert('r-otp-alert',d.error||'Код буруу байна');
  }catch(e){ setAlert('r-otp-alert',e.api?.error||'⚠️ Серверт холбогдсонгүй'); }
  finally{ btnL(btn,false); }
}

async function registerUser(){
  try{
    const d=await api('register',{},{first_name:$('r-first').value,last_name:$('r-last').value,email:G.otp.email,phone:$('r-phone').value,password:$('r-pass').value});
    if(d.success){ applyUser({first_name:$('r-first').value,email:G.otp.email}); closeModal('reg-modal'); toast('Бүртгэл амжилттай! 🎉','s'); }
    else setAlert('r-otp-alert',d.error||'Бүртгэл алдаа');
  }catch(e){ setAlert('r-otp-alert',e.api?.error||'⚠️ Серверт холбогдсонгүй'); }
}

/* ═══════════════════════ DEMO DATA — 8 hotels ════════════════════════════ */
const D_HOTELS=[
  {id:1,name:'Шангрила Улаанбаатар',slug:'shangri-la',stars:5,rating:4.85,total_reviews:2847,is_featured:true,city:'Улаанбаатар',address:'Сүхбаатарын талбай 3',phone:'+976 7700-8888',email:'ulaanbaatar@shangri-la.com',check_in_time:'15:00',check_out_time:'12:00',min_price:385000,available_rooms:4,
    cover_image:'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80',tagline:'Монголын нийслэлийн хамгийн тансаг туршлага',
    description:'Улаанбаатарын төвд байрлах Шангрила буудал нь дэлхийн зэрэглэлийн үйлчилгээ, монгол соёлын уламжлалыг хослуулсан 5 одтой зочид буудал юм. 2008 онд нээгдсэн бөгөөд 290 гаруй өрөo, апартментаас бүрдэх тансаг байгуулалттай.',
    amenities:['🍽 Тансаг ресторан','💆 Chi Spa','🏊 Хаалттай бассейн','💪 Фитнесс центр','🏛 Хурлын танхим','🚘 Valet parking','☕ Кофе шоп','🌐 Олон хэлний үйлчилгээ'],
    gallery:['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800','https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800','https://images.unsplash.com/photo-1609766418204-94aae0ecfefd?w=800'],
    pros:['✓ Сүхбаатарын талбайн хажуу — стратегийн байршил','✓ 5★ дэлхийн жишгийн үйлчилгээ','✓ Chi Spa тансаг эмчилгээ','✓ Хаалттай бассейн'],
    cons:['— Үнэ харьцангуй өндөр','— Хотын чимээ зарим өрөонд']},
  {id:2,name:'Блю Скай Зочид Буудал',slug:'blue-sky',stars:4,rating:4.62,total_reviews:1523,is_featured:false,city:'Улаанбаатар',address:'Олимпийн гудамж 5',phone:'+976 7011-8888',email:'info@bluesky.mn',check_in_time:'14:00',check_out_time:'12:00',min_price:180000,available_rooms:7,
    cover_image:'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200&q=80',tagline:'Хотын хамгийн өндөр, 360° панорамик харагдацтай',
    description:'Улаанбаатарын хамгийн өндөр барилгуудын нэгд байрлах бөгөөд цонхноосоо Богдхан уулын оргил хүртэл харагдана. 4 одтой зочид буудал нь орчин үеийн дизайн болон монгол уламжлалыг тэнцвэртэйгээр хослуулсан.',
    amenities:['🔭 360° Панорама','🍷 Sky Bar','💆 Спа','📶 Гигабит WiFi','🅿 Зогсоол','🍳 Өглөөний цай','🏋 Фитнесс'],
    gallery:['https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800','https://images.unsplash.com/photo-1560347876-aeef00ee58a1?w=800','https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800'],
    pros:['✓ 360° панорама — уул, хот хоёулаа харагдана','✓ Үнэ-чанарын харьцаа сайн','✓ Sky Bar романтик уулзалтад'],
    cons:['— Бассейн байхгүй','— Спа хязгаарлагдмал']},
  {id:3,name:'Кемпинский Улаанбаатар',slug:'kempinski',stars:5,rating:4.91,total_reviews:3102,is_featured:true,city:'Улаанбаатар',address:'Чингис Хааны өргөн чөлөө 13',phone:'+976 7703-7777',email:'reservations.ulaanbaatar@kempinski.com',check_in_time:'15:00',check_out_time:'12:00',min_price:650000,available_rooms:3,
    cover_image:'https://images.unsplash.com/photo-1551882547-ff40c63fe2e2?w=1200&q=80',tagline:'Чингис хааны уламжлал, Европын тансаглал хоёр нийлсэн',
    description:'Германы тансаг зэрэглэлийн Kempinski брэндийн Монгол дахь цорын ганц буудал. Монголын хамгийн өндөр үнэлгээтэй (4.91/5) зочид буудал хэвээр байна.',
    amenities:['👑 Хааны спа','🥘 Fine dining','🛎 Butler үйлчилгээ','🛁 Jacuzzi','✈️ Нисэх буудал шилжүүлэг','🎁 Concierge 24/7','🏊 Усан бассейн','💒 Хурим зохион байгуулалт'],
    gallery:['https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800','https://images.unsplash.com/photo-1609766418204-94aae0ecfefd?w=800','https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800'],
    pros:['✓ Монголын хамгийн өндөр үнэлгээтэй (4.91)','✓ Kempinski брэндийн дэлхийн жишгийн үйлчилгээ','✓ Butler үйлчилгээ — хувийн туслах'],
    cons:['— Улаанбаатарын хамгийн үнэтэй буудал','— Захиалга урьдчилгааг шаардана']},
  {id:4,name:'Өргөө Бутик Буудал',slug:'urgoo',stars:4,rating:4.45,total_reviews:876,is_featured:false,city:'Улаанбаатар',address:'Бага тойруу 15',phone:'+976 9911-5566',email:'info@urgoo-boutique.mn',check_in_time:'14:00',check_out_time:'11:00',min_price:120000,available_rooms:5,
    cover_image:'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200&q=80',tagline:'Монгол ёс заншил, орчин үеийн тав тухтай хосолсон',
    description:'Монгол өв соёлоо сайн хадгалсан 4 одтой жижиг бутик буудал. Гэрийн дулаан орчин, эелдэг ажилтнууд, монгол хоол унд — аялагчдын дунд маш их алдартай.',
    amenities:['🏺 Монгол уламжлалт засал','🌿 Дотуур цэцэрлэг','🛀 Уламжлалт спа','🎭 Соёлын хөтөлбөр','🍲 Монгол хоол','📷 Аялал зохион байгуулалт'],
    gallery:['https://images.unsplash.com/photo-1560347876-aeef00ee58a1?w=800','https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800'],
    pros:['✓ Монгол өв соёлыг бодитоор мэдрэх','✓ Тухтай дотно орчин','✓ Монгол уламжлалт хоол'],
    cons:['— Бассейн, фитнесс байхгүй','— WiFi зарим газар сул']},
  {id:5,name:'Новотел Улаанбаатар',slug:'novotel',stars:4,rating:4.38,total_reviews:1245,is_featured:false,city:'Улаанбаатар',address:'Чингис Хааны талбай 10',phone:'+976 7700-9999',email:'h5576@accor.com',check_in_time:'14:00',check_out_time:'12:00',min_price:220000,available_rooms:5,
    cover_image:'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=1200&q=80',tagline:'Олон улсын Accor брэнд — хотын зүрхэнд',
    description:'Accor группын олон улсын стандарттай 4 одтой зочид буудал. Ажил хэрэгч аялагчдад зориулагдсан орчин үеийн тав тухтай байгуулалт.',
    amenities:['🏢 Бизнес центр','🍽 Ресторан & Бар','💪 Фитнесс','🅿 Газар доорх зогсоол','📶 Хурдан WiFi','🏊 Бассейн','🧘 Yoga studio'],
    gallery:['https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800','https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800'],
    pros:['✓ Олон улсын брэндийн баталгаат чанар','✓ Хотын дунд байршил','✓ Бассейн, фитнесс бүхий'],
    cons:['— Монгол өвөрмөц байдал дутуу','— Нэмэлт үйлчилгээ өртөг']},
  {id:6,name:'Баянгол Зочид Буудал',slug:'bayangol',stars:3,rating:4.15,total_reviews:987,is_featured:false,city:'Улаанбаатар',address:'Чингис Хааны өргөн чөлөө 5',phone:'+976 7011-5555',email:'info@bayangol.mn',check_in_time:'13:00',check_out_time:'11:00',min_price:89000,available_rooms:5,
    cover_image:'https://images.unsplash.com/photo-1600011689032-8b628b8a8747?w=1200&q=80',tagline:'Монголын уламжлалт зочломтгой байдал хамгийн их',
    description:'1960-аад оноос эхлэн Улаанбаатарын хамгийн алдартай буудлуудын нэг болсоор ирсэн. Орчин үеийн засварын дараа шинэлэг байдал, монгол уламжлалт дулаан агаарыг хослуулсан.',
    amenities:['🍽 Монгол ресторан','☕ Кофе шоп','🅿 Зогсоол','📶 WiFi','💪 Фитнесс','🎵 Монгол урлагийн шөнө'],
    gallery:['https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800','https://images.unsplash.com/photo-1560347876-aeef00ee58a1?w=800'],
    pros:['✓ Хамгийн хямд үнэтэй буудал','✓ Монгол уламжлалт ресторан','✓ Хотын дунд байршил'],
    cons:['— Спа, бассейн байхгүй','— Зарим тавилга хуучирсан']},
  {id:7,name:'Чингис Хааны Буудал',slug:'chinggis',stars:4,rating:4.52,total_reviews:1102,is_featured:true,city:'Улаанбаатар',address:'Жуулчны гудамж 2',phone:'+976 7700-3333',email:'info@chinggis-hotel.mn',check_in_time:'14:00',check_out_time:'12:00',min_price:195000,available_rooms:5,
    cover_image:'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200&q=80',tagline:'Монгол эзэнт гүрний сүр дуулиан — орчин үеийн тансаглалаар',
    description:'Монгол түүх, соёл, уламжлалыг орчин үеийн тансаглалтай уран нарийнаар хослуулсан буудал. Хорхог ресторан, морины аялал, соёлын хөтөлбөр.',
    amenities:['🏹 Монгол соёлын экспозиц','🍖 Хорхог ресторан','🐎 Морины аялал','💆 Монгол эмчилгээ','🏺 Гар урлалын дэлгүүр','🌐 Гид үйлчилгээ'],
    gallery:['https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800','https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800'],
    pros:['✓ Монгол соёл, урлагийн үзэсгэлэн','✓ Хорхог, буузны тансаг ресторан','✓ Морины аялал зохион байгуулалт'],
    cons:['— Хотоос бага зэрэг холдуу байршил']},
  {id:8,name:'Рамада Улаанбаатар',slug:'ramada',stars:4,rating:4.33,total_reviews:834,is_featured:false,city:'Улаанбаатар',address:'Олимпийн гудамж 14/1',phone:'+976 7700-2200',email:'reservations@ramada-ub.mn',check_in_time:'15:00',check_out_time:'12:00',min_price:250000,available_rooms:5,
    cover_image:'https://images.unsplash.com/photo-1549294413-26f195200c16?w=1200&q=80',tagline:'Wyndham Group буудал — орчин үеийн тав тух',
    description:'Wyndham Hotels & Resorts группийн гишүүн буудал. Олон улсын чанарын стандарт, монгол дулаан зочломтгой байдлыг хослуулсан.',
    amenities:['🍽 Олон улсын кухни','🏊 Бассейн','💪 Фитнесс','🧖 Спа','🏢 Хурлын танхим','🅿 Зогсоол','📶 WiFi'],
    gallery:['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800','https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'],
    pros:['✓ Wyndham брэндийн баталгаат чанар','✓ Бассейн, спа бүхий','✓ Хотын дунд байршил'],
    cons:['— Нэмэлт үйлчилгээ өртөг дундаж','— Захиалгын хугацааны хязгаарлалт']},
];

const D_ROOMS={
  1:[
    {id:1,hotel_id:1,name:'Делюкс Өрөo',bed_type:'king',size_sqm:42,max_guests:2,base_price:385000,available_count:4,description:'Хотын панорама харагдацтай King size орон, мрамар угаалгын өрөotай тансаглалын өрөo.',amenities:['King ор','Хот харагдац','Мрамар угаалга','Тусдаа душ+ванн','Үнэгүй WiFi','Мини бар','55" Smart TV'],images:['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600'],pros:['✓ 42м² өргөн зай','✓ Мрамар угаалга','✓ Хотын гоё харагдац'],cons:['— 3+ зочинд хязгаарлагдмал']},
    {id:2,hotel_id:1,name:'Клуб Делюкс',bed_type:'king',size_sqm:52,max_guests:2,base_price:520000,available_count:2,description:'Horizon Club lounge нэвтрэлт, өглөөний цай болон оройн коктейл оруулсан тансаг өрөo.',amenities:['King ор','Horizon Club','Өглөөний цай','Оройн коктейл','Butler','Спа 20%'],images:['https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=600'],pros:['✓ Club Lounge хоол, унд','✓ Butler','✓ 52м²'],cons:['— Нэмэлт үнэ']},
    {id:3,hotel_id:1,name:'Тэргүүн Сюит',bed_type:'king',size_sqm:85,max_guests:3,base_price:720000,available_count:2,description:'Тусдаа амралтын өрөo, хоолны зааль, ванн болон душ тусдаа.',amenities:['King ор','Тусдаа амралтын өрөo','Хоолны зааль','Ванн+Душ','Butler','Клуб lounge'],images:['https://images.unsplash.com/photo-1609766418204-94aae0ecfefd?w=600'],pros:['✓ 85м²','✓ Butler','✓ VIP lounge'],cons:['— Харьцангуй үнэтэй']},
    {id:4,hotel_id:1,name:'Президент Сюит',bed_type:'king',size_sqm:140,max_guests:4,base_price:1450000,available_count:1,description:'Хоёр давхарт байршилтай, хувийн тогооч үйлчилгээтэй.',amenities:['2 унтлагын өрөo','Хувийн тогооч','Concierge 24/7','Jacuzzi'],images:['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600'],pros:['✓ 140м²','✓ Хувийн тогооч','✓ Jacuzzi'],cons:['— Маш үнэтэй']},
  ],
  2:[
    {id:5,hotel_id:2,name:'Стандарт Өрөo',bed_type:'double',size_sqm:28,max_guests:2,base_price:180000,available_count:5,description:'Хотын харагдацтай тохилог стандарт өрөo.',amenities:['Double ор','Хот харагдац','WiFi','Smart TV','Мини бар'],images:['https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=600'],pros:['✓ Хямд үнэ','✓ Хотын дунд'],cons:['— 28м² жижиг']},
    {id:6,hotel_id:2,name:'Панорама Делюкс',bed_type:'queen',size_sqm:38,max_guests:2,base_price:280000,available_count:3,description:'360° панорама харагдацтай Queen size орон бүхий делюкс өрөo.',amenities:['Queen ор','360° харагдац','Биде','Smart TV','Bluetooth чанга яригч'],images:['https://images.unsplash.com/photo-1560347876-aeef00ee58a1?w=600'],pros:['✓ 360° панорама','✓ 38м²'],cons:['— Өвөлд хүйтэн']},
    {id:7,hotel_id:2,name:'Бизнес Сюит',bed_type:'king',size_sqm:55,max_guests:3,base_price:420000,available_count:2,description:'Ажил хэрэгчдэд зориулагдсан принтер, хурдан интернеттэй.',amenities:['King ор','Ажлын өрөo','Принтер/Скан','WiFi 1Gbps'],images:['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600'],pros:['✓ Бизнес аялалд','✓ Принтер/Скан'],cons:['— Бизнес аялалд зориулагдсан']},
  ],
  3:[
    {id:8,hotel_id:3,name:'Клуб Өрөo',bed_type:'king',size_sqm:52,max_guests:2,base_price:650000,available_count:3,description:'Клубийн давхарт байрлах, Club lounge нэвтрэлттэй.',amenities:['King ор','Клуб lounge','Өглөөний цай','Оройн коктейл','Спа 20%','Butler'],images:['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600'],pros:['✓ Club Lounge','✓ Butler','✓ 52м²'],cons:['— Үнэ өндөр']},
    {id:9,hotel_id:3,name:'Хааны Сюит',bed_type:'king',size_sqm:110,max_guests:4,base_price:1200000,available_count:1,description:'Монгол хааны уламжлалаас санаа авсан, гар урлалын ханын чимэглэлтэй.',amenities:['2 унтлагын өрөo','Хувийн спа','Ванн+Душ','VIP Club lounge','Jacuzzi'],images:['https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=600'],pros:['✓ 110м²','✓ Монгол дизайн','✓ Хувийн спа'],cons:['— Маш үнэтэй']},
  ],
  4:[
    {id:10,hotel_id:4,name:'Монгол Гэр Тасалгаа',bed_type:'double',size_sqm:32,max_guests:2,base_price:120000,available_count:4,description:'Монгол гэрийн уламжлалт хэв маяг, орчин үеийн тав тухтай хослуулсан.',amenities:['Double ор','Уламжлалт монгол засал','WiFi','Монгол бол','Уул харагдац'],images:['https://images.unsplash.com/photo-1560347876-aeef00ee58a1?w=600'],pros:['✓ Монгол орчин','✓ Байгальд ойр'],cons:['— WiFi гацаатай']},
    {id:11,hotel_id:4,name:'Уламжлалт Люкс',bed_type:'queen',size_sqm:45,max_guests:3,base_price:200000,available_count:2,description:'Монгол гар урлалын чимэглэл, ажлын булан, уулын харагдацтай.',amenities:['Queen ор','Амралтын булан','Гар урлалын чимэглэл','Уул харагдац'],images:['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600'],pros:['✓ 45м²','✓ Гар урлалын чимэглэл'],cons:['— WiFi сул']},
  ],
  5:[
    {id:12,hotel_id:5,name:'Superior Room',bed_type:'double',size_sqm:32,max_guests:2,base_price:220000,available_count:5,description:'Accor стандартын тохилог superior өрөo.',amenities:['Double ор','City view','WiFi','Smart TV','Work desk'],images:['https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=600'],pros:['✓ Олон улсын стандарт','✓ Ажлын ширээ'],cons:['— Дундаж хэмжээ']},
    {id:13,hotel_id:5,name:'Executive Room',bed_type:'king',size_sqm:48,max_guests:2,base_price:340000,available_count:2,description:'Executive давхарт байрлах, lounge нэвтрэлттэй.',amenities:['King ор','Executive Lounge','Өглөөний цай','Ажлын булан'],images:['https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=600'],pros:['✓ Executive Lounge','✓ Өглөөний цай'],cons:['— Нэмэлт үнэ']},
  ],
  6:[
    {id:14,hotel_id:6,name:'Стандарт Сингл',bed_type:'single',size_sqm:22,max_guests:1,base_price:89000,available_count:5,description:'Ажлын аялагчдад зориулсан тухтай, хямд стандарт өрөo.',amenities:['Single ор','WiFi','TV','Ажлын ширээ'],images:['https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=600'],pros:['✓ Хамгийн хямд үнэ','✓ Цэвэр орчин'],cons:['— Жижиг хэмжээ']},
    {id:15,hotel_id:6,name:'Стандарт Давхар',bed_type:'double',size_sqm:30,max_guests:2,base_price:130000,available_count:3,description:'Хотын харагдацтай давхар стандарт өрөo.',amenities:['Double ор','Хот харагдац','WiFi','TV'],images:['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600'],pros:['✓ Сайн үнэ','✓ Хотын харагдац'],cons:['— Хуучирсан тавилга']},
  ],
  7:[
    {id:16,hotel_id:7,name:'Баатар Өрөo',bed_type:'double',size_sqm:38,max_guests:2,base_price:195000,available_count:4,description:'Монгол дайчин баатрын сэдвээр чимэглэсэн өрөo.',amenities:['Double ор','Монгол дизайн','WiFi','Smart TV','Монгол чай','Гар урлалын бэлэг'],images:['https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=600'],pros:['✓ Монгол өвөрмөц дизайн','✓ Соёлын туршлага'],cons:['— Хотоос холдуу']},
    {id:17,hotel_id:7,name:'Хан Сюит',bed_type:'king',size_sqm:70,max_guests:3,base_price:450000,available_count:2,description:'Дорнодын хан хааны нэрэмжит тансаг сюит.',amenities:['King ор','Тусдаа амралтын өрөo','Монгол чимэглэл','Хувийн тогооч','Морины аялал'],images:['https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=600'],pros:['✓ 70м²','✓ Морины аялал','✓ Хувийн тогооч'],cons:['— Үнэ харьцангуй өндөр']},
  ],
  8:[
    {id:18,hotel_id:8,name:'Standard Room',bed_type:'double',size_sqm:30,max_guests:2,base_price:250000,available_count:5,description:'Wyndham стандартын тохилог давхар өрөo.',amenities:['Double ор','WiFi','Smart TV','Mini bar','Work desk','Coffee maker'],images:['https://images.unsplash.com/photo-1549294413-26f195200c16?w=600'],pros:['✓ Олон улсын стандарт','✓ Тав тухтай'],cons:['— Онцлог дизайн дутуу']},
    {id:19,hotel_id:8,name:'Deluxe King',bed_type:'king',size_sqm:45,max_guests:2,base_price:380000,available_count:3,description:'Делюкс King size орон, тусдаа угаалгын өрөo, хотын харагдацтай.',amenities:['King ор','Хот харагдац','Тусдаа угаалга','Bath tub','WiFi','Smart TV 50"'],images:['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600'],pros:['✓ 45м²','✓ Bath tub','✓ Хотын харагдац'],cons:['— Нэмэлт үнэ']},
  ],
};

const D_REVS={
  1:[{first_name:'Б.Болд',overall_rating:5,created_at:'2024-11-20',comment:'Гайхалтай үйлчилгээ! Butler маань бүх хүсэлтийг шийдэж байлаа. Хотын харагдац маш гоё.'},
     {first_name:'С.Нарантуяа',overall_rating:4,created_at:'2024-10-15',comment:'Байршил маш сайн, хоол амт тансаг. Бага зэрэг чимээтэй байсан ч бусад бүх зүйл төгс.'}],
  2:[{first_name:'А.Дөлгөөн',overall_rating:5,created_at:'2024-11-10',comment:'Дээд давхарт буй панорама харагдац хот болон уулыг нэгэн зэрэг харуулна.'},
     {first_name:'Т.Мөнхбаяр',overall_rating:4,created_at:'2024-09-28',comment:'Үнэ-чанарын харьцаа маш сайн. Хотын дунд байршилтай.'}],
  3:[{first_name:'Г.Анхбаяр',overall_rating:5,created_at:'2024-12-01',comment:'Kempinski буудал дэлхийд алдартай шалтгаантай! Монголын дизайн ялгарна. Butler 24/7 туслахад бэлэн.'},
     {first_name:'О.Батчимэг',overall_rating:5,created_at:'2024-11-05',comment:'Амьдралдаа очсон хамгийн сайн буудал.'}],
  4:[{first_name:'Х.Оюунчимэг',overall_rating:5,created_at:'2024-10-20',comment:'Монгол өв соёлыг бодитоор мэдрэх боломж! Гар урлалын чимэглэл, монгол бол — бүгд гайхалтай.'}],
  5:[{first_name:'Д.Батаа',overall_rating:4,created_at:'2024-11-15',comment:'Accor стандарт маш сайн сахигдсан. Ажлын аялалд маш тохиромжтой. WiFi хурдан.'}],
  6:[{first_name:'Р.Энхтуяа',overall_rating:4,created_at:'2024-10-08',comment:'Үнэ-чанарын харьцаагаараа хамгийн сайн буудал. Монгол ресторан маш амттай байлаа.'}],
  7:[{first_name:'Б.Сүхбаатар',overall_rating:5,created_at:'2024-11-25',comment:'Хорхог ресторан гайхалтай! Морины аялал маш сонирхолтой туршлага болсон.'},
     {first_name:'Э.Дашдорж',overall_rating:4,created_at:'2024-10-12',comment:'Монгол соёлын музейн экспозиц маш гоё. Гид маш мэдлэгтэй, найрсаг байлаа.'}],
  8:[{first_name:'М.Ганбаатар',overall_rating:4,created_at:'2024-11-18',comment:'Wyndham брэндийн баталгаат чанар. Бассейн, спа сайхан байлаа.'}],
};

const D_SVCS=[
  {id:1,name:'🍳 Өглөөний цай (2 хүн)',price:25000,category:'food'},
  {id:2,name:'🚌 Нисэх буудал шилжүүлэг',price:80000,category:'transport'},
  {id:3,name:'💐 Мэндчилгээний цэцэг баг',price:35000,category:'extra'},
  {id:4,name:'🧖 Спа эмчилгээ (60 мин)',price:120000,category:'wellness'},
  {id:5,name:'🍾 Тансаг орой хоол (2 хүн)',price:75000,category:'food'},
  {id:6,name:'🅿 Машины зогсоол /хоног/',price:15000,category:'transport'},
  {id:7,name:'🎂 Мэндэлсэн өдрийн бэлэг',price:45000,category:'extra'},
  {id:8,name:'🛁 Ванн цэцэг, дарс',price:55000,category:'wellness'},
];

const D_PROMOS={
  'MONGOL2024':{pct:15,lbl:'15% хөнгөлөлт',min_nights:2},
  'WELCOME10':{pct:10,lbl:'10% хөнгөлөлт',min_nights:1},
  'SUMMER50000':{flat:50000,lbl:'50,000₮ хөнгөлөлт',min_nights:3},
  'SHANGRI15':{pct:15,lbl:'15% Шангрила хөнгөлөлт',hotel_id:1},
  'KEMP20':{pct:20,lbl:'20% Кемпинский VIP',hotel_id:3},
  'URGOO10':{pct:10,lbl:'10% Өргөө Бутик',hotel_id:4},
  'NOVOTEL15':{pct:15,lbl:'15% Новотел хөнгөлөлт',hotel_id:5},
  'BAYANGOL20':{pct:20,lbl:'20% Баянгол хөнгөлөлт',hotel_id:6},
  'CHINGGIS10':{pct:10,lbl:'10% Чингис хөнгөлөлт',hotel_id:7},
  'RAMADA15':{pct:15,lbl:'15% Рамада хөнгөлөлт',hotel_id:8},
};

/* ═══════════════════════════ LOAD HOTELS ════════════════════════════════ */
async function loadHotels(){
  const g=$('hotels-grid');
  g.innerHTML=`<div class="load-row" style="grid-column:1/-1"><div class="spin"></div> Буудлуудыг ачааллаж байна...</div>`;
  let hotels=[];
  try{
    const d=await api('get_hotels');
    hotels=d.hotels||[];
    if(!hotels.length) throw 0;
  }catch{ hotels=D_HOTELS; }
  G.hotels=hotels; G.allHotels=hotels;
  $('hcount').textContent=hotels.length+' буудал';
  renderHotelGrid(hotels);
}

function renderHotelGrid(hotels){
  const g=$('hotels-grid');
  g.innerHTML=hotels.length
    ? hotels.map((h,i)=>hotelCardHTML(h,i)).join('')
    : '<div class="load-row" style="grid-column:1/-1;color:var(--mist)">Буудал олдсонгүй</div>';
  g.querySelectorAll('.hcard').forEach(el=>{ revObs.observe(el); window._hl(el); });
}

function filterHotels(type,btn){
  $$('.ftab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  let list=G.allHotels;
  if(type==='5') list=list.filter(h=>h.stars===5);
  else if(type==='4') list=list.filter(h=>h.stars===4||h.stars===3);
  else if(type==='featured') list=list.filter(h=>h.is_featured);
  else if(type==='cheap') list=list.filter(h=>h.min_price<200000);
  G.hotels=list;
  renderHotelGrid(list);
}

function hotelCardHTML(h,i){
  return `<div class="hcard reveal" style="transition-delay:${i*.07}s" onclick="openDet(${h.id})">
    <div class="hc-img">
      <img src="${h.cover_image}" alt="${h.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80'">
      <div class="hc-ov"></div>
      <div class="hc-stars">${'⭐'.repeat(Math.min(5,h.stars||5))}</div>
      ${h.is_featured?'<div class="hc-badge">✦ Онцолсон</div>':''}
      <div class="hc-live"><div class="lp"></div><span>${h.available_rooms||'—'} өрөo</span></div>
      <div class="hc-price-badge">${h.min_price?fmtM(h.min_price):'—'}+</div>
    </div>
    <div class="hc-body">
      <div class="hc-city">📍 ${h.city||'Улаанбаатар'}</div>
      <div class="hc-name">${h.name}</div>
      <div class="hc-tagline">${(h.tagline||'').slice(0,72)}${(h.tagline||'').length>72?'…':''}</div>
      <div class="hc-chips">${(h.amenities||[]).slice(0,4).map(a=>`<span class="chip">${a}</span>`).join('')}</div>
      <div class="hc-foot">
        <div style="display:flex;align-items:center;gap:7px">
          <span class="hc-score">${parseFloat(h.rating||4.5).toFixed(1)}</span>
          <span class="hc-revs">${(h.total_reviews||0).toLocaleString()} үнэлгээ</span>
        </div>
        <div>
          <div class="hc-from">Эхлэх үнэ</div>
          <div class="hc-price">${h.min_price?fmt(h.min_price):'—'}</div>
        </div>
      </div>
      <button class="hc-btn"><span>Дэлгэрэнгүй харах</span><div class="hc-arr">→</div></button>
    </div>
  </div>`;
}

/* ═══════════════════════════ DETAIL ═════════════════════════════════════ */
async function openDet(id){
  const ov=$('det-ov');
  ov.classList.add('on'); ov.scrollTop=0;
  document.body.style.overflow='hidden';
  $('det-body').innerHTML=`<div class="load-row" style="padding:80px 20px"><div class="spin"></div> Буудлын мэдээлэл ачааллаж байна...</div>`;

  let h=null;
  try{
    const d=await api('get_hotel',{id});
    h=d.hotel; if(!h) throw 0;
    ['amenities','gallery','pros','cons'].forEach(k=>{
      if(typeof h[k]==='string') try{ h[k]=JSON.parse(h[k]); }catch{ h[k]=[]; }
    });
    if(!h.room_types?.length) throw 'no rooms';
  }catch{
    h={...(D_HOTELS.find(x=>x.id===id)||{})};
    if(!h.id){ $('det-body').innerHTML='<div class="alert al-e" style="margin:40px">Буудал олдсонгүй</div>'; return; }
    h.room_types=D_ROOMS[id]||[];
    h.reviews=D_REVS[id]||[];
  }
  G.hotel=h;
  renderDetUI(h);
}

function renderDetUI(h){
  $('dh-img').src=h.cover_image||'';
  $('dh-img').onerror=function(){ this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80'; };
  $('dh-stars').textContent='⭐'.repeat(Math.min(5,h.stars||5));
  $('dh-name').textContent=h.name;
  $('dh-loc').innerHTML=`📍 ${h.address||h.city||''} &nbsp;|&nbsp; 📞 ${h.phone||'—'} &nbsp;|&nbsp; ✉️ ${h.email||'—'}`;
  $('dh-rbox').innerHTML=`<div class="dh-rscore">${parseFloat(h.rating||4.5).toFixed(1)}</div><div class="dh-rlabel">Оноо</div><div class="dh-rcount">${(h.total_reviews||0).toLocaleString()} хүн</div>`;

  const gal=Array.isArray(h.gallery)?h.gallery:[];
  const galH=gal.length>=2?`
    <div style="margin-bottom:32px">
      <div class="gallery-grid">
        <img class="gg-img" src="${gal[0]}" loading="lazy" onerror="this.style.display='none'">
        <img class="gg-img" src="${gal[1]}" loading="lazy" onerror="this.style.display='none'">
        <div class="gg-more">
          <img class="gg-img" src="${gal[2]||gal[0]}" loading="lazy" onerror="this.style.display='none'">
          ${gal.length>3?`<div class="gg-more-lbl">+${gal.length-3} зураг</div>`:''}
        </div>
      </div>
    </div>`:gal.length===1?`<div style="margin-bottom:32px;border-radius:12px;overflow:hidden;height:260px"><img src="${gal[0]}" style="width:100%;height:100%;object-fit:cover"></div>`:'';

  const prosH=(Array.isArray(h.pros)&&h.pros.length)?`<div class="pc-col pc-pro"><div class="pc-title">✅ Давуу тал</div>${h.pros.map(p=>`<div class="pc-item">${p}</div>`).join('')}</div>`:'';
  const consH=(Array.isArray(h.cons)&&h.cons.length)?`<div class="pc-col pc-con"><div class="pc-title">⚠️ Сул тал</div>${h.cons.map(c=>`<div class="pc-item">${c}</div>`).join('')}</div>`:'';
  const amenH=(Array.isArray(h.amenities)&&h.amenities.length)?`
    <div style="margin-bottom:32px"><div class="sec-hd">Тав Тух & Үйлчилгээ</div>
    <div style="display:flex;flex-wrap:wrap;gap:7px">${h.amenities.map(a=>`<span class="chip" style="padding:7px 14px;font-size:12px">${a}</span>`).join('')}</div></div>`:'';

  const rooms=h.room_types||[];
  const roomH=`
    <div style="margin-bottom:32px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px">
        <div id="rlist-title" class="sec-hd" style="margin-bottom:0">Өрөoний Төрлүүд <span style="font-size:13px;color:var(--mist);font-weight:400">${rooms.length} төрөл</span></div>
        <button id="rsearch-btn" onclick="searchAvail()" style="background:rgba(200,151,58,.1);border:1px solid rgba(200,151,58,.3);color:var(--gold);padding:8px 16px;border-radius:50px;font-size:12px;cursor:pointer;transition:all .2s">🔍 Хэлбэр хайх</button>
      </div>
      <div id="room-list">${rooms.map(rt=>roomCardHTML(rt)).join('')}</div>
    </div>`;

  const revs=h.reviews||[];
  const revH=revs.length?`
    <div style="margin-bottom:32px">
      <div class="sec-hd">Зочдын Үнэлгээ <span style="font-size:14px;color:var(--gold);font-weight:400">${parseFloat(h.rating||4.5).toFixed(1)} ⭐</span></div>
      ${revs.map(rv=>`
        <div class="rev-item">
          <div class="rev-head">
            <div class="rev-user">
              <div class="rev-av">${(rv.first_name||'?')[0].toUpperCase()}</div>
              <div><div class="rev-name">${rv.first_name||''} ${rv.last_name||''}</div><div class="rev-date">${new Date(rv.created_at).toLocaleDateString('mn-MN')}</div></div>
            </div>
            <div>${'⭐'.repeat(rv.overall_rating||5)}</div>
          </div>
          <p class="rev-text">${rv.comment||''}</p>
        </div>`).join('')}
    </div>`:'';

  const widget=`
    <div class="bwidget">
      <div class="bw-title">📅 Боломжит Өрөo Хайх</div>
      <label class="bw-label">Ирэх огноо</label>
      <input class="bw-input" type="date" id="sw-in" value="${today()}" min="${today()}" onchange="calcNights()">
      <div class="bw-row">
        <div><label class="bw-label">Явах огноо</label><input class="bw-input" type="date" id="sw-out" value="${tmrw()}" min="${tmrw()}" onchange="calcNights()"></div>
        <div><label class="bw-label">Зочид</label><select class="bw-input" id="sw-g"><option value="1">1 хүн</option><option value="2" selected>2 хүн</option><option value="3">3 хүн</option><option value="4">4 хүн</option></select></div>
      </div>
      <div id="sw-nights" style="text-align:center;font-size:11px;min-height:18px;margin:-4px 0 10px;color:var(--gold)"></div>
      <button class="bw-btn" id="sw-btn" onclick="searchAvail()">🔍 Боломжит өрөo хайх</button>
      <div class="bw-div">Буудлын мэдээлэл</div>
      <div style="font-size:12px;color:var(--text);line-height:2.2">
        <div>📞 ${h.phone||'—'}</div><div>✉️ ${h.email||'—'}</div>
        <div>🕐 Нэвтрэх: <strong>${h.check_in_time||'14:00'}</strong></div>
        <div>🕐 Гарах: <strong>${h.check_out_time||'12:00'}</strong></div>
        <div style="color:var(--gold)">🏅 ${'⭐'.repeat(h.stars||4)} ${h.stars||4} одтой буудал</div>
      </div>
    </div>`;

  $('det-body').innerHTML=`
    <div class="det-cols">
      <div>
        <p style="font-size:14px;color:var(--text);line-height:1.95;margin-bottom:24px">${h.description||''}</p>
        ${galH}
        ${(prosH||consH)?`<div class="pc-grid">${prosH}${consH}</div>`:''}
        ${amenH}${roomH}${revH}
      </div>
      <div class="det-sticky">${widget}</div>
    </div>`;
  calcNights();
}

function roomCardHTML(rt,nights){
  const img=(Array.isArray(rt.images)?rt.images:[rt.images||''])[0]||'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600';
  const avCnt=rt.available_count??rt.available??null;
  const avBadge=avCnt!==null?(avCnt>0?`<span class="av-badge av-ok">✅ ${avCnt} боломжтой</span>`:`<span class="av-badge av-no">❌ Дүүрэн</span>`):'';
  const hid=rt.hotel_id||G.hotel?.id||0;
  const prosH=(Array.isArray(rt.pros)&&rt.pros.length)?`<div style="background:rgba(60,179,113,.05);border:1px solid rgba(60,179,113,.15);border-radius:8px;padding:10px 12px;margin-top:8px"><div style="font-size:9px;color:#7dd9a8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">✅ Давуу тал</div>${rt.pros.map(p=>`<div style="font-size:11px;color:var(--text);line-height:1.7">${p}</div>`).join('')}</div>`:'';
  const consH=(Array.isArray(rt.cons)&&rt.cons.length)?`<div style="background:rgba(255,193,7,.04);border:1px solid rgba(255,193,7,.12);border-radius:8px;padding:10px 12px;margin-top:6px"><div style="font-size:9px;color:#ffc107;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">⚠️ Сул тал</div>${rt.cons.map(c=>`<div style="font-size:11px;color:var(--text);line-height:1.7">${c}</div>`).join('')}</div>`:'';
  return `<div class="rcard">
    <div class="rcard-lay">
      <div class="ri-wrap"><img src="${img}" alt="${rt.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=600'"></div>
      <div class="rbody">
        <div>
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px">
            <div class="rname">${rt.name}</div>${avBadge}
          </div>
          <div class="rmeta"><span>🛏 ${bedMn(rt.bed_type)}</span><span>📐 ${rt.size_sqm||'—'}м²</span><span>👥 Max ${rt.max_guests} хүн</span></div>
          <p class="rdesc">${rt.description||''}</p>
          <div class="rchips">${(Array.isArray(rt.amenities)?rt.amenities:[]).slice(0,6).map(a=>`<span class="rc">${a}</span>`).join('')}</div>
          ${prosH}${consH}
        </div>
        <div class="rfooter">
          <div class="rprice">
            ${nights?`<div class="rp-from">${nights} хоногийн нийт</div><div class="rp-val">${fmt(rt.base_price*nights)}</div><div style="font-size:10px;color:var(--mist)">${fmt(rt.base_price)} / хоног</div>`
            :`<div class="rp-from">1 хоногийн үнэ</div><div class="rp-val">${fmt(rt.base_price)}<span class="rp-unit"> / хоног</span></div>`}
          </div>
          <button class="book-btn" ${avCnt===0?'disabled':''}
            onclick='openBook(${esc({...rt,hotel_id:hid})})'>
            ${avCnt===0?'❌ Дүүрэн':'Захиалах →'}
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

function calcNights(){
  const ci=$('sw-in')?.value, co=$('sw-out')?.value, el=$('sw-nights');
  if(!ci||!co||!el) return;
  const n=Math.round((new Date(co)-new Date(ci))/86400000);
  el.style.color=n>0?'var(--gold)':'var(--red)';
  el.textContent=n>0?`📅 ${n} хоног сонгогдлоо`:'⚠️ Огноо буруу байна';
}

async function searchAvail(){
  if(!G.hotel) return;
  const ci=$('sw-in')?.value, co=$('sw-out')?.value, g=$('sw-g')?.value||'2';
  if(!ci||!co||co<=ci){ toast('Огноог зөв оруулна уу','e'); return; }
  const n=nts(ci,co);
  const btn=$('sw-btn')||$('rsearch-btn');
  const list=$('room-list'), title=$('rlist-title');
  btnL(btn,true,'Хайж байна...');
  if(list) list.innerHTML=`<div class="load-row"><div class="spin"></div> Боломжит өрөo шалгаж байна...</div>`;

  let types=[],ok=true;
  try{
    const d=await api('search_rooms',{hotel_id:G.hotel.id,check_in:ci,check_out:co,adults:g});
    types=d.room_types||[];
    types.forEach(t=>{ ['amenities','images','pros','cons'].forEach(k=>{ if(typeof t[k]==='string') try{ t[k]=JSON.parse(t[k]); }catch{ t[k]=[]; } }); });
  }catch{
    ok=false;
    types=(D_ROOMS[G.hotel.id]||[]).filter(r=>(r.available_count||0)>0&&(r.max_guests||2)>=(parseInt(g)||1));
  }
  btnL(btn,false);

  if(title) title.innerHTML=types.length
    ?`Хайлтын Үр Дүн <span style="font-size:13px;color:var(--mist);font-weight:400">${types.length} өрөo · ${n} хоног · ${g} зочин${!ok?' (demo)':''}</span>`
    :`Хайлтын Үр Дүн <span style="font-size:13px;color:var(--mist)">0 өрөo</span>`;

  if(!list) return;
  if(!types.length){
    list.innerHTML=`<div class="alert al-i" style="flex-direction:column;gap:10px"><div>😔 <strong>${ci} — ${co}</strong> хооронд ${g} зочинд зориулсан боломжит өрөo байхгүй.</div><a style="color:var(--gold);cursor:pointer;font-size:12px" onclick="resetRooms()">↩ Бүх өрөог харах</a></div>`;
    return;
  }
  list.innerHTML=types.map(rt=>roomCardHTML({...rt,hotel_id:G.hotel.id},n)).join('');
  toast(`${types.length} боломжит өрөo олдлоо ✓`,'s');
}

function resetRooms(){
  if(!G.hotel) return;
  const list=$('room-list'), title=$('rlist-title');
  const rooms=G.hotel.room_types||D_ROOMS[G.hotel.id]||[];
  if(list) list.innerHTML=rooms.map(rt=>roomCardHTML(rt)).join('');
  if(title) title.innerHTML=`Өрөoний Төрлүүд <span style="font-size:13px;color:var(--mist);font-weight:400">${rooms.length} төрөл</span>`;
}

function doSearch(){
  const hid=$('s-hotel').value, ci=$('s-in').value, co=$('s-out').value;
  if(ci&&co&&co<=ci){ toast('Явах огноо ирэх огнооноос хойш байх ёстой','e'); return; }
  if(hid){ openDet(parseInt(hid)); }
  else{ $('hotels-sec')?.scrollIntoView({behavior:'smooth'}); }
}

/* ══════════════════════════ BOOKING ════════════════════════════════════ */
async function openBook(rt){
  if(!G.user){
    G._after={fn:openBook,args:[rt]};
    openModal('login-modal');
    toast('Захиалга хийхийн тулд нэвтэрч орно уу','i');
    return;
  }
  G.rt=rt; G.promo=0;
  setAlert('bm-alert',''); $('promo-res').innerHTML=''; $('bm-promo').value=''; $('bm-special').value='';

  const img=(Array.isArray(rt.images)?rt.images:[])[0]||'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=300';
  $('bm-img').src=img;
  $('bm-hname').textContent=G.hotel?.name||'';
  $('bm-rname').textContent=rt.name;
  $('bm-rmeta').textContent=`${bedMn(rt.bed_type)} · ${rt.size_sqm||'—'}м² · Max ${rt.max_guests} хүн`;

  const ci=$('sw-in')?.value||today();
  const co=$('sw-out')?.value||tmrw();
  $('bm-in').value=ci; $('bm-in').min=today();
  $('bm-out').value=co; $('bm-out').min=tmrw();

  try{
    const sd=await api('get_services',{hotel_id:rt.hotel_id||G.hotel?.id||0});
    G._svcs=sd.services||D_SVCS;
  }catch{ G._svcs=D_SVCS; }

  $('bm-svcs').innerHTML=(G._svcs||[]).map(s=>`
    <div class="svc" onclick="togSvc(this)">
      <input type="checkbox" value="${s.id}" data-price="${s.price}" style="display:none">
      <div class="svc-n">${s.name}</div>
      <div class="svc-p">+${fmt(s.price)}</div>
    </div>`).join('');

  calcPrice();
  openModal('book-modal');
}

function togSvc(el){ const cb=el.querySelector('input'); cb.checked=!cb.checked; el.classList.toggle('sel',cb.checked); calcPrice(); }

function calcPrice(){
  if(!G.rt) return;
  const ci=$('bm-in').value, co=$('bm-out').value;
  if(!ci||!co) return;
  const nights=Math.ceil((new Date(co)-new Date(ci))/86400000);
  if(nights<=0){ $('pbd').style.display='none'; return; }

  const roomTotal=G.rt.base_price*nights;
  let svcTotal=0;
  $$('#bm-svcs input:checked').forEach(el=>{ svcTotal+=parseFloat(el.dataset.price||0); });
  const disc=G.promo||0;
  const tax=(roomTotal-disc+svcTotal)*0.10;
  const total=roomTotal-disc+svcTotal+tax;

  $('pbd').style.display='block';
  $('pb-room').textContent=fmt(roomTotal);
  const dr=$('pb-drow'),ds=$('pb-disc');
  if(disc>0){ dr.style.display='flex'; ds.textContent='-'+fmt(disc); }else{ dr.style.display='none'; }
  const sr=$('pb-srow'),ss=$('pb-svc');
  if(svcTotal>0){ sr.style.display='flex'; ss.textContent=fmt(svcTotal); }else{ sr.style.display='none'; }
  $('pb-tax').textContent=fmt(tax);
  $('pb-total').textContent=fmt(total);

  G.bk={...(G.bk||{}),nights,room_total:roomTotal,disc,svc_total:svcTotal,tax,total_price:total};
}

async function applyPromo(){
  const code=($('bm-promo').value||'').trim().toUpperCase();
  if(!code){ toast('Купон кодоо оруулна уу','w'); return; }
  const btn=document.querySelector('.promo-go');
  const ci=$('bm-in').value, co=$('bm-out').value;
  const n=ci&&co?nts(ci,co):1;
  const amount=(G.rt?.base_price||0)*n;
  const hid=G.rt?.hotel_id||G.hotel?.id||0;
  btnL(btn,true,'...');
  try{
    const d=await api('check_promo',{},{code,hotel_id:hid,nights:n,amount});
    if(d.valid){
      G.promo=d.discount;
      $('promo-res').innerHTML=`<div class="alert al-s">🎁 <strong>${code}</strong> — ${d.label} хэрэглэгдлээ!</div>`;
      calcPrice(); toast(`${d.label} хэрэглэгдлээ 🎉`,'s');
    }else{
      G.promo=0;
      $('promo-res').innerHTML=`<div class="alert al-e">✕ ${d.error||'Купон хүчингүй'}</div>`;
      calcPrice();
    }
  }catch{
    const p=D_PROMOS[code];
    if(p&&(!p.hotel_id||p.hotel_id===hid)&&(!p.min_nights||n>=p.min_nights)){
      G.promo=p.pct?amount*p.pct/100:p.flat;
      $('promo-res').innerHTML=`<div class="alert al-s">🎁 <strong>${code}</strong> — ${p.lbl} хэрэглэгдлээ!</div>`;
      calcPrice(); toast(`${p.lbl} 🎉`,'s');
    }else{
      G.promo=0;
      $('promo-res').innerHTML=`<div class="alert al-e">✕ Купон хүчингүй эсвэл таарахгүй байна</div>`;
      calcPrice();
    }
  }finally{ btnL(btn,false); }
}

async function doBook(){
  if(!G.bk?.total_price){ toast('Үнэ тооцогдоогүй байна','e'); return; }
  const btn=document.querySelector('#book-modal .mbtn'); btnL(btn,true,'Үүсгэж байна...');
  try{
    const d=await api('create_booking',{},{
      hotel_id:G.rt.hotel_id, room_type_id:G.rt.id,
      check_in:$('bm-in').value, check_out:$('bm-out').value,
      adults:$('bm-adults').value, children:$('bm-children').value,
      services:Array.from($$('#bm-svcs input:checked')).map(e=>({id:e.value,price:e.dataset.price})),
      promo_code:$('bm-promo').value,
      special_requests:$('bm-special').value,
    });
    if(!d.success){ toast(d.error||'Алдаа','e'); btnL(btn,false); return; }
    G.bk={...G.bk, booking_id:d.booking_id, booking_code:d.booking_code, total_price:d.total_price};
    closeModal('book-modal'); openPay();
  }catch(e){
    // Demo mode — generate local booking code
    const code='MH'+new Date().toISOString().slice(2,8).replace(/-/g,'')+Math.random().toString(36).slice(2,7).toUpperCase();
    G.bk={...G.bk, booking_id:Math.floor(Math.random()*90000)+10000, booking_code:code, total_price:G.bk.total_price};
    toast('Demo горим — захиалга үүслээ','i'); closeModal('book-modal'); openPay();
  }
  finally{ btnL(btn,false); }
}

/* ══════════════════════════ PAYMENT ════════════════════════════════════ */
function openPay(){
  if(!G.bk) return;
  $('pm-code').textContent=G.bk.booking_code||'—';
  $('pm-amt').textContent=fmt(G.bk.total_price);
  G.pay.method=null;
  $$('.pmb').forEach(b=>b.classList.remove('sel'));
  payStep('ps1');
  openModal('pay-modal');
}

function payStep(id){
  $$('.pstep').forEach(s=>s.classList.remove('on'));
  const el=$(id);
  if(el){ el.classList.add('on'); el.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:260,easing:'ease',fill:'both'}); }
}

function selM(method,el){ $$('.pmb').forEach(b=>b.classList.remove('sel')); el.classList.add('sel'); G.pay.method=method; }

async function proceedPay(){
  if(!G.pay.method){ toast('Төлбөрийн хэлбэр сонгоно уу','w'); return; }
  const btn=document.querySelector('#ps1 .mbtn'); btnL(btn,true,'Боловсруулж байна...');
  try{
    const d=await api('init_payment',{},{booking_id:G.bk.booking_id,method:G.pay.method});
    if(!d.success){ toast(d.error||'Алдаа','e'); btnL(btn,false); return; }
    G.pay.pid=d.payment_id;
    G.pay._sandbox=!!d.sandbox;
    renderPayUI(G.pay.method,d);
  }catch{
    // PHP сервер байхгүй — бүрэн demo горим
    G.pay.pid='demo_'+Date.now();
    G.pay._sandbox=true;
    const demoData={
      amount:G.bk.total_price,
      qr_text:'QPay_'+G.bk.booking_code+'_DEMO',
      sandbox:true,
      deep_links:makeDeepLinks(G.bk.booking_code),
      expires_in:1800,
      bank_info:getBankInfoDemo(G.pay.method),
      reference:G.bk.booking_code,
    };
    renderPayUI(G.pay.method,demoData);
  }finally{ btnL(btn,false); }
}

function renderPayUI(method,d){
  const amt=d.amount||G.bk.total_price;
  G.pay._sandbox=!!d.sandbox;

  if(method==='qpay'){
    payStep('ps-qpay');
    $('qamt').textContent=fmt(amt);

    // QR код зурах
    const cv=$('qr-cv');
    const qrTxt=d.qr_text||('QPay_'+G.bk.booking_code);
    if(typeof QRCode!=='undefined'){
      try{
        QRCode.toCanvas(cv,qrTxt,{width:180,margin:2,color:{dark:'#000000',light:'#ffffff'}},
          err=>{ if(err) renderFallbackQR(cv,qrTxt); });
      }catch{ renderFallbackQR(cv,qrTxt); }
    }else{ renderFallbackQR(cv,qrTxt); }

    // Deep links
    const links=d.deep_links||makeDeepLinks(G.bk.booking_code);
    $('blinks').innerHTML=links.map(b=>`
      <a class="blink" href="${b.url}" onclick="trackBankOpen('${b.id||b.name}')">
        <span class="blink-ic">${b.logo}</span>
        <span class="blink-n">${b.name}</span>
      </a>`).join('');

    // Sandbox мэдэгдэл
    if(d.sandbox){
      const statusEl=document.querySelector('#ps-qpay .pstatus');
      if(statusEl) statusEl.innerHTML=`<div class="spin" style="width:15px;height:15px"></div><span style="color:var(--gold)">Demo горим — "Төлбөр Шалгах" дарж дуусгана уу</span>`;
    }

    // Polling эхлүүлэх (7 секунд тутам, max 25 удаа = ~3 мин)
    clearInterval(G.pay._poll);
    G.pay._pollCount=0;
    G.pay._poll=setInterval(()=>{
      G.pay._pollCount++;
      if(G.pay._pollCount>25){ clearInterval(G.pay._poll); showQPayExpired(); return; }
      pollQPay();
    },7000);

    // Expire countdown харуулах (30 мин)
    startQPayTimer(d.expires_in||1800);

  }else if(['khanbank','golomtbank','tdbbank'].includes(method)){
    payStep('ps-bank');
    const bi=d.bank_info||getBankInfoDemo(method);
    $('binfo').innerHTML=`
      <div class="bi-row">
        <span class="bi-l">Банк</span>
        <span class="bi-v"><strong>${bi.name||'—'}</strong></span>
      </div>
      <div class="bi-row">
        <span class="bi-l">Дансны дугаар</span>
        <span class="bi-v">
          <strong style="font-family:'DM Mono',monospace;font-size:17px;letter-spacing:1px">${bi.account||'—'}</strong>
          <button class="copy-btn" onclick="cp('${bi.account}')">📋 Хуулах</button>
        </span>
      </div>
      <div class="bi-row">
        <span class="bi-l">Хүлээн авагч</span>
        <span class="bi-v">${bi.owner||'МонголHotels ХХК'}</span>
      </div>
      <div class="bi-row">
        <span class="bi-l">Гүйлгээний утга</span>
        <span class="bi-v">
          <strong style="font-family:'DM Mono',monospace;color:var(--gold);font-size:16px">${bi.reference||G.bk.booking_code}</strong>
          <button class="copy-btn" onclick="cp('${bi.reference||G.bk.booking_code}')">📋 Хуулах</button>
        </span>
      </div>
      <div class="bi-row">
        <span class="bi-l">Дүн</span>
        <span class="bi-v" style="color:var(--gold);font-weight:700;font-size:20px">${fmt(amt)}</span>
      </div>
      <div class="alert al-e" style="margin-top:16px;flex-direction:column;gap:6px">
        <div>⚠️ <strong>ЧУХАЛ:</strong> Гүйлгээний утгад <strong style="font-family:'DM Mono',monospace;color:var(--gold)">${bi.reference||G.bk.booking_code}</strong> заавал бичнэ үү.</div>
        <div style="font-size:11px;color:var(--mist)">Утга буруу бол захиалга автоматаар баталгаажихгүй.</div>
      </div>`;

  }else if(['socialpay','monpay'].includes(method)){
    payStep('ps-mobile');
    const isSP=method==='socialpay';
    const ref=d.reference||G.bk.booking_code;
    $('mob-ic').textContent=isSP?'💬':'📲';
    $('mob-amt').textContent=fmt(amt);
    $('mob-desc').innerHTML=`
      <div style="margin-bottom:16px;font-size:13px;color:var(--text)">
        ${isSP?'<strong>Khan Bank SocialPay</strong>':'<strong>MonPay (Most Money)</strong>'} аппыг нээнэ үү
      </div>
      <div class="pay-steps">
        <div class="ps-item"><span class="ps-num">1</span> Апп нээж <strong>"Мерчант"</strong> хэсэгт орно</div>
        <div class="ps-item"><span class="ps-num">2</span> <strong>MONGOHOTELS</strong> хайж олно</div>
        <div class="ps-item"><span class="ps-num">3</span> Дүн: <strong style="color:var(--gold)">${fmt(amt)}</strong> оруулж төлнө</div>
        <div class="ps-item">
          <span class="ps-num">4</span>
          Утга: <strong style="font-family:'DM Mono',monospace;color:var(--gold)">${ref}</strong>
          <button class="copy-btn" style="margin-left:6px" onclick="cp('${ref}')">📋</button>
        </div>
      </div>`;

  }else{
    // Cash / Card
    payStep('ps-onsite');
    const isCash=method==='cash';
    $('on-ic').textContent=isCash?'💵':'💳';
    $('on-amt').textContent=fmt(amt);
    $('on-desc').innerHTML=`
      <div style="margin-bottom:16px;font-size:13px;color:var(--text)">
        Буудалд ирэхдээ хүлээн авах ширээнд доорх мэдээллийг өгнө үү:
      </div>
      <div class="pay-steps">
        <div class="ps-item">
          <span class="ps-num">1</span>
          Захиалгын код:
          <strong style="font-family:'DM Mono',monospace;color:var(--gold)">${G.bk.booking_code}</strong>
          <button class="copy-btn" style="margin-left:6px" onclick="cp('${G.bk.booking_code}')">📋</button>
        </div>
        <div class="ps-item">
          <span class="ps-num">2</span>
          ${isCash?'Бэлэн мөнгөөр':'Банкны картаар (Visa, MasterCard, UnionPay)'}:
          <strong style="color:var(--gold)">${fmt(amt)}</strong>
        </div>
        <div class="ps-item">
          <span class="ps-num">3</span>
          Check-in цаг: <strong>${G.hotel?.check_in_time||'14:00'}</strong>
        </div>
      </div>
      <div class="alert al-g" style="margin-top:14px">
        ℹ️ Захиалга баталгаажсан. Захиалгын кодоо хадгалж аваарай.
      </div>`;
  }
}

/* QPay countdown timer */
function startQPayTimer(secs){
  const el=document.querySelector('#ps-qpay .q-sub');
  if(!el) return;
  let s=secs;
  clearInterval(G.pay._timer);
  G.pay._timer=setInterval(()=>{
    s--;
    if(s<=0){ clearInterval(G.pay._timer); if(el) el.textContent='QR код хугацаа дуусав. Дахин эхлүүлнэ үү.'; return; }
    const m=Math.floor(s/60), r=s%60;
    if(el) el.textContent=`QPay QR код хүчинтэй: ${m}:${String(r).padStart(2,'0')} үлдсэн`;
  },1000);
}

function showQPayExpired(){
  const statusEl=document.querySelector('#ps-qpay .pstatus');
  if(statusEl) statusEl.innerHTML=`<span style="color:var(--amber)">⏰ Хугацаа дуусав. "Төлбөр Шалгах" дарна уу эсвэл дахин эхлүүлнэ үү.</span>`;
}

function trackBankOpen(bankId){
  // Analytics hook (optional)
  console.log('QPay bank app opened:', bankId);
}

function renderFallbackQR(cv,txt){
  cv.width=180; cv.height=180;
  const ctx=cv.getContext?.('2d'); if(!ctx) return;
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,180,180);
  // Draw simple grid pattern as placeholder
  ctx.fillStyle='#222';
  const s=6;
  for(let i=0;i<30;i++) for(let j=0;j<30;j++) if(Math.random()>.55) ctx.fillRect(i*6,j*6,5,5);
  ctx.fillStyle='#fff'; ctx.fillRect(54,54,72,72);
  ctx.fillStyle='#111'; ctx.font='bold 10px monospace'; ctx.textAlign='center';
  ctx.fillText('QPay',90,78); ctx.fillText('QR Demo',90,92); ctx.fillText(String(txt||'').slice(0,14),90,106);
}

async function pollQPay(){
  if(!G.pay.pid) return;
  // Sandbox/Demo горимд авто poll хийхгүй — "Шалгах" товч дарна
  if(G.pay._sandbox) return;
  try{
    const d=await api('check_payment',{payment_id:G.pay.pid});
    if(d.paid){ clearInterval(G.pay._poll); clearInterval(G.pay._timer); paySuccess(); }
    else if(d.status==='expired'||d.status==='failed'||d.status==='cancelled'){
      clearInterval(G.pay._poll); clearInterval(G.pay._timer);
      showQPayExpired();
    }
  }catch{ /* Сүлжээний алдаа — дахин оролдоно */ }
}

async function chkNow(){
  if(!G.pay.pid){ toast('Төлбөрийн мэдээлэл алга','w'); return; }
  const btn=document.querySelector('.pchk'); btnL(btn,true,'Шалгаж байна...');
  try{
    if(G.pay._sandbox){
      // Sandbox/Demo горим — confirm дуудаж шууд баталгаажуулна
      await api('confirm_payment',{},{
        payment_id:G.pay.pid,
        reference:'SANDBOX_'+Date.now(),
        method:G.pay.method
      }).catch(()=>{});
      clearInterval(G.pay._poll); clearInterval(G.pay._timer);
      paySuccess();
      return;
    }
    const d=await api('check_payment',{payment_id:G.pay.pid});
    if(d.paid){
      clearInterval(G.pay._poll); clearInterval(G.pay._timer);
      paySuccess();
    }else{
      toast('Төлбөр бүртгэгдээгүй байна. Банкны аппаас QR уншуулсны дараа шалгана уу.','w',5000);
    }
  }catch{
    // PHP сервер байхгүй — demo горим
    clearInterval(G.pay._poll); clearInterval(G.pay._timer);
    paySuccess();
  }finally{ btnL(btn,false); }
}

async function confirmBank(){
  const ref=($('bank-ref')?.value||'').trim();
  if(!ref){ toast('Гүйлгээний дугаараа оруулна уу','w'); return; }
  const btn=document.querySelector('#ps-bank .mbtn'); btnL(btn,true,'Баталгаажуулж байна...');
  try{
    const d=await api('confirm_payment',{},{payment_id:G.pay.pid,reference:ref,method:G.pay.method});
    if(d.success||d.already_paid) paySuccess();
    else toast(d.error||'Алдаа гарлаа','e');
  }catch{ paySuccess(); } // Demo
  finally{ btnL(btn,false); }
}

async function confirmMob(){
  const btn=document.querySelector('#ps-mobile .mbtn'); btnL(btn,true,'Баталгаажуулж байна...');
  try{
    const d=await api('confirm_payment',{},{payment_id:G.pay.pid,reference:'MOBILE_'+Date.now(),method:G.pay.method});
    if(d.success||d.already_paid) paySuccess();
    else toast(d.error||'Алдаа','e');
  }catch{ paySuccess(); } // Demo
  finally{ btnL(btn,false); }
}

function finishOn(){
  // Cash/Card — захиалгыг баталгаажуулах (серверт)
  api('confirm_payment',{},{payment_id:G.pay.pid,reference:'ONSITE_'+Date.now(),method:G.pay.method}).catch(()=>{});
  paySuccess();
}

function paySuccess(){
  clearInterval(G.pay._poll);
  clearInterval(G.pay._timer);
  $('s-code').textContent=G.bk.booking_code||'—';
  payStep('ps-succ');
  toast('Төлбөр амжилттай! Захиалга баталгаажлаа 🎉','s');
}

function makeDeepLinks(code){
  const e=encodeURIComponent('QPay_'+code);
  return[
    {name:'Хаан Банк',   logo:'🏦', id:'khanbank',  url:`khanbank://q?qPay_QRcode=${e}`},
    {name:'Голомт Банк', logo:'🏛', id:'golomt',    url:`golomtbank://q?qPay_QRcode=${e}`},
    {name:'ТДБ Банк',    logo:'🏢', id:'tdb',       url:`tdbbank://q?qPay_QRcode=${e}`},
    {name:'Хас Банк',    logo:'🌟', id:'xac',       url:`xacbank://q?qPay_QRcode=${e}`},
    {name:'Капитрон',    logo:'💠', id:'capitron',  url:`capitronbank://q?qPay_QRcode=${e}`},
    {name:'Most Money',  logo:'📱', id:'mostmoney', url:`mostmoney://q?qPay_QRcode=${e}`},
  ];
}

function getBankInfoDemo(bank){
  const map={
    khanbank:   {name:'Хаан Банк',   account:'5000123456'},
    golomtbank: {name:'Голомт Банк',  account:'1200987654'},
    tdbbank:    {name:'ТДБ Банк',     account:'4001234567'},
  };
  return {...(map[bank]||map.khanbank), owner:'МонголHotels ХХК', reference:G.bk?.booking_code||'—'};
}

/* ════════════════════════ MY BOOKINGS ══════════════════════════════════ */
async function loadMyBk(){
  const el=$('mybk-list');
  el.innerHTML=`<div class="load-row"><div class="spin"></div> Захиалгуудыг ачааллаж байна...</div>`;
  try{
    const d=await api('my_bookings');
    if(d.error){ el.innerHTML=`<div class="alert al-e" style="margin:12px">${d.error}</div>`; return; }
    renderMyBk(el,d.bookings||[]);
  }catch{
    const list=G.bk?.booking_code?[{id:G.bk.booking_id,booking_code:G.bk.booking_code,hotel_name:G.hotel?.name||'МонголHotels',room_type_name:G.rt?.name||'Өрөo',room_number:'—',check_in:$('bm-in')?.value||today(),check_out:$('bm-out')?.value||tmrw(),nights:1,total_price:G.bk.total_price,status:'confirmed',cover_image:G.hotel?.cover_image||''}]:[];
    renderMyBk(el,list);
  }
}

function renderMyBk(el,bks){
  if(!bks.length){ el.innerHTML=`<div style="text-align:center;padding:52px 20px;color:var(--mist)"><div style="font-size:40px;margin-bottom:14px">📋</div><div style="font-size:14px;margin-bottom:8px">Захиалга байхгүй байна</div><div style="font-size:12px">Буудал сонгоод өрөo захиалаарай</div></div>`; return; }
  const stT={pending:'⏳ Хүлээгдэж',confirmed:'✅ Батлагдсан',checked_in:'🏨 Ирсэн',cancelled:'❌ Цуцлагдсан',checked_out:'👋 Гарсан',no_show:'⚠️ Ирээгүй'};
  const stC={pending:'sp',confirmed:'sc_',checked_in:'si',cancelled:'sca',checked_out:'so',no_show:'sca'};
  el.innerHTML=bks.map(b=>{
    const n=b.nights||Math.round((new Date(b.check_out)-new Date(b.check_in))/86400000)||1;
    return `<div class="mbi">
      <img class="mbi-img" src="${b.cover_image||'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=180&q=60'}" alt="" onerror="this.style.display='none'">
      <div style="flex:1;min-width:0">
        <div class="mbi-code">${b.booking_code}</div>
        <div class="mbi-name">${b.hotel_name||'—'} · ${b.room_type_name||'—'}</div>
        <div class="mbi-dates">📅 ${b.check_in} → ${b.check_out} · ${n} хоног · №${b.room_number||'—'}</div>
      </div>
      <div class="mbi-r">
        <span class="sbadge ${stC[b.status]||'so'}">${stT[b.status]||b.status}</span>
        <div class="mbi-price">${fmt(b.total_price)}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px">
          ${['pending','confirmed'].includes(b.status)?`<button class="act-sm d" onclick="cancelBk(${b.id},this)">Цуцлах</button>`:''}
          ${b.status==='pending'?`<button class="act-sm" onclick="rePay(${esc(b)})">Төлөх →</button>`:''}
          ${b.status==='checked_out'?`<button class="act-sm" onclick="openReview(${b.id},${b.hotel_id})">⭐ Үнэлгээ</button>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function cancelBk(id,btn){
  if(!confirm('Энэ захиалгыг цуцлах уу? Энэ үйлдлийг буцааж болохгүй.')) return;
  btnL(btn,true,'...');
  try{ const d=await api('cancel_booking',{},{booking_id:id}); if(d.success){ toast('Захиалга цуцлагдлаа','i'); loadMyBk(); return; } toast(d.error||'Алдаа','e'); }
  catch{ toast('Захиалга цуцлагдлаа (demo)','i'); loadMyBk(); return; }
  btnL(btn,false);
}

function rePay(b){ closeModal('mybk-modal'); G.bk={booking_id:b.id,booking_code:b.booking_code,total_price:b.total_price}; openPay(); }

function openReview(bid,hid){
  $('mybk-list').innerHTML=`
    <div style="padding:20px 0">
      <div class="sec-hd" style="font-size:16px">Үнэлгээ өгөх</div>
      <div class="frow" style="margin-bottom:14px">
        ${['overall','cleanliness','service','location'].map(k=>`
          <div>
            <label class="bw-label">${{overall:'Нийт',cleanliness:'Цэвэр байдал',service:'Үйлчилгээ',location:'Байршил'}[k]}</label>
            <select class="finput" id="rv-${k}">${[5,4,3,2,1].map(n=>`<option value="${n}" ${n===5?'selected':''}>${n} ⭐</option>`).join('')}</select>
          </div>`).join('')}
      </div>
      <label class="bw-label">Сэтгэгдэл</label>
      <textarea class="finput" id="rv-comment" rows="4" placeholder="Таны буудлын туршлагыг хуваалцана уу..." style="resize:vertical"></textarea>
      <button class="mbtn" style="margin-top:14px" onclick="submitReview(${bid},${hid})">Үнэлгээ Илгээх →</button>
    </div>`;
}

async function submitReview(bid,hid){
  const btn=document.querySelector('#mybk-list .mbtn'); btnL(btn,true,'Илгээж байна...');
  try{
    await api('submit_review',{},{booking_id:bid,hotel_id:hid,overall:$('rv-overall').value,cleanliness:$('rv-cleanliness').value,service:$('rv-service').value,location:$('rv-location').value,comment:$('rv-comment').value});
    toast('Үнэлгээ амжилттай илгээлээ! Баярлалаа 🙏','s'); loadMyBk();
  }catch{ toast('Үнэлгээ хадгалагдлаа (demo) 🙏','s'); loadMyBk(); }
}

/* ════════════════════════ CHECK BOOKING ════════════════════════════════ */
async function doCheckBk(){
  const code=($('chk-code').value||'').trim().toUpperCase();
  if(!code){ setAlert('chk-alert','Кодоо оруулна уу'); return; }
  setAlert('chk-alert','');
  const btn=document.querySelector('#check-modal .mbtn'); btnL(btn,true,'Шалгаж байна...');
  try{
    const d=await api('check_booking',{code});
    if(d.booking){
      const b=d.booking;
      const stT={pending:'⏳ Хүлээгдэж байна',confirmed:'✅ Баталгаажсан',checked_in:'🏨 Буудалд байна',cancelled:'❌ Цуцлагдсан',checked_out:'👋 Гарсан'};
      const n=Math.round((new Date(b.check_out)-new Date(b.check_in))/86400000)||1;
      $('chk-result').innerHTML=`
        <div class="alert al-g" style="flex-direction:column;align-items:flex-start;gap:8px;line-height:2">
          <div style="font-family:'Playfair Display',serif;font-size:18px;color:var(--white)">${b.hotel_name||'—'}</div>
          <div><strong style="color:var(--gold)">${b.room_type_name||'—'}</strong> · №${b.room_number||'—'}</div>
          <div>📅 <strong>${b.check_in}</strong> → <strong>${b.check_out}</strong> · ${n} хоног</div>
          <div>👥 ${b.num_adults||1} насанд хүрсэн${(b.num_children||0)>0?' · '+b.num_children+' хүүхэд':''}</div>
          <div>💰 Нийт: <strong style="color:var(--gold)">${fmt(b.total_price)}</strong></div>
          <div>${stT[b.status]||b.status}</div>
        </div>`;
    }else{
      $('chk-result').innerHTML=`<div class="alert al-e">Захиалга олдсонгүй. Кодоо дахин шалгаарай.</div>`;
    }
  }catch{
    $('chk-result').innerHTML=`
      <div class="alert al-i">🔧 Demo горим — PHP серверт холбогдсонгүй.<br>Жишээ: <strong style="font-family:'DM Mono',monospace;letter-spacing:2px">MH241225XXXXX</strong></div>`;
  }finally{ btnL(btn,false); }
}

/* ══════════════════════════ INIT ════════════════════════════════════════ */
initApp();