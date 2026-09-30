const $ = id => document.getElementById(id);
const ids = ['from', 'to', 'date', 'seatClass'];
const bookingIds = ['train', 'quantity', 'mode', 'coach', 'seats'];
const status = $('status');
const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
$('date').min = today;
const updateMode=()=>{const exact=$('mode').value==='selected';$('seatFields').hidden=!exact;$('coachHint').textContent=exact?'আবশ্যক':'খালি = যেকোনো কোচ';};
$('mode').onchange=updateMode;
chrome.storage.local.get(['journey','booking']).then(({journey,booking}) => {
  if (journey) for (const id of ids) if (typeof journey[id] === 'string') $(id).value = journey[id];
  if (booking) for (const id of bookingIds) if (booking[id]!==undefined) $(id).value = String(booking[id]);
  updateMode();
}).catch(() => {});
$('swap').onclick = () => { const previous = $('from').value; $('from').value = $('to').value; $('to').value = previous; };
$('open').onclick = () => chrome.tabs.create({url:'https://eticket.railway.gov.bd/'});
async function start(bookingMode) {
  if (!$('journey').reportValidity()) return;
  $('fill').disabled = true;
  $('fillOnly').disabled = true;
  status.className = '';
  status.textContent = 'ফর্ম পূরণ হচ্ছে…';
  try {
    const journey = Object.fromEntries(ids.map(id => [id, $(id).value.trim()]));
    if (journey.from.toLowerCase() === journey.to.toLowerCase()) throw new Error('দুটি আলাদা স্টেশন দিন।');
    if (journey.date < today) throw new Error('আজ বা ভবিষ্যতের তারিখ দিন।');
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.url || new URL(tab.url).origin !== 'https://eticket.railway.gov.bd') throw new Error('আগে রেলওয়ের ওয়েবসাইটের ট্যাব খুলুন, তারপর extension চাপুন।');
    await chrome.storage.local.set({journey});
    await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['autocomplete-bridge.js']});
    if (bookingMode) {
      const booking=Object.fromEntries(bookingIds.map(id=>[id,$(id).value.trim()]));
      railwayBookingOptions(booking);
      await chrome.storage.local.set({booking});
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['assistant.js','booking.js']});
      const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:(j,b)=>railwayStart(j,b),args:[journey,booking]});
      if(!result?.started)throw new Error(result?.message || 'সহকারী শুরু হয়নি।');
      status.textContent='সহকারী চলছে। পপআপ বন্ধ হলেও রেলওয়ের ট্যাবে অগ্রগতি দেখাবে। পেজ refresh করলে কাজ থেমে যাবে।';
      return;
    }
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['assistant.js']});
    const results = await chrome.scripting.executeScript({target:{tabId:tab.id},func:j=>globalThis.__railwayJob?.running?{ok:false,message:'বুকিং সহকারী চলছে। আগে সাইটের প্যানেল থেকে থামান।'}:railwayFill(j),args:[journey]});
    const result = results[0]?.result;
    if (!result) throw new Error('পেজ বদলেছে। Home পেজ খুলে আবার চেষ্টা করুন।');
    status.className = result.ok ? 'success' : 'error';
    status.textContent = result.message;
  } catch (error) { status.className = 'error'; status.textContent = error.message; }
  finally { $('fill').disabled = false; $('fillOnly').disabled=false; }
}
$('journey').onsubmit=event=>{event.preventDefault();start(true);};
$('fillOnly').onclick=()=>start(false);
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local'&&changes.bookingStatus?.newValue){const value=changes.bookingStatus.newValue;status.textContent=value.message;status.className=value.state==='stopped'?'error':value.state==='otp'?'success':'';}
});
