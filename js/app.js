const API_BASE = "/hotel-v2/php/api.php";
'use strict';

const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const fmt    = n  => Number(n||0).toLocaleString('mn-MN')+'₮';
const nts    = (a,b)=>Math.max(1,Math.round((new Date(b)-new Date(a))/86400000));
const d_ymd  = d  => d instanceof Date ? d.toISOString().slice(0,10) : String(d||'');
const today  = () => d_ymd(new Date());
const tmrw   = () => d_ymd(new Date(Date.now()+86400000));
const bed_mn = t  => ({single:'Single',double:'Double',twin:'Twin',queen:'Queen',king:'King',triple:'Triple',suite:'Сюит'}[t]||t||'—');
const esc    = o  => JSON.stringify(o).replace(/'/g,"&#39;");
const uid    = () => Math.random().toString(36).slice(2,9).toUpperCase();

const G = {
    room: null,         // selected room for booking
  user:   null,         // logged-in guest
  hotels: [],
  hotel:  null,         // currently open detail
  rt:     null,         // selected room type for booking
  bk:     null,         // { booking_id, booking_code, total_price }
  promo:  0,            // discount amount
  pay: { method:null, pid:null, _poll:null },
  otp: { email:'', timers:{} },
  _after: null,         // { fn, args } — resume after login
};

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

window.addEventListener('scroll',()=>{
  const p = scrollY/(document.body.scrollHeight-innerHeight)*100;
  const sp=$('scroll-progress');if(sp)sp.style.width=p+'%';
  $('nav')?.classList.toggle('scrolled',scrollY>60);
  $$('.hero-slide.on').forEach(s=>{ s.style.transform=`translateY(${scrollY*.18}px)`; });
},{passive:true});

const revObs = new IntersectionObserver(
  es=>es.forEach(e=>e.isIntersecting&&e.target.classList.add('vis')),{threshold:.07}
);
$$('.reveal').forEach(el=>revObs.observe(el));

const hpts=$('hpts');
if(hpts) setInterval(()=>{
  const p=document.createElement('div');p.className='pt';
  const s=Math.random()*3+1;
  p.style.cssText=`width:${s}px;height:${s}px;left:${Math.random()*100}%;bottom:0;animation-duration:${Math.random()*9+6}s;animation-delay:${Math.random()*2}s`;
  hpts.appendChild(p);setTimeout(()=>p.remove(),14000);
},1000);

let _si=0;
function goSlide(n){
  $$('.hero-slide').forEach((s,i)=>s.classList.toggle('on',i===n));
  $$('.sdot').forEach((d,i)=>d.classList.toggle('on',i===n));
  _si=n;
}
setInterval(()=>goSlide((_si+1)%4),5500);

(()=>{
  const t=today(),t2=tmrw();
  [$('s-in'),$('bm-in')].forEach(e=>e&&(e.min=t,!e.value&&(e.value=t)));
  [$('s-out'),$('bm-out')].forEach(e=>e&&(e.min=t2,!e.value&&(e.value=t2)));
})();

function toast(msg,type='i',ms=4500){
  const icons={s:'✓',e:'✕',i:'◆',w:'⚠'};
  const el=document.createElement('div');
  el.className=`toast t${type}`;
  el.innerHTML=`<span style="flex-shrink:0">${icons[type]||'•'}</span><span>${msg}</span>`;
  const st=$('toasts');st.appendChild(el);
  while(st.children.length>6)st.removeChild(st.firstChild);
  setTimeout(()=>{
    el.style.cssText='opacity:0;transform:translateX(16px);transition:.3s';
    setTimeout(()=>el.remove(),310);
  },ms);
}

function setAlert(id,html,type='e'){
  const el=$(id);if(!el)return;
  const cls={e:'al-e',s:'al-s',i:'al-i',g:'al-g'}[type]||'al-i';
  el.innerHTML=html?`<div class="alert ${cls}">${html}</div>`:'';
}

function btnL(btn,on,lbl=''){
  if(!btn)return;
  if(on){
    btn._t=btn.innerHTML;btn.disabled=true;
    btn.innerHTML=`<span style="display:inline-flex;align-items:center;justify-content:center;gap:8px"><span class="spin" style="width:14px;height:14px;border-width:2px"></span>${lbl||'Уншиж байна...'}</span>`;
  } else {
    btn.disabled=false;btn.innerHTML=btn._t||lbl;
  }
}

function cp(txt){
  navigator.clipboard?.writeText(txt).then(()=>toast('Хуулагдлаа ✓','s',2000))
    .catch(()=>{
      const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Хуулагдлаа ✓','s',2000);
    });
}

const _open = new Set();

function openModal(id){
  const el=$(id);if(!el)return;
  el.classList.add('open');_open.add(id);
  document.body.style.overflow='hidden';
}
function closeModal(id){
  const el=$(id);if(!el)return;
  el.classList.remove('open');_open.delete(id);
  if(!_open.size&&!$('det-ov')?.classList.contains('on'))
    document.body.style.overflow='';
}
function switchModal(a,b){closeModal(a);openModal(b);}
function sStep(show,hide){
  const a=$(show),b=$(hide);
  if(b)b.style.display='none';
  if(a){a.style.display='block';a.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:240,easing:'ease',fill:'both'});}
}

$$('.mlayer').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id);}));

document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(_open.size){closeModal([..._open].at(-1));return;}
  closeDetail();
});

function closeDetail(){
  const ov=$('det-ov');if(!ov)return;
  ov.classList.remove('on');
  if(!_open.size)document.body.style.overflow='';
}

async function api(action, qs = {}, body = null){

let url = API_BASE + '?action=' + encodeURIComponent(action)

for(const k in qs){
if(qs[k] !== null && qs[k] !== undefined){
url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(qs[k])
}
}

const options = {
method: body ? 'POST' : 'GET',
credentials: 'same-origin'
}

if(body){
options.headers = {
'Content-Type': 'application/json'
}
options.body = JSON.stringify(body)
}

const res = await fetch(url, options)

let data = {}

try{
data = await res.json()
}catch{
data = {}
}

if(!res.ok){
const err = new Error(data.error || 'API Error')
err.api = data
throw err
}

return data
}

async function initApp(){
  try{
    const d=await api('get_session');
    if(d.logged_in&&d.guest)applyUser(d.guest);
  }catch{}
  loadHotels();
}

function applyUser(u){
  G.user=u;
  const fn=(u.first_name||u.name||'?').split(' ')[0];
  $('nav-login').style.display='none';
  $('nav-reg').style.display='none';
  const nu=$('nav-user');nu.style.display='flex';
  $('nav-av').textContent=fn[0]?.toUpperCase()||'U';
  $('nav-nm').textContent=fn;
  nu.querySelectorAll('*').forEach(window._hl);
}
function clearUser(){
  G.user=null;
  $('nav-login').style.display='';
  $('nav-reg').style.display='';
  $('nav-user').style.display='none';
}
async function doLogout(){
  try{await api('logout');}catch{}
  clearUser();toast('Амжилттай гарлаа','i');
}
function afterLogin(){
  if(G._after){const{fn,args}=G._after;G._after=null;setTimeout(()=>fn(...args),350);}
}

function oNext(el,nid){
  el.value=el.value.replace(/\D/g,'');
  if(el.value)$(nid)?.focus();
}
function getOTP(p){return[0,1,2,3,4,5].map(i=>$(p+i)?.value||'').join('');}
function clearOTP(p){[0,1,2,3,4,5].forEach(i=>{const e=$(p+i);if(e)e.value='';});}
function fillOTP(p,code){
  String(code).padStart(6,'0').split('').forEach((c,i)=>{const e=$(p+i);if(e)e.value=c;});
}
function startTimer(cdId,rsId,mins=10){
  clearInterval(G.otp.timers[cdId]);
  let s=mins*60;
  const cd=$(cdId),rs=$(rsId);
  if(rs)rs.style.display='none';
  G.otp.timers[cdId]=setInterval(()=>{
    s--;
    if(cd)cd.textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
    if(s<=0){clearInterval(G.otp.timers[cdId]);if(rs)rs.style.display='inline';}
  },1000);
}

