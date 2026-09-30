const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const {railwayBookingOptions,railwayCoachName}=require('./extension/booking');
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
const journey={from:'Dhaka',to:'Panchagarh',date:'2026-10-07',seatClass:'SNIGDHA'};
const options={train:'793',quantity:2,mode:'random',coach:'',seats:''};
const url='https://eticket.railway.gov.bd/booking/train/search?fromcity=Dhaka&tocity=Panchagarh&doj=07-Oct-2026&class=SNIGDHA';
const fixture=`<!doctype html><html><head><style>app-single-trip,app-seat-layout{display:block}</style></head><body>
<app-single-trip><div class="trip-name"><div class="trip-left-info">PANCHAGARH EXPRESS (793)</div></div>
<div class="single-seat-class"><span class="seat-class-name">SNIGDHA</span><button class="book-now-btn">BOOK NOW</button></div>
<app-seat-layout style="display:none"><select id="select-bogie"><option value="0">KA - 3 Seat(s)</option><option value="1">KHA - 3 Seat(s)</option></select>
<div id="seats"></div><select id="boardingpoint"><option value="dhaka">Dhaka</option></select><div id="confirmbooking"><button class="continue-btn">Continue</button></div></app-seat-layout>
</app-single-trip><button id="pay">Pay</button>
<script>
window.clicked=[];window.continued=0;window.paid=0;
document.getElementById('pay').onclick=()=>window.paid++;
document.querySelector('.book-now-btn').onclick=()=>{document.querySelector('app-seat-layout').style.display='block';document.querySelector('.single-seat-class').classList.add('selected')};
function seats(){const root=document.getElementById('seats');root.replaceChildren();const prefix=document.getElementById('select-bogie').value==='0'?'KA':'KHA';
for(let i=1;i<=3;i++){const b=document.createElement('button');b.className='btn-seat seat-available';b.title=prefix+'-'+i;b.textContent=b.title;b.onclick=()=>{window.clicked.push(b.title);b.classList.add('request_pending');setTimeout(()=>{b.classList.remove('request_pending');b.classList.add('seat-selected')},160)};root.append(b)}}
document.getElementById('select-bogie').onchange=seats;seats();
document.querySelector('.continue-btn').onclick=()=>{window.continued++;const f=document.createElement('form');f.id='confirm-ticket-otp-form';f.innerHTML='<input autocomplete="one-time-code"><button>Verify OTP</button>';document.body.append(f)};
</script></body></html>`;
async function page(body=fixture, address=url){const p=await browser.newPage();await p.route('**/*',r=>r.fulfill({contentType:'text/html',body}));await p.goto(address);await p.addScriptTag({path:path.join(__dirname,'extension/booking.js')});return p;}
async function run(p,opts=options){return p.evaluate(({journey,opts})=>railwayBook(journey,opts),{journey,opts});}
test('random mode reserves exact quantity, waits for confirmation and stops at OTP',async()=>{
 const p=await page();try{const r=await run(p);assert.equal(r.state,'otp');const state=await p.evaluate(()=>({clicked,continued,paid,otp:document.querySelector('input').value}));assert.equal(state.clicked.length,2);assert.equal(new Set(state.clicked).size,2);assert.equal(state.continued,1);assert.equal(state.paid,0);assert.equal(state.otp,'');}finally{await p.close()}
});
test('selected mode chooses exact coach and seats',async()=>{
 const p=await page();try{const r=await run(p,{...options,mode:'selected',coach:'KHA',seats:'KHA-1, KHA-3'});assert.deepEqual(r.seats,['KHA-1','KHA-3']);assert.equal(r.state,'otp');}finally{await p.close()}
});
test('unavailable requested seat makes no reservation and does not continue',async()=>{
 const p=await page();try{await assert.rejects(run(p,{...options,mode:'selected',coach:'KA',seats:'KA-1, KA-9'}),/চাওয়া সব সিট/);assert.deepEqual(await p.evaluate(()=>clicked),[]);assert.equal(await p.evaluate(()=>continued),0);}finally{await p.close()}
});
test('mismatched route stops before seat reservation',async()=>{
 const p=await page(fixture,url.replace('fromcity=Dhaka','fromcity=Rajshahi'));try{await assert.rejects(run(p),/মিলছে না/);assert.deepEqual(await p.evaluate(()=>clicked),[]);}finally{await p.close()}
});
test('ambiguous train stops before reservation',async()=>{
 const p=await page();try{await p.evaluate(()=>document.body.append(document.querySelector('app-single-trip').cloneNode(true)));await assert.rejects(run(p),/একাধিক/);assert.deepEqual(await p.evaluate(()=>clicked),[]);}finally{await p.close()}
});
test('login interrupts the workflow',async()=>{
 const p=await page(fixture+'<input type="password">');try{await assert.rejects(run(p),/লগইন/);assert.deepEqual(await p.evaluate(()=>clicked),[]);}finally{await p.close()}
});
test('existing OTP is a terminal state and never submits again',async()=>{
 const p=await page(fixture+'<form id="confirm-ticket-otp-form"><input></form>');try{assert.equal((await run(p)).state,'otp');assert.equal(await p.evaluate(()=>continued),0);}finally{await p.close()}
});
test('cancelling during a seat request prevents the next click and Continue',async()=>{
 const p=await page();try{await assert.rejects(p.evaluate(({journey,options})=>railwayBook(journey,options,{cancelled:()=>window.clicked.length>0}),{journey,options}),/থামানো/);assert.equal(await p.evaluate(()=>clicked.length),1);assert.equal(await p.evaluate(()=>continued),0);}finally{await p.close()}
});
test('validates count, exact seat uniqueness and coach',()=>{
 for(const bad of [{quantity:0},{quantity:5},{quantity:1.5},{mode:'selected',coach:'KA',seats:'KA-1,KA-1'},{mode:'selected',coach:'',seats:'KA-1,KA-2'}])assert.throws(()=>railwayBookingOptions({...options,...bad}));
});
test('existing manual selection is preserved and prevents additional reservations',async()=>{
 const p=await page();try{await p.evaluate(()=>{document.querySelector('.book-now-btn').click();document.querySelector('.btn-seat').classList.add('seat-selected')});await assert.rejects(run(p),/আগে থেকেই/);assert.deepEqual(await p.evaluate(()=>clicked),[]);assert.equal(await p.evaluate(()=>continued),0);}finally{await p.close()}
});
test('when OTP is skipped by the site, stops at passenger details without payment',async()=>{
 const p=await page(fixture.replace("f.id='confirm-ticket-otp-form'","f.id='psngr'"));try{const r=await run(p);assert.equal(r.state,'manual');assert.equal(await p.evaluate(()=>paid),0);}finally{await p.close()}
});
test('coach label parser strips counts while preserving coach identity',()=>{
 for(const name of ['KA - 12 Seat(s)',' ka – ১২ seats ','KA (12)','KA (12 Seats)'])assert.equal(railwayCoachName(name),'KA');
 assert.equal(railwayCoachName('KA-1 - 20 Seat(s)'),'KA-1');
 assert.equal(railwayCoachName('KA (AC) - 4 Seat(s)'),'KA (AC)');
 assert.equal(railwayCoachName('ক - ১২ Seat(s)'),'ক');
});
test('accepts pasted coach label when available count changes',async()=>{
 const p=await page();try{const r=await run(p,{...options,mode:'selected',coach:'KHA - 22 Seat(s)',seats:'KHA-1, KHA-2'});assert.deepEqual(r.seats,['KHA-1','KHA-2']);}finally{await p.close()}
});
test('unknown coach lists valid names without reserving seats',async()=>{
 const p=await page();try{await assert.rejects(run(p,{...options,coach:'GA'}),/উপলব্ধ কোচ: KA, KHA/);assert.deepEqual(await p.evaluate(()=>clicked),[]);}finally{await p.close()}
});
test('ambiguous coach labels do not fall back to a different coach',async()=>{
 const p=await page(fixture.replace('KHA - 3 Seat(s)','KA - 5 Seat(s)'));try{await assert.rejects(run(p,{...options,coach:'KA'}),/একাধিক কোচ/);assert.deepEqual(await p.evaluate(()=>clicked),[]);}finally{await p.close()}
});
