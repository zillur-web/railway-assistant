const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { railwayFill } = require('./extension/assistant');
const { validateJourney } = require('./railway');
let browser;
before(async () => { browser = await chromium.launch({headless:true}); });
after(async () => { await browser?.close(); });
const journey = {from:'Dhaka',to:'Chattogram',date:'2026-10-01',seatClass:'S_CHAIR'};
const fixture = `<!doctype html><html><body>
<input id="dest_from"><input id="dest_to"><input id="doj" readonly>
<ul class="ui-autocomplete"></ul>
<div id="ui-datepicker-div" style="display:none"><span class="ui-datepicker-month">September</span><span class="ui-datepicker-year">2026</span><a class="ui-datepicker-next">Next</a><table><tbody><tr><td data-month="9" data-year="2026"><a>1</a></td></tr></tbody></table></div>
<select id="choose_class"><option value="">Choose</option><option>S_CHAIR</option></select>
<button id="search">SEARCH TRAINS</button>
<script>
for(const id of ['dest_from','dest_to']) document.getElementById(id).addEventListener('input',e=>{
 const menu=document.querySelector('.ui-autocomplete'); menu.replaceChildren();
 if(!['Dhaka','Chattogram'].includes(e.target.value)) return;
 const li=document.createElement('li');li.className='ui-menu-item';li.textContent=e.target.value;
 li.onclick=()=>{e.target.dataset.selected=li.textContent;menu.replaceChildren()};menu.append(li);
});
document.getElementById('doj').onclick=()=>document.getElementById('ui-datepicker-div').style.display='block';
document.querySelector('.ui-datepicker-next').onclick=()=>document.querySelector('.ui-datepicker-month').textContent='October';
document.querySelector('td a').onclick=()=>{document.getElementById('doj').value='01-Oct-2026';document.getElementById('ui-datepicker-div').style.display='none'};
document.getElementById('choose_class').onchange=e=>e.target.dataset.changed='yes';
document.getElementById('search').onclick=()=>document.body.dataset.submitted='yes';
</script></body></html>`;
async function pageWith(body=fixture, url='https://eticket.railway.gov.bd/') {
 const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body}));await page.goto(url);return page;
}
test('fills exact stations, advances calendar, updates class; leaves search to user',async()=>{
 const p=await pageWith();try{const result=await p.evaluate(railwayFill,journey);assert.equal(result.ok,true,result.message);
 assert.equal(await p.locator('#dest_from').getAttribute('data-selected'),'Dhaka');
 assert.equal(await p.locator('#dest_to').getAttribute('data-selected'),'Chattogram');
 assert.equal(await p.locator('#doj').inputValue(),'01-Oct-2026');
 assert.equal(await p.locator('#choose_class').getAttribute('data-changed'),'yes');
 assert.equal(await p.locator('body').getAttribute('data-submitted'),null);
 }finally{await p.close()}
});
test('stops at terms dialog without accepting or filling',async()=>{
 const p=await pageWith(fixture+'<button>I AGREE</button>');try{const r=await p.evaluate(railwayFill,journey);assert.equal(r.ok,false);assert.match(r.message,/শর্তাবলি/);assert.equal(await p.locator('#dest_from').inputValue(),'')}finally{await p.close()}
});
test('clicks the anchor used by the live site legacy autocomplete markup',async()=>{
 const body=fixture.replace("li.onclick=()=>{e.target.dataset.selected=li.textContent;menu.replaceChildren()};menu.append(li);", "const anchor=document.createElement('a');anchor.textContent=li.textContent;li.replaceChildren(anchor);anchor.onclick=()=>{e.target.dataset.selected=anchor.textContent;menu.replaceChildren()};menu.append(li);");
 const p=await pageWith(body);try{const r=await p.evaluate(railwayFill,journey);assert.equal(r.ok,true,r.message);assert.equal(await p.locator('#dest_from').getAttribute('data-selected'),'Dhaka');assert.equal(await p.locator('#dest_to').getAttribute('data-selected'),'Chattogram')}finally{await p.close()}
});
test('activates readonly stations through the site mouseenter handler before focus',async()=>{
 const body=fixture.replace('<input id="dest_from"><input id="dest_to">','<input id="dest_from" readonly><input id="dest_to" readonly>')+`<script>
 const from=document.getElementById('dest_from'),to=document.getElementById('dest_to');
 from.addEventListener('mouseenter',()=>{setTimeout(()=>{from.readOnly=false;to.readOnly=false},50)});
 for(const input of [from,to]) {
   input.addEventListener('focus',()=>{input.dataset.ready=String(!input.readOnly)});
   input.addEventListener('input',()=>{if(input.dataset.ready!=='true')document.querySelector('.ui-autocomplete').replaceChildren()});
 }
 </script>`;
 const p=await pageWith(body);try{
   const r=await p.evaluate(railwayFill,journey);assert.equal(r.ok,true,r.message);
   assert.equal(await p.locator('#dest_from').getAttribute('data-ready'),'true');
   assert.equal(await p.locator('#dest_to').getAttribute('data-ready'),'true');
 }finally{await p.close()}
});
test('rejects disabled date with no false success',async()=>{
 const p=await pageWith(fixture.replace('<a>1</a>','<span>1</span>').replace("document.querySelector('td a').onclick", "document.querySelector('td span').onclick"));try{const r=await p.evaluate(railwayFill,journey);assert.equal(r.ok,false);assert.match(r.message,/খোলা নেই/)}finally{await p.close()}
});
test('rejects unknown station and releases busy flag',async()=>{
 const p=await pageWith();try{const r=await p.evaluate(railwayFill,{...journey,from:'Unknown'});assert.equal(r.ok,false);assert.match(r.message,/তালিকা প্রস্তুত হয়নি/);assert.equal(await p.evaluate(()=>globalThis.__railwayFilling),false)}finally{await p.close()}
});
test('rejects other origins',async()=>{
 const p=await pageWith(fixture,'https://example.com/');try{assert.equal((await p.evaluate(railwayFill,journey)).ok,false)}finally{await p.close()}
});
test('validates dates, class and stations',()=>{
 assert.deepEqual(validateJourney(journey,'2026-09-30'),journey);
 for(const change of [{date:'2026-02-30'},{date:'2026-09-29'},{from:'Chattogram'},{seatClass:'invalid'},{from:42}]) assert.throws(()=>validateJourney({...journey,...change},'2026-09-30'));
});