async function sendLoginOtp(resend=false){
  const email=($('l-email').value||'').trim();
  const pass =$('l-pass').value||'';
  const btn  =document.querySelector('#ls1 .mbtn');
  setAlert('l-alert','');

  if(!email||!email.includes('@'))
    {setAlert('l-alert','📧 Gmail хаягаа зөв оруулна уу');return;}

  if(pass&&!resend){
    btnL(btn,true,'Нэвтэрч байна...');
    try{
      const d=await api('login',{},{email,password:pass});
      if(d.success){
        applyUser({first_name:d.name?.split(' ')[0]||'?',email,is_vip:d.is_vip,loyalty_points:d.loyalty_points});
        closeModal('login-modal');
        toast(`Тавтай морилно уу, ${d.name}! 👋`,'s');
        afterLogin();return;
      }
      setAlert('l-alert',d.error||'Нэвтрэлт амжилтгүй болов');
    }catch(e){setAlert('l-alert',e.api?.error||'⚠️ Серверт холбогдсонгүй');}
    finally{btnL(btn,false);}
    return;
  }

  btnL(btn,true,'Код илгээж байна...');
  try{
    const d=await api('send_otp',{},{email,type:'login'});
    G.otp.email=email;
    $('l-otp-email').textContent=`📧 ${email}`;
    sStep('ls2','ls1');
    startTimer('l-cd','l-resend');
    clearOTP('l');setTimeout(()=>$('l0')?.focus(),130);
    if(d.dev_otp){
      setAlert('l-otp-alert',
        `🔧 <strong>Dev горим</strong> — SMTP тохируулаагүй<br>`+
        `<span style="font-family:'DM Mono',monospace;font-size:30px;letter-spacing:10px;color:var(--gold);display:block;margin-top:8px">${d.dev_otp}</span>`,'i');
      fillOTP('l',d.dev_otp);
    }else{toast(`${email} хаягт OTP код илгээлээ`,'s');}
  }catch(e){setAlert('l-alert',e.api?.error||'⚠️ Серверт холбогдсонгүй. PHP сервер ажиллуулна уу.');}
  finally{btnL(btn,false);}
}

async function verifyLoginOtp(){

const code = getOTP('l')

if(code.length !== 6){
setAlert('l-otp-alert','6 оронтой кодыг бүрэн оруулна уу')
return
}

setAlert('l-otp-alert','')

const btn = document.querySelector('#ls2 .mbtn')
btnL(btn,true,'Баталгаажуулж байна...')

try{

const d = await api('login',{},{
email: G.otp.email,
code: code,
type: 'login'
})

if(d.success){

applyUser({
first_name:d.name?.split(' ')[0]||'?',
email:G.otp.email,
is_vip:d.is_vip,
loyalty_points:d.loyalty_points
})

closeModal('login-modal')
toast(`Тавтай морилно уу, ${d.name}! 👋`,'s')
afterLogin()

}else{
setAlert('l-otp-alert',d.error||'Код буруу байна')
}

}catch(e){
setAlert('l-otp-alert',e.api?.error||'⚠️ Серверт холбогдсонгүй')
}

finally{
btnL(btn,false)
}

}

async function sendRegOtp(resend=false){
  const first=($('r-first').value||'').trim();
  const last =($('r-last').value||'').trim();
  const email=($('r-email').value||'').trim();
  const btn  =document.querySelector('#rs1 .mbtn');
  setAlert('r-alert','');

  if(!first||!last){setAlert('r-alert','👤 Нэр, Овгоо оруулна уу');return;}
  if(!email||!email.includes('@')){setAlert('r-alert','📧 Gmail хаягаа зөв оруулна уу');return;}

  btnL(btn,true,'Код илгээж байна...');
  try{
    const d=await api('send_otp',{},{email,type:'register',name:first});
    G.otp.email=email;
    $('r-otp-email').textContent=`📧 ${email}`;
    sStep('rs2','rs1');
    startTimer('r-cd','r-resend');
    clearOTP('r');setTimeout(()=>$('r0')?.focus(),130);
    if(d.dev_otp){
      setAlert('r-otp-alert',
        `🔧 <strong>Dev горим</strong> — SMTP тохируулаагүй<br>`+
        `<span style="font-family:'DM Mono',monospace;font-size:30px;letter-spacing:10px;color:var(--gold);display:block;margin-top:8px">${d.dev_otp}</span>`,'i');
      fillOTP('r',d.dev_otp);
    }else{toast(`${email} хаягт OTP код илгээлээ`,'s');}
  }catch(e){setAlert('r-alert',e.api?.error||'⚠️ Серверт холбогдсонгүй');}
  finally{btnL(btn,false);}
}

async function verifyRegOtp(){

  const code = getOTP('r')

  console.log("OTP code:", code)
  console.log("Email:", G.otp.email)

  if(code.length !== 6){
    setAlert('r-otp-alert','6 оронтой кодоо бүрэн оруулна уу')
    return
  }

  setAlert('r-otp-alert','')

  const btn = document.querySelector('#rs2 .mbtn')

  btnL(btn,true,'Баталгаажуулж байна...')

  try{

    const d = await api('verify_otp',{},{
      email:G.otp.email,
      code:code,
      type:'register'
    })

    console.log("API response:", d)

    if(!d.success){
      setAlert('r-otp-alert', d.error || 'Код буруу байна')
      return
    }

    registerUser()

  }catch(e){

    console.error("OTP verify error:", e)

    setAlert('r-otp-alert', e.api?.error || '⚠️ Серверт холбогдсонгүй')

  }
  finally{

    btnL(btn,false)

  }

}
async function registerUser(){

const first=$('r-first').value
const last=$('r-last').value
const email=$('r-email').value
const phone=$('r-phone').value
const pass=$('r-pass').value

try{

const d = await api('register',{},{
first_name:first,
last_name:last,
email:email,
phone:phone,
password:pass
})

if(d.success){

applyUser({
first_name:first,
email:email
})

closeModal('reg-modal')

toast('Бүртгэл амжилттай! 🎉','s')

}else{

setAlert('r-otp-alert',d.error)

}

}catch(e){

setAlert('r-otp-alert',e.api?.error||'⚠️ Серверт холбогдсонгүй')

}

}

