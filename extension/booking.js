function railwayBookingOptions(data) {
  const quantity = Number(data.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 4) throw new Error('১ থেকে ৪টি সিট নির্বাচন করুন। সাইটের সীমা প্রযোজ্য।');
  const train = String(data.train || '').trim();
  if (train.length < 3 || train.length > 100) throw new Error('নির্দিষ্ট ট্রেনের নাম বা নম্বর দিন।');
  if (!['random', 'selected'].includes(data.mode)) throw new Error('সিট নির্বাচনের ধরন দিন।');
  const coach = String(data.coach || '').trim();
  const seats = String(data.seats || '').split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
  if (data.mode === 'selected' && (!coach || seats.length !== quantity || new Set(seats.map(s=>s.toLowerCase())).size !== quantity)) throw new Error('নির্দিষ্ট সিটের জন্য কোচ ও প্রতিটি আলাদা সিটের পুরো নম্বর দিন। সিটসংখ্যার সঙ্গে তালিকা মিলতে হবে।');
  return {quantity, train, mode:data.mode, coach, seats};
}

function railwayCoachName(label) {
  return String(label || '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim().replace(/\s+/g,' ').toUpperCase()
    .replace(/\s*[-–—]\s*[0-9০-৯]+\s+SEAT(?:\(S\)|S)?\s*$/i,'')
    .replace(/\s*\(\s*[0-9০-৯]+(?:\s+SEAT(?:\(S\)|S)?)?\s*\)\s*$/i,'').trim();
}

async function railwayBook(journey, rawOptions, job = {}) {
  const options = railwayBookingOptions(rawOptions);
  const report = job.report || (()=>{});
  const cancelled = job.cancelled || (()=>false);
  const visible = el => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const all = (selector, root=document) => [...root.querySelectorAll(selector)].filter(visible);
  const norm = s => String(s || '').trim().replace(/\s+/g,' ').toUpperCase();
  const otp = () => all('app-confirm-booking-otp, #confirm-ticket-otp-form, #railway-otp-input-wrapper').length > 0;
  const guard = () => {
    if (cancelled()) throw new Error('সহকারী থামানো হয়েছে। আগে নির্বাচিত সিট থাকলে সাইটে দেখে নিজে বাতিল করুন।');
    if (location.origin !== 'https://eticket.railway.gov.bd') throw new Error('রেলওয়ের ওয়েবসাইটের বাইরে সহকারী থেমেছে।');
    if (all('input[type="password"]').length) throw new Error('আগে রেলওয়ের সাইটে লগইন করুন, তারপর আবার চালান।');
    const error = all('.railway-form-error, .swal2-popup .swal2-html-container').find(el=>el.textContent.trim());
    if (error) throw new Error('সাইটের বার্তা: ' + error.textContent.trim());
  };
  const wait = async (find, message, timeout=20000) => {
    const deadline=Date.now()+timeout;
    while(Date.now()<deadline) { guard(); const result=find(); if(result)return result; await new Promise(r=>setTimeout(r,120)); }
    throw new Error(message);
  };
  const pause = async ms => { await new Promise(r=>setTimeout(r,ms)); guard(); };
  const readyButton = async (find,message) => wait(()=>{const b=find();return visible(b)&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&b;},message);
  guard();
  if (otp()) return {state:'otp',message:'OTP ধাপে পৌঁছেছেন। OTP ও পরের ধাপ নিজে সম্পন্ন করুন।'};
  if (!location.pathname.includes('/booking/train/')) {
    report('যাত্রার ফর্ম পূরণ হচ্ছে…');
    const filled = await railwayFill(journey);
    guard();
    if (!filled.ok) throw new Error(filled.message);
    const search = await readyButton(()=>all('button').find(b=>norm(b.textContent)==='SEARCH TRAINS'),'Search Trains প্রস্তুত নয়। সাইটের যাচাই সম্পন্ন করুন।');
    report('ট্রেন খোঁজা হচ্ছে…'); search.click();
  }
  if (location.pathname.includes('/trip-info')) {
    await wait(()=>otp()||all('#psngr, app-passenger-form').length,'বুকিং পেজ প্রস্তুত হয়নি। নিজে পেজ দেখুন।');
    return {state:otp()?'otp':'manual',message:otp()?'OTP ধাপে পৌঁছেছেন। OTP নিজে দিন।':'যাত্রী তথ্যের ধাপ এসেছে; OTP দেখানো হয়নি। বাকি ধাপ নিজে সম্পন্ন করুন।'};
  }
  const trips=await wait(()=>{const items=all('app-single-trip');return items.length&&items;},'ট্রেন পাওয়া যায়নি। ফলাফল বা CAPTCHA দেখুন, তারপর আবার চালান।');
  const query=new URLSearchParams(location.search);
  const [year,month,day]=journey.date.split('-');
  const siteDate=norm(query.get('doj'));
  const prettyDate=day+'-'+['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(month)-1]+'-'+year;
  if(norm(query.get('fromcity'))!==norm(journey.from)||norm(query.get('tocity'))!==norm(journey.to)||norm(query.get('class'))!==norm(journey.seatClass)||![norm(journey.date),prettyDate].includes(siteDate))throw new Error('খোলা ফলাফলের রুট/তারিখ/ক্লাস আপনার ফর্মের সঙ্গে মিলছে না। Home পেজ থেকে আবার চালান।');
  const trainMatches = text => {
    const name=norm(text), target=norm(options.train);
    return name===target || name.replace(/\s*[([]\d+[)\]]\s*$/,'').trim()===target || (/^\d+$/.test(target)&&[...name.matchAll(/[([]\s*(\d+)\s*[)\]]/g)].some(m=>m[1]===target));
  };
  const matching=trips.filter(trip=>trainMatches(trip.querySelector('.trip-left-info')?.textContent || trip.querySelector('.trip-name')?.textContent));
  if(matching.length!==1)throw new Error('ট্রেনের নাম/নম্বর হুবহু মেলেনি অথবা একাধিক মিলেছে। সাইটের নাম ব্যবহার করুন।');
  const trip=matching[0];
  const classBox=()=>[...trip.querySelectorAll('.single-seat-class')].find(el=>norm(el.querySelector('.seat-class-name')?.textContent)===norm(journey.seatClass));
  if(!visible(classBox())) { const expand=trip.querySelector('.trip-name');if(expand)expand.click();await pause(200); }
  const box=classBox();
  if(!visible(box))throw new Error('নির্বাচিত ট্রেনে এই সিট ক্লাস নেই।');
  let layout=all('app-seat-layout',trip)[0];
  if(layout && !box.classList.contains('selected') && !box.classList.contains('selected-seat-type'))throw new Error('অন্য ক্লাসের সিট ম্যাপ খোলা আছে। সেটি বন্ধ করে আবার চালান।');
  if(!layout) {
    const book=await readyButton(()=>box.querySelector('.book-now-btn'),'সিট ম্যাপ খোলা যাচ্ছে না। সিটের প্রাপ্যতা বা CAPTCHA দেখুন।');
    report('নির্বাচিত ট্রেনের সিট ম্যাপ খুলছে…');book.click();
    layout=await wait(()=>all('app-seat-layout',trip)[0],'সিট ম্যাপ পাওয়া যায়নি। লগইন/CAPTCHA বা সাইটের বার্তা দেখুন।');
  }
  const seatName = el => norm(el.getAttribute('title') || el.textContent);
  const selected = () => all('.btn-seat.seat-selected',layout);
  // Do not overwrite or add to an existing manual reservation.
  if(selected().length || layout.querySelector('#tbl_seat_list .seat-info-row'))throw new Error('আগে থেকেই সিট নির্বাচন করা আছে। সেগুলো দেখে নিজে Continue করুন অথবা বাতিল করে আবার চালান।');
  const coach=layout.querySelector('#select-bogie');
  if(!coach)throw new Error('কোচের তালিকা পাওয়া যায়নি।');
  let coaches=await wait(()=>{const choices=[...coach.options].filter(o=>!o.disabled&&o.textContent.trim()&&o.value!=='');return choices.length&&choices;},'কোচের তালিকা এখনও লোড হয়নি। সাইটের সিট ম্যাপ দেখে আবার চেষ্টা করুন।');
  if(options.coach) {
    const choices=coaches;
    coaches=choices.filter(o=>railwayCoachName(o.textContent)===railwayCoachName(options.coach));
    if(coaches.length!==1)throw new Error((coaches.length?'একাধিক কোচের নাম মিলে গেছে। সাইটে নিজে কোচ নির্বাচন করুন।':'কোচের নাম মেলেনি।')+' উপলব্ধ কোচ: '+choices.map(o=>railwayCoachName(o.textContent)).join(', '));
  }
  const available = () => all('.btn-seat.seat-available',layout).filter(b=>!b.disabled&&!b.matches('.seat-selected,.seat-disabled,.seat-booked,.seat-in-progress,.request_pending'));
  let targets=null;
  for(const option of coaches.slice(0,40)) {
    guard();coach.value=option.value;coach.dispatchEvent(new Event('change',{bubbles:true}));await pause(220);
    const seats=available();
    if(options.mode==='selected') {
      const found=options.seats.map(name=>seats.filter(el=>seatName(el)===norm(name)));
      if(found.every(matches=>matches.length===1))targets=found.map(matches=>matches[0]);
    } else if(seats.length>=options.quantity) {
      for(let i=seats.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[seats[i],seats[j]]=[seats[j],seats[i]];}
      targets=seats.slice(0,options.quantity);
    }
    if(targets)break;
  }
  if(!targets)throw new Error(options.mode==='selected'?'চাওয়া সব সিট পাওয়া যায়নি। বিকল্প সিট নেওয়া হয়নি।':'এক কোচে প্রয়োজনীয় সংখ্যক খালি সিট নেই। অন্য ট্রেন/ক্লাস বেছে নিন।');
  const names=targets.map(seatName);
  report('সিট নির্বাচন: '+names.join(', '));
  for(const name of names) {
    guard();const seat=available().find(b=>seatName(b)===name);
    if(!seat)throw new Error('সিটের প্রাপ্যতা বদলেছে। নির্বাচিত সিটগুলো সাইটে দেখুন।');
    seat.click();
    await wait(()=>selected().find(b=>seatName(b)===name&&!b.classList.contains('request_pending')),'সিট নির্বাচন নিশ্চিত হয়নি। CAPTCHA/সাইটের বার্তা দেখুন।');
  }
  if(selected().length!==options.quantity || !names.every(name=>selected().some(el=>seatName(el)===name)))throw new Error('সিটসংখ্যা মেলেনি। Continue করা হয়নি।');
  const boarding=layout.querySelector('#boardingpoint');
  if(!boarding || !boarding.value)throw new Error('বোর্ডিং পয়েন্ট সাইটে নির্বাচন করুন, তারপর নিজে Continue করুন।');
  const button=await readyButton(()=>layout.querySelector('#confirmbooking .continue-btn'),'Continue প্রস্তুত নয়। সাইটের প্রয়োজনীয় তথ্য দেখুন।');
  guard();report('সিট নির্বাচন হয়েছে। OTP ধাপে যাচ্ছে…');button.click();
  await wait(()=>otp()||all('#psngr, app-passenger-form').length,'Continue-এর পর OTP পাওয়া যায়নি। সাইটের বার্তা দেখুন; আবার বুকিং শুরু করবেন না।',30000);
  return {state:otp()?'otp':'manual',seats:names,message:otp()?'OTP ধাপে পৌঁছেছেন। OTP ও পেমেন্ট নিজে সম্পন্ন করুন।':'যাত্রী তথ্যের ধাপ এসেছে; OTP দেখানো হয়নি। বাকি ধাপ নিজে সম্পন্ন করুন।'};
}

function railwayStart(journey, options) {
  if(globalThis.__railwayJob?.running)return {started:false,message:'একটি কাজ চলছে। আগে সেটি থামান।'};
  const job={running:true,stopped:false};globalThis.__railwayJob=job;
  const previous=document.getElementById('railway-assistant-panel');if(previous)previous.remove();
  const host=document.createElement('div');host.id='railway-assistant-panel';
  host.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647;width:320px';
  const shadow=host.attachShadow({mode:'open'});
  const panel=document.createElement('div');panel.style.cssText='background:#123f34;color:white;padding:18px;border-radius:12px;font:14px/1.6 sans-serif;box-shadow:0 4px 24px #0004';
  const label=document.createElement('strong');label.textContent='Railway Assistant';
  const message=document.createElement('p');message.setAttribute('role','status');
  const stop=document.createElement('button');stop.textContent='থামান';stop.style.cssText='padding:8px 16px;cursor:pointer';stop.onclick=()=>{job.stopped=true;stop.disabled=true;};
  panel.append(label,message,stop);shadow.append(panel);document.body.append(host);
  const report=(text,state='running')=>{message.textContent=text;chrome.storage.local.set({bookingStatus:{state,message:text,updatedAt:Date.now()}}).catch(()=>{});};
  report('সহকারী শুরু হচ্ছে…');
  // This task lives in the tab and continues when the popup closes (Angular SPA).
  Promise.resolve().then(()=>railwayBook(journey,options,{report,cancelled:()=>job.stopped})).then(result=>report(result.message,result.state)).catch(error=>report(error.message,'stopped')).finally(()=>{job.running=false;stop.disabled=false;stop.textContent='বন্ধ করুন';stop.onclick=()=>host.remove();});
  return {started:true};
}
if(typeof module!=='undefined')module.exports={railwayBookingOptions,railwayBook,railwayCoachName};