const D = {
  hotels:[
    {id:1,name:'Шангрила Улаанбаатар',stars:5,rating:4.85,total_reviews:2847,is_featured:true,city:'Улаанбаатар',address:'Сүхбаатарын талбай 3',phone:'+976 7700-8888',email:'ulaanbaatar@shangri-la.com',check_in_time:'15:00',check_out_time:'12:00',
      cover_image:'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80',
      tagline:'Монголын нийслэлийн хамгийн тансаг туршлага',
      description:'Улаанбаатарын төвд байрлах Шангрила буудал нь дэлхийн зэрэглэлийн үйлчилгээ, монгол соёлын уламжлалыг хослуулсан 5 одтой зочид буудал юм. 2008 онд нээгдсэн энэхүү буудал нь 290 гаруй өрөo, апартментаас бүрдэх бөгөөд тус бүр нь Улаанбаатарын үзэсгэлэнт харагдацтай. Тансаглалын Chi Spa, олон улсын ресторан, хаалттай бассейн, фитнесс центр бүгд нэг дор.',
      gallery:['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80','https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&q=80','https://images.unsplash.com/photo-1609766418204-94aae0ecfefd?w=800&q=80'],
      amenities:['🍽 Тансаг ресторан','💆 Chi Spa','🏊 Хаалттай бассейн','💪 Фитнесс центр','🏛 Хурлын танхим','🚘 Valet parking','☕ Кофе шоп','🎰 Казино','🌐 Олон хэлний үйлчилгээ'],
      pros:['✓ Сүхбаатарын талбайн хажуу — хамгийн стратегийн байршил','✓ Олон улсын 5★ жишгийн үйлчилгээ','✓ Chi Spa тансаг эмчилгээ','✓ Хурлын танхим ажил хэрэгч аялалд','✓ Хаалттай бассейн, фитнесс — оройн зугаацлал'],
      cons:['— Үнэ харьцангуй өндөр','— Хотын дунд учир гудамжны чимээ зарим өрөонд','— Зогсоол хязгаарлагдмал'],
      min_price:385000,available_rooms:4,slug:'shangri-la'},
    {id:2,name:'Блю Скай Зочид Буудал',stars:4,rating:4.62,total_reviews:1523,is_featured:false,city:'Улаанбаатар',address:'Олимпийн гудамж 5',phone:'+976 7011-8888',email:'info@bluesky.mn',check_in_time:'14:00',check_out_time:'12:00',
      cover_image:'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200&q=80',
      tagline:'Хотын хамгийн өндөр, 360° панорамик харагдацтай',
      description:'Блю Скай буудал нь Улаанбаатарын хамгийн өндөр барилгуудын нэгд байрлах бөгөөд цонхноосоо Богдхан уулын оргил хүртэл харагдана. 4 одтой зочид буудал нь орчин үеийн дизайн болон монгол уламжлалт мотивийг тэнцвэртэйгээр хослуулсан. Дээд давхарт байрлах Sky Bar нь хотын хамгийн романтик уулзалтын цэгүүдийн нэг.',
      gallery:['https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80','https://images.unsplash.com/photo-1560347876-aeef00ee58a1?w=800&q=80','https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80'],
      amenities:['🔭 360° Панорама','🍷 Sky Bar','💆 Спа','📶 Гигабит WiFi','🅿 Зогсоол','🍳 Өглөөний цай','🏋 Фитнесс'],
      pros:['✓ 360° панорама — уул, хот хоёулаа харагдана','✓ Хотын төвд, ойролцоо олон газар','✓ Үнэ-чанарын харьцаа сайн','✓ Sky Bar романтик уулзалтад','✓ Орчин үеийн цэвэр дизайн'],
      cons:['— Бассейн байхгүй','— Спа хязгаарлагдмал','— Зочдын тоо их үед лифт удаан'],
      min_price:180000,available_rooms:7,slug:'blue-sky'},
    {id:3,name:'Кемпинский Улаанбаатар',stars:5,rating:4.91,total_reviews:3102,is_featured:true,city:'Улаанбаатар',address:'Чингис Хааны өргөн чөлөө 13',phone:'+976 7703-7777',email:'reservations.ulaanbaatar@kempinski.com',check_in_time:'15:00',check_out_time:'12:00',
      cover_image:'https://images.unsplash.com/photo-1551882547-ff40c63fe2e2?w=1200&q=80',
      tagline:'Чингис хааны уламжлал, Европын тансаглал хоёр нийлсэн',
      description:'Кемпинский Улаанбаатар нь Германы тансаг зэрэглэлийн Kempinski брэндийн Монгол дахь цорын ганц буудал юм. Монгол өв соёл болон Европын тансаглалыг уран нарийнаар хослуулсан энэхүү 5 одтой буудал нь 2014 онд нээгдсэн. Монголын хамгийн өндөр үнэлгээтэй (4.91/5) зочид буудал хэвээр байна.',
      gallery:['https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&q=80','https://images.unsplash.com/photo-1609766418204-94aae0ecfefd?w=800&q=80','https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80'],
      amenities:['👑 Хааны спа','🥘 Fine dining','🛎 Butler үйлчилгээ','🛁 Jacuzzi','✈️ Нисэх буудал шилжүүлэг','🎁 Concierge 24/7','🏊 Усан бассейн','💒 Хурим зохион байгуулалт'],
      pros:['✓ Монголын хамгийн өндөр үнэлгээтэй (4.91/5)','✓ Kempinski брэндийн дэлхийн жишгийн үйлчилгээ','✓ Butler үйлчилгээ — хувийн туслах','✓ Монгол соёлын өвөрмөц дизайн интерьер','✓ Нисэх буудалтай шилжүүлэг'],
      cons:['— Улаанбаатарын хамгийн үнэтэй буудал','— Захиалга урьдчилгааг шаардана','— Зарим үйлчилгээ нэмэлт төлбөртэй'],
      min_price:650000,available_rooms:3,slug:'kempinski'},
    {id:4,name:'Өргөө Бутик Буудал',stars:4,rating:4.45,total_reviews:876,is_featured:false,city:'Улаанбаатар',address:'Бага тойруу 15',phone:'+976 9911-5566',email:'info@urgoo-boutique.mn',check_in_time:'14:00',check_out_time:'11:00',
      cover_image:'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200&q=80',
      tagline:'Монгол ёс заншил, орчин үеийн тав тухтай хосолсон',
      description:'Өргөө Бутик Буудал нь жижиг боловч дотно, монгол өв соёлоо сайн хадгалсан 4 одтой зочид буудал юм. Гэрийн дулаан орчин, эелдэг ажилтнууд, монгол хоол унд — аялагчдын дунд маш их алдартай. Аялал зохион байгуулалт, соёлын хөтөлбөр.',
      gallery:['https://images.unsplash.com/photo-1560347876-aeef00ee58a1?w=800&q=80','https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80','https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80'],
      amenities:['🏺 Монгол уламжлалт засал','🌿 Дотуур цэцэрлэг','🛀 Уламжлалт спа','🎭 Соёлын хөтөлбөр','🍲 Монгол хоол','📷 Аялал зохион байгуулалт','🎨 Гар урлалын мастер класс'],
      pros:['✓ Монгол өв соёлыг бодитоор мэдрэх боломж','✓ Тухтай дотно орчин','✓ Монгол уламжлалт хоол','✓ Аялал зохион байгуулалт','✓ Хотын чимээнээс тайван'],
      cons:['— Бассейн, фитнесс байхгүй','— WiFi зарим газар сул','— Хязгаарлагдмал өрөo тоо'],
      min_price:120000,available_rooms:5,slug:'urgoo'},
  ],
  rooms:{
    1:[
      {id:1,hotel_id:1,name:'Делюкс Өрөo',bed_type:'king',size_sqm:42,max_guests:2,base_price:385000,available_count:4,
       description:'Улаанбаатар хотын цагаан гэрэлт байдал болон Богдхан уулын гайхамшигт харагдацтай, King size орон, мрамар угаалгын өрөотэй тансаглалын өрөo.',
       amenities:['King size ор','Хот харагдац','Мрамар угаалга','Тусдаа душ+ванн','Үнэгүй WiFi','Мини бар','55" Smart TV','Аюулгүйн хайрцаг'],
       pros:['✓ 42м² өргөн зай','✓ Мрамар угаалгын өрөo','✓ King орон','✓ Хотын гайхалтай харагдац'],
       cons:['— 3+ зочинд хязгаарлагдмал','— Доод давхарт чимээ'],
       images:['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80']},
      {id:2,hotel_id:1,name:'Клуб Делюкс',bed_type:'king',size_sqm:52,max_guests:2,base_price:520000,available_count:2,
       description:'Клубийн давхарт байрлах, Horizon Club lounge нэвтрэлт, өглөөний цай болон оройн коктейл оруулсан тансаг өрөo.',
       amenities:['King ор','Horizon Club','Өглөөний цай','Оройн коктейл','Butler','Спа 20%','Тусгаарлагдсан check-in'],
       pros:['✓ Club Lounge хоол, унд','✓ Butler','✓ 52м²','✓ Спа 20%'],
       cons:['— Club Lounge заримдаа дүүрэн','— Нэмэлт үнэ'],
       images:['https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=600&q=80']},
      {id:3,hotel_id:1,name:'Тэргүүн Сюит',bed_type:'king',size_sqm:85,max_guests:3,base_price:720000,available_count:2,
       description:'Тусдаа амралтын өрөo, хоолны зааль, ванн болон душ тусдаа бүхий тансаг сюит.',
       amenities:['King ор','Тусдаа амралтын өрөo','Хоолны зааль','Ванн+Душ','Butler','Клуб lounge','Угтах бэлэг'],
       pros:['✓ 85м²','✓ Butler','✓ VIP lounge','✓ Хамгийн сайн харагдац'],
       cons:['— Харьцангуй үнэтэй','— Хурдан дайчлагддаг'],
       images:['https://images.unsplash.com/photo-1609766418204-94aae0ecfefd?w=600&q=80']},
      {id:4,hotel_id:1,name:'Президент Сюит',bed_type:'king',size_sqm:140,max_guests:4,base_price:1450000,available_count:1,
       description:'Хоёр давхарт байршилтай, хувийн тогооч үйлчилгээтэй тансаг сюит.',
       amenities:['2 унтлагын өрөo','Хувийн тогооч','Concierge 24/7','Jacuzzi','Хувийн хурлын өрөo'],
       pros:['✓ 140м²','✓ Хувийн тогооч','✓ Jacuzzi','✓ VIP бүгд'],
       cons:['— 1,450,000₮+/хоног','— Маш хурдан дайчлагддаг'],
       images:['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&q=80']},
    ],
    2:[
      {id:5,hotel_id:2,name:'Стандарт Өрөo',bed_type:'double',size_sqm:28,max_guests:2,base_price:180000,available_count:5,
       description:'Тохилог стандарт өрөo, хотын харагдацтай. Богино хугацааны аялагч, ажил хэрэгч зочдод тохиромжтой.',
       amenities:['Double ор','Хот харагдац','WiFi','Smart TV','Мини бар','Цайны иж','Ажлын ширээ'],
       pros:['✓ Хямд үнэ','✓ Хотын дунд','✓ Ажлын ширээ','✓ Цэвэр орчин'],
       cons:['— 28м² жижиг','— Ванн байхгүй','— Шал хүйтэн'],
       images:['https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=600&q=80']},
      {id:6,hotel_id:2,name:'Панорама Делюкс',bed_type:'queen',size_sqm:38,max_guests:2,base_price:280000,available_count:3,
       description:'360° панорама харагдацтай Queen size орон бүхий делюкс өрөo.',
       amenities:['Queen ор','360° харагдац','Биде','Smart TV','Bluetooth чанга яригч','Хоолны ширээ'],
       pros:['✓ 360° панорама','✓ 38м²','✓ Биде','✓ Bluetooth чанга яригч'],
       cons:['— 100,000₮ нэмэлт','— Өвөлд хүйтэн сэтгэгдэл'],
       images:['https://images.unsplash.com/photo-1560347876-aeef00ee58a1?w=600&q=80']},
      {id:7,hotel_id:2,name:'Бизнес Сюит',bed_type:'king',size_sqm:55,max_guests:3,base_price:420000,available_count:2,
       description:'Ажил хэрэгчид зориулагдсан тусдаа хурлын булан, хурдан интернет, принтер / scanner иж бүрдэлтэй тансаг сюит.',
       amenities:['King ор','Тусдаа ажлын өрөo','Принтер/Скан','WiFi 1Gbps','Smart TV 65"','Кофе машин','Клуб lounge'],
       pros:['✓ Ажил хэрэгч аялалд','✓ Принтер/Скан','✓ Хурдан интернет','✓ Клуб lounge'],
       cons:['— Бизнес аялалд зориулагдсан','— 3+ хүнд хатуу'],
       images:['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80']},
    ],
    3:[
      {id:8,hotel_id:3,name:'Клуб Өрөo',bed_type:'king',size_sqm:52,max_guests:2,base_price:650000,available_count:3,
       description:'Клубийн давхарт байрлах, тусдаа клуб lounge нэвтрэлт, өглөөний цай болон оройн коктейл оруулсан тансаг өрөo.',
       amenities:['King ор','Клуб lounge','Өглөөний цай','Оройн коктейл','Спа 20%','Butler','Jacuzzi'],
       pros:['✓ Club Lounge','✓ Butler','✓ 52м²','✓ Спа 20%'],
       cons:['— Club Lounge дүүрдэг','— Үнэ өндөр'],
       images:['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80']},
      {id:9,hotel_id:3,name:'Хааны Сюит',bed_type:'king',size_sqm:110,max_guests:4,base_price:1200000,available_count:1,
       description:'Монгол хааны уламжлалаас санаа авсан, гар урлалын ханын чимэглэл бүхий тансаг сюит.',
       amenities:['2 унтлагын өрөo','Хувийн спа','Ванн+Душ','Клуб lounge VIP','Гар урлалын дизайн','Хувийн тогооч','Jacuzzi'],
       pros:['✓ 110м²','✓ Монгол дизайн','✓ Хувийн спа','✓ 4 хүн'],
       cons:['— Маш үнэтэй','— 48ц урьдчилгаа цуцлалт шаардлагатай'],
       images:['https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=600&q=80']},
    ],
    4:[
      {id:10,hotel_id:4,name:'Монгол Гэр Тасалгаа',bed_type:'double',size_sqm:32,max_guests:2,base_price:120000,available_count:4,
       description:'Монгол гэрийн уламжлалт хэв маяг, орчин үеийн тав тухтай хослуулсан өвөрмөц өрөo.',
       amenities:['Double ор','Уламжлалт монгол засал','WiFi','Монгол бол','Уул харагдац','Соёлын хөтөлбөр'],
       pros:['✓ Хаана ч олдохгүй монгол орчин','✓ Байгальд ойр','✓ Соёлын хөтөлбөр','✓ 120,000₮/хоног'],
       cons:['— Хуучирсан сэтгэгдэл','— WiFi гацаатай','— Бассейн, спа байхгүй'],
       images:['https://images.unsplash.com/photo-1560347876-aeef00ee58a1?w=600&q=80']},
      {id:11,hotel_id:4,name:'Уламжлалт Люкс',bed_type:'queen',size_sqm:45,max_guests:3,base_price:200000,available_count:2,
       description:'Монгол гар урлалын чимэглэл, ажлын булан, тусдаа амралтын сандал, уулын харагдацтай тансаг өрөo.',
       amenities:['Queen ор','Тусдаа амралтын булан','Гар урлалын чимэглэл','Уул харагдац','WiFi','Smart TV','Аяллын иж бүрдэл'],
       pros:['✓ 45м²','✓ Гар урлалын чимэглэл','✓ Гэр бүлд тохиромжтой','✓ Аяллын зөвлөгөө'],
       cons:['— Бассейн байхгүй','— WiFi зарим газар сул'],
       images:['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&q=80']},
    ],
  },
  svcs:[
    {id:1,name:'🍳 Өглөөний цай (2 хүн)',price:25000,category:'food'},
    {id:2,name:'🚌 Нисэх буудал шилжүүлэг',price:80000,category:'transport'},
    {id:3,name:'💐 Мэндчилгээний цэцэг баг',price:35000,category:'extra'},
    {id:4,name:'🧖 Спа эмчилгээ (60 мин)',price:120000,category:'wellness'},
    {id:5,name:'🍾 Тансаг орой хоол (2 хүн)',price:75000,category:'food'},
    {id:6,name:'🅿 Машины зогсоол /хоног/',price:15000,category:'transport'},
    {id:7,name:'🎂 Мэндэлсэн өдрийн бэлэг',price:45000,category:'extra'},
    {id:8,name:'🛁 Ванн цэцэг, дарс',price:55000,category:'wellness'},
  ],
  revs:{
    1:[{first_name:'Б.Болд',overall_rating:5,created_at:'2024-11-20',comment:'Гайхалтай үйлчилгээ! Butler маань бүх хүсэлтийг шийдэж байлаа. Хотын харагдац маш гоё. Дахин заавал ирнэ.'},
       {first_name:'С.Нарантуяа',overall_rating:4,created_at:'2024-10-15',comment:'Байршил маш сайн, хоол амт тансаг. Бага зэрэг чимээтэй байсан ч бусад бүх зүйл төгс.'},
       {first_name:'Д.Энхбаяр',overall_rating:5,created_at:'2024-09-08',comment:'Ванны өрөo маш тансаг — мрамар ялгарна. Унтлага маш сайхан. Ажилтнуудын ёс суртахуун өндөр.'}],
    2:[{first_name:'А.Дөлгөөн',overall_rating:5,created_at:'2024-11-10',comment:'Дээд давхарт буй панорама харагдац хот болон уулыг нэгэн зэрэг харуулна. Оройны бар мартагдашгүй.'},
       {first_name:'Т.Мөнхбаяр',overall_rating:4,created_at:'2024-09-28',comment:'Үнэ-чанарын харьцаа маш сайн. Хотын дунд байршилтай, хаа ч явах ойрхон.'}],
    3:[{first_name:'Г.Анхбаяр',overall_rating:5,created_at:'2024-12-01',comment:'Kempinski буудал дэлхийд алдартай шалтгаантай! Монголын дизайн ялгарна. Butler 24/7 туслахад бэлэн.'},
       {first_name:'О.Батчимэг',overall_rating:5,created_at:'2024-11-05',comment:'Амьдралдаа очсон хамгийн сайн буудал. Хоол ундны чанар дэлхийн жишгийн.'}],
    4:[{first_name:'Х.Оюунчимэг',overall_rating:5,created_at:'2024-10-20',comment:'Монгол өв соёлыг бодитоор мэдрэх боломж! Гар урлалын чимэглэл, монгол бол, соёлын хөтөлбөр — бүгд гайхалтай.'},
       {first_name:'Р.Эрдэнэбат',overall_rating:4,created_at:'2024-09-15',comment:'Дотно, тав тухтай орчин. Ажилтнууд маш эелдэг, монгол хоол амттай.'}],
  },
  promos:{
    'MONGOL2024':{pct:15,lbl:'15% хөнгөлөлт',min_nights:2},
    'WELCOME10': {pct:10,lbl:'10% хөнгөлөлт',min_nights:1},
    'SUMMER50000':{flat:50000,lbl:'50,000₮ хөнгөлөлт',min_nights:3},
    'SHANGRI15': {pct:15,lbl:'15% Шангрила хөнгөлөлт',hotel_id:1},
    'KEMP20':    {pct:20,lbl:'20% Кемпинский VIP',hotel_id:3},
    'URGOO10':   {pct:10,lbl:'10% Өргөө Бутик',hotel_id:4},
  },
};

async function loadHotels(){
  const g=$('hotels-grid');
  g.innerHTML=`<div class="load-row" style="grid-column:1/-1"><div class="spin"></div> Буудлуудыг ачааллаж байна...</div>`;
  let hotels=[];
  try{
    const d=await api('get_hotels');
    hotels=d.hotels||[];
    if(!hotels.length)throw 0;
  }catch{hotels=D.hotels;}
  G.hotels=hotels;
  $('hcount').textContent=hotels.length+' буудал';
  g.innerHTML=hotels.map((h,i)=>hotelCardHTML(h,i)).join('');
  g.querySelectorAll('.hcard').forEach(el=>{revObs.observe(el);window._hl(el);});
}

function hotelCardHTML(h,i){
  return `<div class="hcard reveal" style="transition-delay:${i*.08}s" onclick="openDet(${h.id})">
    <div class="hc-img">
      <img src="${h.cover_image}" alt="${h.name}" loading="lazy"
           onerror="this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80'">
      <div class="hc-ov"></div>
      <div class="hc-stars">${'⭐'.repeat(Math.min(5,h.stars||5))}</div>
      ${h.is_featured?'<div class="hc-badge">✦ Онцолсон</div>':''}
      <div class="hc-live"><div class="lp"></div><span id="avail-${h.id}">${h.available_rooms||'—'} өрөo</span></div>
    </div>
    <div class="hc-body">
      <div class="hc-city">📍 ${h.city||'Улаанбаатар'}</div>
      <div class="hc-name">${h.name}</div>
      <div class="hc-tagline">${(h.tagline||'').slice(0,70)}${(h.tagline||'').length>70?'…':''}</div>
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

async function openDet(id){
  const ov=$('det-ov');
  ov.classList.add('on');ov.scrollTop=0;
  document.body.style.overflow='hidden';
  $('det-body').innerHTML=`<div class="load-row" style="padding:80px 20px"><div class="spin"></div> Буудлын мэдээлэл ачааллаж байна...</div>`;

  let h=null;
  try{
    const d=await api('get_hotel',{id});
    h=d.hotel;
    if(!h)throw 0;
    ['amenities','gallery','pros','cons'].forEach(k=>{
      if(typeof h[k]==='string')try{h[k]=JSON.parse(h[k]);}catch{h[k]=[];}
    });
    if(!h.room_types?.length)throw 'no rooms';
  }catch{
    const base=D.hotels.find(x=>x.id===id);
    if(!base){$('det-body').innerHTML='<div class="alert al-e" style="margin:40px">Буудал олдсонгүй</div>';return;}
    h={...base,room_types:D.rooms[id]||[],reviews:D.revs[id]||[]};
    if(typeof h.amenities==='string')try{h.amenities=JSON.parse(h.amenities);}catch{h.amenities=[];}
  }
  G.hotel=h;
  renderDetUI(h);
}

function renderDetUI(h){
  $('dh-img').src=h.cover_image||'';
  $('dh-img').onerror=function(){this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80';};
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

  const prosH=(Array.isArray(h.pros)&&h.pros.length)?`
    <div class="pc-col pc-pro">
      <div class="pc-title">✅ Давуу тал</div>
      ${h.pros.map(p=>`<div class="pc-item">${p}</div>`).join('')}
    </div>`:'';
  const consH=(Array.isArray(h.cons)&&h.cons.length)?`
    <div class="pc-col pc-con">
      <div class="pc-title">⚠️ Сул тал</div>
      ${h.cons.map(c=>`<div class="pc-item">${c}</div>`).join('')}
    </div>`:'';

  const amenH=(Array.isArray(h.amenities)&&h.amenities.length)?`
    <div style="margin-bottom:32px">
      <div class="sec-hd">Тав Тух & Үйлчилгээ</div>
      <div style="display:flex;flex-wrap:wrap;gap:7px">
        ${h.amenities.map(a=>`<span class="chip" style="padding:7px 14px;font-size:12px">${a}</span>`).join('')}
      </div>
    </div>`:'';

  const rooms=h.room_types||[];
  const roomH=`
    <div style="margin-bottom:32px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px">
        <div id="rlist-title" class="sec-hd" style="margin-bottom:0">Өрөoний Төрлүүд
          <span style="font-size:13px;color:var(--mist);font-weight:400"> ${rooms.length} төрөл</span>
        </div>
        <button id="rsearch-btn" class="act-sm" onclick="searchAvail()" style="padding:8px 16px;border-color:rgba(200,151,58,.3);color:var(--gold)">🔍 Хэлбэр хайх</button>
      </div>
      <div id="room-list">${rooms.map(rt=>roomCardHTML(rt)).join('')}</div>
    </div>`;

  const revs=h.reviews||[];
  const revH=revs.length?`
    <div style="margin-bottom:32px">
      <div class="sec-hd">Зочдын Үнэлгээ
        <span style="font-size:14px;color:var(--gold);font-weight:400"> ${parseFloat(h.rating||4.5).toFixed(1)} ⭐</span>
      </div>
      ${revs.map(rv=>`
        <div class="rev-item">
          <div class="rev-head">
            <div class="rev-user">
              <div class="rev-av">${(rv.first_name||'?')[0].toUpperCase()}</div>
              <div>
                <div class="rev-name">${rv.first_name||''} ${rv.last_name||''}</div>
                <div class="rev-date">${new Date(rv.created_at).toLocaleDateString('mn-MN')}</div>
              </div>
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
      <input class="bw-input" type="date" id="sw-in" value="${$('s-in') ? $('s-in').value : today()}" min="${today()}" onchange="calcNights()">
      <div class="bw-row">
        <div>
          <label class="bw-label">Явах огноо</label>
          <input class="bw-input" type="date" id="sw-out" value="${$('s-out') ? $('s-out').value : tmrw()}" min="${tmrw()}" onchange="calcNights()">
        </div>
        <div>
          <label class="bw-label">Зочид</label>
          <select class="bw-input" id="sw-g">
            <option value="1">1 хүн</option><option value="2" selected>2 хүн</option>
            <option value="3">3 хүн</option><option value="4">4 хүн</option>
          </select>
        </div>
      </div>
      <div id="sw-nights" style="text-align:center;font-size:11px;min-height:18px;margin:-4px 0 10px;color:var(--gold)"></div>
      <button class="bw-btn" id="sw-btn" onclick="searchAvail()">🔍 Боломжит өрөo хайх</button>
      <div class="bw-div">Буудлын мэдээлэл</div>
      <div style="font-size:12px;color:var(--text);line-height:2.2">
        <div>📞 ${h.phone||'—'}</div>
        <div>✉️ ${h.email||'—'}</div>
        <div>🕐 Нэвтрэх: <strong>${h.check_in_time||'14:00'}</strong></div>
        <div>🕐 Гарах: <strong>${h.check_out_time||'12:00'}</strong></div>
        <div style="color:var(--gold)">🏅 ${h.stars||5} одтой буудал</div>
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
  const img=(Array.isArray(rt.images)?rt.images:[rt.images||''])[0]
    ||'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80';
  const avCnt=rt.available_count??rt.available??null;
  const avBadge=avCnt!==null
    ?avCnt>0?`<span class="av-badge av-ok">✅ ${avCnt} боломжтой</span>`
            :`<span class="av-badge av-no">❌ Дүүрэн</span>`:'';
  const hid=rt.hotel_id||G.hotel?.id||0;
  const prosH=(Array.isArray(rt.pros)&&rt.pros.length)?`
    <div class="rt-pc">
      <div class="rt-pc-t">✅ Давуу тал</div>
      ${rt.pros.map(p=>`<div class="rt-pc-i">${p}</div>`).join('')}
    </div>`:'';
  const consH=(Array.isArray(rt.cons)&&rt.cons.length)?`
    <div class="rt-pc">
      <div class="rt-pc-t">⚠️ Сул тал</div>
      ${rt.cons.map(c=>`<div class="rt-pc-i">${c}</div>`).join('')}
    </div>`:'';

  return `<div class="rcard">
    <div class="rcard-lay">
      <div class="ri-wrap">
        <img src="${img}" alt="${rt.name}" loading="lazy"
             onerror="this.src='https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=600'">
      </div>
      <div class="rbody">
        <div>
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px">
            <div class="rname">${rt.name}</div>${avBadge}
          </div>
          <div class="rmeta">
            <span>🛏 ${bed_mn(rt.bed_type)}</span>
            <span>📐 ${rt.size_sqm||'—'}м²</span>
            <span>👥 Max ${rt.max_guests} хүн</span>
          </div>
          <p class="rdesc">${rt.description||''}</p>
          <div class="rchips">${(Array.isArray(rt.amenities)?rt.amenities:[]).map(a=>`<span class="rc">${a}</span>`).join('')}</div>
          ${(prosH||consH)?`<div class="rt-pcs">${prosH}${consH}</div>`:''}
        </div>
        <div class="rfooter">
          <div class="rprice">
            ${nights
              ?`<div class="rp-from">${nights} хоногийн нийт</div>
                <div class="rp-val">${fmt(rt.base_price*nights)}</div>
                <div style="font-size:10px;color:var(--mist)">${fmt(rt.base_price)} / хоног</div>`
              :`<div class="rp-from">1 хоногийн үнэ</div>
                <div class="rp-val">${fmt(rt.base_price)}<span class="rp-unit"> / хоног</span></div>`}
          </div>
          <button class="book-btn"
            ${avCnt===0?'disabled style="opacity:.4;cursor:not-allowed"':''}
            onclick='openBook(${esc({...rt,hotel_id:hid})})'>
            ${avCnt===0?'❌ Дүүрэн':'Захиалах →'}
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

function calcNights(){
  const ci=$('sw-in')?.value,co=$('sw-out')?.value,el=$('sw-nights');
  if(!ci||!co||!el)return;
  const n=Math.round((new Date(co)-new Date(ci))/86400000);
  el.style.color=n>0?'var(--gold)':'var(--red)';
  el.textContent=n>0?`📅 ${n} хоног сонгогдлоо`:'⚠️ Огноо буруу байна';
}

async function searchAvail(){
  if(!G.hotel)return;
  const ci=$('sw-in')?.value,co=$('sw-out')?.value,g=$('sw-g')?.value||'2';
  if(!ci||!co||co<=ci){toast('Огноог зөв оруулна уу','e');return;}
  const n=nts(ci,co);
  const btn=$('sw-btn')||document.querySelector('#rsearch-btn');
  const list=$('room-list'),title=$('rlist-title');
  btnL(btn,true,'Хайж байна...');
  if(list)list.innerHTML=`<div class="load-row"><div class="spin"></div> Боломжит өрөo шалгаж байна...</div>`;

  let types=[],ok=true;
  try{
    const d=await api('search_rooms',{hotel_id:G.hotel.id,check_in:ci,check_out:co,adults:g});
    types=d.room_types||[];
    types.forEach(t=>{['amenities','images','pros','cons'].forEach(k=>{if(typeof t[k]==='string')try{t[k]=JSON.parse(t[k]);}catch{t[k]=[]}});});
  }catch{
    ok=false;
    types=(D.rooms[G.hotel.id]||[]).filter(r=>(r.available_count||0)>0&&(r.max_guests||2)>=(parseInt(g)||1));
  }
  btnL(btn,false);

  if(title)title.innerHTML=types.length
    ?`Хайлтын Үр Дүн <span style="font-size:13px;color:var(--mist);font-weight:400">${types.length} өрөo · ${n} хоног · ${g} зочин${!ok?' (demo)':''}</span>`
    :`Хайлтын Үр Дүн <span style="font-size:13px;color:var(--mist)">0 өрөo</span>`;

  if(!list)return;
  if(!types.length){
    list.innerHTML=`
      <div class="alert al-i" style="flex-direction:column;align-items:flex-start;gap:10px">
        <div>😔 <strong>${ci} — ${co}</strong> хооронд ${g} зочинд зориулсан боломжит өрөo байхгүй байна.</div>
        <a style="color:var(--gold);cursor:pointer;font-size:12px" onclick="resetRooms()">↩ Бүх өрөог харах</a>
      </div>`;return;
  }
  list.innerHTML=types.map(rt=>roomCardHTML({...rt,hotel_id:G.hotel.id},n)).join('');
  toast(`${types.length} боломжит өрөo олдлоо ✓`,'s');
}

function resetRooms(){
  if(!G.hotel)return;
  const list=$('room-list'),title=$('rlist-title');
  const rooms=G.hotel.room_types||D.rooms[G.hotel.id]||[];
  if(list)list.innerHTML=rooms.map(rt=>roomCardHTML(rt)).join('');
  if(title)title.innerHTML=`Өрөoний Төрлүүд <span style="font-size:13px;color:var(--mist);font-weight:400">${rooms.length} төрөл</span>`;
}

function doSearch(){
  const hid=$('s-hotel').value,ci=$('s-in').value,co=$('s-out').value;
  if(ci&&co&&co<=ci){toast('Явах огноо ирэх огнооноос хойш байх ёстой','e');return;}
  if(hid){openDet(parseInt(hid));}
  else{document.getElementById('hotels-sec')?.scrollIntoView({behavior:'smooth'});}
}

async function openBook(rt){
  if(!G.user){
    G._after={fn:openBook,args:[rt]};
    openModal('login-modal');
    toast('Захиалга хийхийн тулд нэвтэрч орно уу','i');
    return;
  }
  G.rt=rt;G.promo=0;
  setAlert('bm-alert','');
  $('promo-res').innerHTML='';
  $('bm-promo').value='';
  $('bm-special').value='';

  const img=(Array.isArray(rt.images)?rt.images:[])[0]
    ||'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=300&q=70';
  $('bm-img').src=img;
  $('bm-hname').textContent=G.hotel?.name||'';
  $('bm-rname').textContent=rt.name;
  $('bm-rmeta').textContent=`${bed_mn(rt.bed_type)} · ${rt.size_sqm||'—'}м² · Max ${rt.max_guests} хүн`;

  const ci=$('sw-in')?.value||$('s-in')?.value||today();
  const co=$('sw-out')?.value||$('s-out')?.value||tmrw();
  $('bm-in').value=ci;$('bm-in').min=today();
  $('bm-out').value=co;$('bm-out').min=tmrw();

  // Load services
  const hid=rt.hotel_id||G.hotel?.id||0;
  try{
    const sd=await api('get_services',{hotel_id:hid});
    G._svcs=sd.services||D.svcs;
  }catch{G._svcs=D.svcs;}

  $('bm-svcs').innerHTML=(G._svcs||[]).map(s=>`
    <div class="svc" onclick="togSvc(this)">
      <input type="checkbox" value="${s.id}" data-price="${s.price}" style="display:none">
      <div class="svc-n">${s.name}</div>
      <div class="svc-p">+${fmt(s.price)}</div>
    </div>`).join('');

  calcPrice();
  openModal('book-modal');
}

function togSvc(el){
  const cb=el.querySelector('input');cb.checked=!cb.checked;
  el.classList.toggle('sel',cb.checked);calcPrice();
}

function calcPrice(){

  if(!G.rt) return

  const ci = document.getElementById('bm-in').value
  const co = document.getElementById('bm-out').value

  if(!ci || !co) return

  const nights = Math.ceil((new Date(co) - new Date(ci)) / 86400000)

  if(nights <= 0){
    toast('Огноо буруу байна','e')
    return
  }

  const roomTotal = G.rt.base_price * nights
  const tax = roomTotal * 0.1
  const total = roomTotal + tax

  G.bk = {
    nights:nights,
    room_total:roomTotal,
    tax:tax,
    total_price:total
  }

  document.getElementById('pbd').style.display='block'
  document.getElementById('pb-room').innerText = fmt(roomTotal)
  document.getElementById('pb-tax').innerText = fmt(tax)
  document.getElementById('pb-total').innerText = fmt(total)

}

async function applyPromo(){
  const code=($('bm-promo').value||'').trim().toUpperCase();
  if(!code){toast('Купон кодоо оруулна уу','w');return;}
  const btn=document.querySelector('.promo-go');
  const ci=$('bm-in').value,co=$('bm-out').value;
  const n=ci&&co?nts(ci,co):1;
  const amount=(G.rt?.base_price||0)*n;
  const hid=G.rt?.hotel_id||G.hotel?.id||0;
  btnL(btn,true,'...');
  try{
    const d=await api('check_promo',{},{code,hotel_id:hid,nights:n,amount});
    if(d.valid){
      G.promo=d.discount;
      $('promo-res').innerHTML=`<div class="alert al-s">🎁 <strong>${code}</strong> — ${d.label} хэрэглэгдлээ!</div>`;
      calcPrice();toast(`${d.label} хэрэглэгдлээ 🎉`,'s');
    }else{
      G.promo=0;
      $('promo-res').innerHTML=`<div class="alert al-e">✕ ${d.error||'Купон хүчингүй'}</div>`;
      calcPrice();
    }
  }catch{
    const p=D.promos[code];
    if(p&&(!p.hotel_id||p.hotel_id===hid)&&(!p.min_nights||n>=p.min_nights)){
      G.promo=p.pct?amount*p.pct/100:p.flat;
      $('promo-res').innerHTML=`<div class="alert al-s">🎁 <strong>${code}</strong> — ${p.lbl} хэрэглэгдлээ!</div>`;
      calcPrice();toast(`${p.lbl} 🎉`,'s');
    }else{
      G.promo=0;
      $('promo-res').innerHTML=`<div class="alert al-e">✕ Купон хүчингүй эсвэл таарахгүй байна</div>`;
      calcPrice();
    }
  }finally{btnL(btn,false);}
}

async function doBook(){

  if(!G.bk || !G.bk.total_price){
    toast('Үнэ тооцогдоогүй байна','e')
    return
  }

  const btn = document.querySelector('#book-modal .mbtn')
  btnL(btn,true,'Үүсгэж байна...')

  try{

    const d = await api('create_booking',{},{

      hotel_id:G.rt.hotel_id,
      room_type_id:G.rt.id,

      check_in:document.getElementById('bm-in').value,
      check_out:document.getElementById('bm-out').value,

      adults:document.getElementById('bm-adults').value,
      children:document.getElementById('bm-children').value,

      services:getSelectedServices(),

      promo_code:document.getElementById('bm-promo').value,
      special_requests:document.getElementById('bm-special').value

    })

    if(!d.success){
      toast(d.error,'e')
      return
    }

    G.bk.booking_id = d.booking_id
    G.bk.booking_code = d.booking_code
    G.bk.total_price = d.total_price

    closeModal('book-modal')
    openPay()

  }
  catch(e){

console.error(e)

if(e.api){
toast(e.api.error || 'API алдаа','e')
}else{
toast('Серверт холбогдсонгүй','e')
}

}

  btnL(btn,false)

}
function getSelectedServices(){

  const services = []

  document.querySelectorAll('#bm-svcs input:checked').forEach(el=>{
    services.push({
      id: el.value,
      price: el.dataset.price
    })
  })

  return services

}


function openPay(){

  if(!G.bk) return

  const code = document.getElementById('pm-code')
  const amt  = document.getElementById('pm-amt')

  if(code) code.innerText = G.bk.booking_code
  if(amt)  amt.innerText  = fmt(G.bk.total_price) + '₮'

  openModal('pay-modal')

}

function payStep(id){
  $$('.pstep').forEach(s=>s.classList.remove('on'));
  const el=$(id);
  if(el){
    el.classList.add('on');
    el.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:260,easing:'ease',fill:'both'});
  }
}

function selM(method,el){
  $$('.pmb').forEach(b=>b.classList.remove('sel'));
  el.classList.add('sel');G.pay.method=method;
}

async function proceedPay(){

  if(!G.pay.method){
    toast('Төлбөрийн хэлбэр сонгоно уу','w')
    return
  }

  const btn=document.querySelector('#ps1 .mbtn')
  btnL(btn,true,'Боловсруулж байна...')

  try{

    const d = await api('init_payment',{},{
      booking_id:G.bk.booking_id,
      method:G.pay.method
    })

    if(!d.success){
      toast(d.error || 'Төлбөр эхлүүлэхэд алдаа','e')
      btnL(btn,false)
      return
    }

    G.pay.pid = d.payment_id

    renderPayUI(G.pay.method,d)

  }catch(e){

    console.error(e)
    toast('Серверт холбогдсонгүй','e')

  }

  btnL(btn,false)

}

function renderPayUI(method,d){
  const amt=d.amount||G.bk.total_price;

  if(method==='qpay'){
    payStep('ps-qpay');
    $('qamt').textContent=fmt(amt);
    const cv=$('qr-cv');
    if(typeof QRCode!=='undefined'){
      try{
        QRCode.toCanvas(cv,d.qr_text||('QPay_'+G.bk.booking_code),
          {width:180,margin:2,color:{dark:'#000000',light:'#ffffff'}},
          err=>{if(err){renderFallbackQR(cv,d.qr_text);}});
      }catch{renderFallbackQR(cv,d.qr_text);}
    }else{renderFallbackQR(cv,d.qr_text);}
    const links=d.deep_links||makeDeepLinks(G.bk.booking_code);
    $('blinks').innerHTML=links.map(b=>
      `<a class="blink" href="${b.url}">
        <span class="blink-ic">${b.logo}</span>
        <span class="blink-n">${b.name}</span>
      </a>`).join('');
    // Poll every 7s
    clearInterval(G.pay._poll);
    G.pay._poll=setInterval(pollQPay,7000);
    let pollCount = 0;

async function pollQPay(){

if(!G.pay.pid || pollCount > 30) return

pollCount++

try{
const d = await api('check_payment',{payment_id:G.pay.pid})

if(d.paid){
clearInterval(G.pay._poll)
paySuccess()
}

}catch(e){
console.log("poll error",e)
}

}

  }else if(['khanbank','golomtbank','tdbbank'].includes(method)){
    payStep('ps-bank');
    const bi=d.bank_info||getBankInfoDemo(method,G.bk);
    $('binfo').innerHTML=`
      <div class="bi-row">
        <span class="bi-l">Банк</span>
        <span class="bi-v"><strong>${bi.name}</strong></span>
      </div>
      <div class="bi-row">
        <span class="bi-l">Дансны дугаар</span>
        <span class="bi-v">
          <strong style="font-family:'DM Mono',monospace;font-size:16px;letter-spacing:1px">${bi.account}</strong>
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
          <strong style="font-family:'DM Mono',monospace;color:var(--gold)">${bi.reference||G.bk.booking_code}</strong>
          <button class="copy-btn" onclick="cp('${bi.reference||G.bk.booking_code}')">📋 Хуулах</button>
        </span>
      </div>
      <div class="bi-row">
        <span class="bi-l">Дүн</span>
        <span class="bi-v" style="color:var(--gold);font-weight:700;font-size:18px">${fmt(amt)}</span>
      </div>
      <div class="alert al-i" style="margin-top:14px">
        ⚠️ <strong>Чухал:</strong> Гүйлгээний утгад захиалгын кодоо <strong>заавал</strong> бичнэ үү.
        Үгүй бол мөнгө автоматаар буцаагдахгүй.
      </div>`;

  }else if(['socialpay','monpay'].includes(method)){
    payStep('ps-mobile');
    const isSP=method==='socialpay';
    $('mob-ic').textContent=isSP?'💬':'📲';
    $('mob-amt').textContent=fmt(amt);
    $('mob-desc').innerHTML=`
      <div style="margin-bottom:16px;font-size:13px;color:var(--text)">
        ${isSP?'<strong>Khan Bank SocialPay</strong>':'<strong>MonPay</strong>'} аппыг нээнэ үү
      </div>
      <div class="pay-steps">
        <div class="ps-item"><span class="ps-num">1</span> Апп нээж <strong>"Мерчант"</strong> хэсэгт орно</div>
        <div class="ps-item"><span class="ps-num">2</span> <strong>MONGOHOTELS</strong> хайж олно</div>
        <div class="ps-item"><span class="ps-num">3</span> Дүн: <strong style="color:var(--gold)">${fmt(amt)}</strong> оруулж төлнө</div>
        <div class="ps-item"><span class="ps-num">4</span> Утга: <strong style="font-family:'DM Mono',monospace;color:var(--gold)">${G.bk.booking_code}</strong>
          <button class="copy-btn" style="margin-left:6px" onclick="cp('${G.bk.booking_code}')">📋</button>
        </div>
      </div>`;

  }else{
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
          ${isCash?'Бэлэн мөнгө':'Банкны карт (Visa, MC, UnionPay)'}:
          <strong style="color:var(--gold)">${fmt(amt)}</strong>
        </div>
        <div class="ps-item">
          <span class="ps-num">3</span> Check-in цаг: <strong>${G.hotel?.check_in_time||'14:00'}</strong>
        </div>
      </div>
      <div class="alert al-g" style="margin-top:14px">
        ℹ️ Захиалга баталгаажсан. Захиалгын кодоо хадгалж аваарай.
      </div>`;
  }
}

function renderFallbackQR(cv,txt){
  cv.width=180;cv.height=180;
  const ctx=cv.getContext?.('2d');
  if(!ctx)return;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,180,180);
  ctx.fillStyle='#222';ctx.font='bold 11px monospace';ctx.textAlign='center';
  ctx.fillText('QPay',90,80);ctx.fillText((txt||'').slice(0,20),90,96);
  ctx.fillText('Scan me',90,112);
}

async function pollQPay(){
  if(!G.pay.pid)return;
  try{
    const d=await api('check_payment',{payment_id:G.pay.pid});
    if(d.paid){clearInterval(G.pay._poll);paySuccess();}
  }catch{}
}

async function chkNow(){
  if(!G.pay.pid){toast('Төлбөрийн мэдээлэл алга','w');return;}
  const btn=document.querySelector('.pchk');
  btnL(btn,true,'Шалгаж байна...');
  try{
    const d=await api('check_payment',{payment_id:G.pay.pid});
    if(d.paid){clearInterval(G.pay._poll);paySuccess();}
    else toast('Төлбөр бүртгэгдээгүй байна. QR кодоо скан хийсний дараа шалгана уу.','w',5000);
  }catch{toast('Серверт холбогдсонгүй','w');}
  finally{btnL(btn,false);}
}
async function checkPayment(){

  if(!G.pay.pid) return

  try{

    const d = await api('check_payment',{
      payment_id:G.pay.pid
    })

    if(d.success && d.status === 'completed'){

      openSuccess()

    }

  }catch(e){
    console.log('payment check error',e)
  }

}

async function paySuccess(){

clearInterval(G.pay._poll)

try{

await api('create_booking',{},{
hotel_id:G.hotel.id,
room_type_id:G.rt.id,
check_in:$('bm-in').value,
check_out:$('bm-out').value,
adults:$('bm-adults').value,
children:$('bm-children').value
})

}catch(e){
console.log("booking create error",e)
}

payStep('ps-succ')

toast('Төлбөр амжилттай! Захиалга баталгаажлаа 🎉','s')

}
function openSuccess(){

  closeModal('pay-modal')

  document.getElementById('sc-code').innerText = G.bk.booking_code
  document.getElementById('sc-total').innerText = fmt(G.bk.total_price)

  openModal('success-modal')

}

async function confirmBank(){
  const ref=($('bank-ref')?.value||'').trim();
  if(!ref){toast('Гүйлгээний дугаараа оруулна уу','w');return;}
  const btn=document.querySelector('#ps-bank .mbtn');
  btnL(btn,true,'Баталгаажуулж байна...');
  try{await api('confirm_payment',{},{payment_id:G.pay.pid,reference:ref});}catch{}
  paySuccess();btnL(btn,false);
}
async function confirmMob(){
  const btn=document.querySelector('#ps-mobile .mbtn');
  btnL(btn,true,'...');
  try{await api('confirm_payment',{},{payment_id:G.pay.pid,reference:'MOBILE'});}catch{}
  paySuccess();btnL(btn,false);
}
function finishOn(){paySuccess();}

function makeDeepLinks(code){
  const e=encodeURIComponent(code);
  return[
    {name:'Хаан Банк',   logo:'🏦',url:`khanbank://q?qPay_QRcode=${e}`},
    {name:'Голомт Банк', logo:'🏛',url:`golomtbank://q?qPay_QRcode=${e}`},
    {name:'ТДБ Банк',    logo:'🏢',url:`tdbbank://q?qPay_QRcode=${e}`},
    {name:'Хас Банк',    logo:'🌟',url:`xacbank://q?qPay_QRcode=${e}`},
    {name:'Капитрон',    logo:'💠',url:`capitronbank://q?qPay_QRcode=${e}`},
    {name:'Most Money',  logo:'📱',url:`mostmoney://q?qPay_QRcode=${e}`},
  ];
}
function getBankInfoDemo(m,bk){
  const b={
    khanbank:   {name:'Хаан Банк',   account:'5000-123456'},
    golomtbank: {name:'Голомт Банк', account:'1200-987654'},
    tdbbank:    {name:'ТДБ Банк',    account:'4001-234567'},
  };
  return{...(b[m]||b.khanbank),owner:'МонголHotels ХХК',
    reference:bk?.booking_code,amount:bk?.total_price};
}

async function loadMyBk(){
  const el=$('mybk-list');
  el.innerHTML=`<div class="load-row"><div class="spin"></div> Захиалгуудыг ачааллаж байна...</div>`;
  try{
    const d=await api('my_bookings');
    if(d.error){el.innerHTML=`<div class="alert al-e" style="margin:12px">${d.error}</div>`;return;}
    renderMyBk(el,d.bookings||[]);
  }catch{
    const list=G.bk?[{
      id:G.bk.booking_id,booking_code:G.bk.booking_code,
      hotel_name:G.hotel?.name||'МонголHotels',
      room_type_name:G.rt?.name||'Өрөo',room_number:'—',
      check_in:$('bm-in')?.value||today(),check_out:$('bm-out')?.value||tmrw(),
      nights:1,total_price:G.bk.total_price,status:'confirmed',
      cover_image:G.hotel?.cover_image||'',
    }]:[];
    renderMyBk(el,list);
  }
}

function renderMyBk(el,bks){
  if(!bks.length){
    el.innerHTML=`
      <div style="text-align:center;padding:52px 20px;color:var(--mist)">
        <div style="font-size:40px;margin-bottom:14px">📋</div>
        <div style="font-size:14px;margin-bottom:8px">Захиалга байхгүй байна</div>
        <div style="font-size:12px">Буудал сонгоод өрөo захиалаарай</div>
      </div>`;return;
  }
  const stT={pending:'⏳ Хүлээгдэж',confirmed:'✅ Батлагдсан',checked_in:'🏨 Ирсэн',cancelled:'❌ Цуцлагдсан',checked_out:'👋 Гарсан',no_show:'⚠️ Ирээгүй'};
  const stC={pending:'sp',confirmed:'sc_',checked_in:'si',cancelled:'sca',checked_out:'so',no_show:'sca'};
  el.innerHTML=bks.map(b=>{
    const n=b.nights||Math.round((new Date(b.check_out)-new Date(b.check_in))/86400000)||1;
    return `<div class="mbi">
      <img class="mbi-img" src="${b.cover_image||'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=180&q=60'}"
           alt="" onerror="this.style.display='none'">
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
  if(!confirm('Энэ захиалгыг цуцлах уу? Энэ үйлдлийг буцааж болохгүй.'))return;
  btnL(btn,true,'...');
  try{
    const d=await api('cancel_booking',{},{booking_id:id});
    if(d.success){toast('Захиалга цуцлагдлаа','i');loadMyBk();return;}
    toast(d.error||'Цуцлах боломжгүй','e');
  }catch{toast('Захиалга цуцлагдлаа (demo)','i');loadMyBk();return;}
  btnL(btn,false);
}

function rePay(b){
  closeModal('mybk-modal');
  G.bk={booking_id:b.id,booking_code:b.booking_code,total_price:b.total_price};
  openPay(G.bk);
}

function openReview(bid,hid){
  const html=`
    <div style="padding:20px 0">
      <div class="sec-hd" style="font-size:16px">Үнэлгээ өгөх</div>
      <div class="frow" style="margin-bottom:14px">
        ${['overall','cleanliness','service','location'].map(k=>`
          <div>
            <label class="bw-label">${{overall:'Нийт',cleanliness:'Цэвэр байдал',service:'Үйлчилгээ',location:'Байршил'}[k]}</label>
            <select class="finput" id="rv-${k}">
              ${[5,4,3,2,1].map(n=>`<option value="${n}" ${n===5?'selected':''}>${n} ⭐</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>
      <label class="bw-label">Сэтгэгдэл</label>
      <textarea class="finput" id="rv-comment" rows="4" placeholder="Таны буудлын туршлагыг хуваалцана уу..." style="resize:vertical"></textarea>
      <button class="mbtn" style="margin-top:14px" onclick="submitReview(${bid},${hid})">Үнэлгээ Илгээх →</button>
    </div>`;
  $('mybk-list').innerHTML=html;
}

async function submitReview(bid,hid){
  const btn=document.querySelector('#mybk-list .mbtn');
  btnL(btn,true,'Илгээж байна...');
  try{
    await api('submit_review',{},{
      booking_id:bid,hotel_id:hid,
      overall:$('rv-overall').value,cleanliness:$('rv-cleanliness').value,
      service:$('rv-service').value,location:$('rv-location').value,
      comment:$('rv-comment').value,
    });
    toast('Үнэлгээ амжилттай илгээлээ! Баярлалаа 🙏','s');loadMyBk();
  }catch{
    toast('Үнэлгээ хадгалагдлаа (demo) 🙏','s');loadMyBk();
  }
}

async function doCheckBk(){
  const code=($('chk-code').value||'').trim().toUpperCase();
  if(!code){setAlert('chk-alert','Кодоо оруулна уу');return;}
  setAlert('chk-alert','');
  const btn=document.querySelector('#check-modal .mbtn');
  btnL(btn,true,'Шалгаж байна...');
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
          <div>👥 ${b.num_adults||1} насанд хүрсэн${(b.num_children||0)>0?' · '+(b.num_children)+' хүүхэд':''}</div>
          <div>💰 Нийт: <strong style="color:var(--gold)">${fmt(b.total_price)}</strong></div>
          <div>${stT[b.status]||b.status}</div>
        </div>`;
    }else{
      $('chk-result').innerHTML=`<div class="alert al-e">Захиалга олдсонгүй. Кодоо дахин шалгаарай.</div>`;
    }
  }catch{
    $('chk-result').innerHTML=`
      <div class="alert al-i">
        🔧 Demo горим — PHP серверт холбогдсонгүй.<br>
        Жишээ: <strong style="font-family:'DM Mono',monospace;letter-spacing:2px">MH241225XXXXX</strong>
      </div>`;
  }finally{btnL(btn,false);}
}

initApp();
