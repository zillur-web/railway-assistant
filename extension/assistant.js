// Self-contained: Chrome serializes this function into the active tab's isolated world.
async function railwayFill(journey) {
  if (location.origin !== 'https://eticket.railway.gov.bd') return {ok:false,message:'রেলওয়ের ওয়েবসাইটে এই extension ব্যবহার করুন।'};
  if (globalThis.__railwayFilling) return {ok:false,message:'আগের কাজ চলছে। একটু অপেক্ষা করুন।'};
  globalThis.__railwayFilling = true;
  const visible = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const wait = async (find, message) => {
    const deadline = Date.now() + 6500;
    while (Date.now() < deadline) { const value = find(); if (value) return value; await new Promise(r => setTimeout(r, 100)); }
    throw new Error(message);
  };
  const norm = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const station = async (id, value) => {
    const input = document.getElementById(id);
    if (!visible(input)) throw new Error('রেলওয়ের Home পেজের সার্চ ফর্ম খুলুন।');
    // The site's From mouseenter handler unlocks BOTH station inputs.
    // focus()/click() alone do not dispatch mouseenter.
    input.dispatchEvent(new MouseEvent('mouseenter', {view:window}));
    await wait(() => !input.readOnly && !input.disabled, 'স্টেশন ফিল্ড চালু হয়নি। From ঘরে মাউস নিয়ে ক্লিক করুন, তারপর আবার চেষ্টা করুন।');
    input.focus(); input.click();
    // Explicitly initialize the site's focus listener even if focus did not move.
    input.dispatchEvent(new FocusEvent('focus'));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new KeyboardEvent('keydown', {key:value.at(-1),bubbles:true}));
    input.dispatchEvent(new Event('input', {bubbles:true}));
    let lastSearch=0, attempts=0, sawSuggestions=false;
    const option = await wait(() => {
      const items=[...document.querySelectorAll('.ui-autocomplete .ui-menu-item')].filter(visible);
      sawSuggestions ||= items.length>0;
      const exact=items.find(el=>norm(el.textContent)===norm(value));
      if(exact)return exact;
      // Retry the local station widget after its source loads. No refresh loop
      // or direct network requests; repeated identical input alone is ignored
      // by jQuery UI once its previous search term has been recorded.
      if(attempts<4 && Date.now()-lastSearch>=1200){
        lastSearch=Date.now();attempts++;
        document.dispatchEvent(new CustomEvent('railway-assistant:station-search',{detail:{id,value}}));
      }
      return null;
    }, 'স্টেশনের তালিকা প্রস্তুত হয়নি। '+(id==='dest_from'?'From':'To')+' ঘরে নিজে '+value+' লিখে তালিকা আসে কি না দেখুন; তারপর আবার চালান।').catch(error=>{
      if(sawSuggestions)throw new Error(value+' নামটি খোলা স্টেশন তালিকায় মেলেনি। তালিকায় দেখানো পুরো নাম ব্যবহার করুন।');
      throw error;
    });
    // The live site uses the older jQuery UI <li><a> markup, while newer
    // versions use .ui-menu-item-wrapper. Click the actual selectable child.
    (option.querySelector('.ui-menu-item-wrapper, a') || option).click();
    input.dispatchEvent(new Event('change', {bubbles:true}));
    await wait(()=>!visible(option), 'স্টেশন নির্বাচন নিশ্চিত হয়নি। তালিকা থেকে স্টেশনটি নিজে বেছে নিন।');
    if (norm(input.value) !== norm(value)) throw new Error('স্টেশন নির্বাচন যাচাই করা যায়নি।');
  };
  try {
    if (!journey || [journey.from,journey.to,journey.date,journey.seatClass].some(v => typeof v !== 'string' || !v.trim())) throw new Error('যাত্রার সব তথ্য দিন।');
    if (norm(journey.from) === norm(journey.to)) throw new Error('দুটি আলাদা স্টেশন দিন।');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(journey.date) || !Number.isFinite(Date.parse(journey.date)) || new Date(journey.date).toISOString().slice(0,10) !== journey.date) throw new Error('সঠিক তারিখ দিন।');
    if ([...document.querySelectorAll('button')].some(el => visible(el) && norm(el.textContent) === 'i agree')) throw new Error('রেলওয়ের শর্তাবলি পড়ে সম্মতি দিন। তারপর extension থেকে আবার চেষ্টা করুন।');
    await station('dest_from', journey.from);
    await station('dest_to', journey.to);
    // Station selection schedules date limits (100ms) and calendar focus (150ms).
    // Allow those site callbacks to finish before choosing a date.
    await new Promise(r => setTimeout(r, 250));
    const dateInput = document.getElementById('doj');
    if (!visible(dateInput)) throw new Error('তারিখের ফিল্ড পাওয়া যায়নি।');
    dateInput.focus(); dateInput.click();
    const calendar = await wait(() => {const el = document.getElementById('ui-datepicker-div');return visible(el) && el;}, 'ক্যালেন্ডার খুলতে পারেনি। তারিখ নিজে নির্বাচন করুন।');
    const [year, month, day] = journey.date.split('-').map(Number);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    let selected = false;
    for (let i = 0; i < 12; i++) {
      const shownMonth = calendar.querySelector('.ui-datepicker-month')?.textContent.trim();
      const shownYear = Number(calendar.querySelector('.ui-datepicker-year')?.textContent);
      const monthIndex = months.indexOf(shownMonth);
      if (monthIndex < 0 || !shownYear) throw new Error('ক্যালেন্ডারের ধরন বদলেছে। তারিখ নিজে নির্বাচন করুন।');
      if (monthIndex === month - 1 && shownYear === year) {
        const link = [...calendar.querySelectorAll('td[data-month="' + (month-1) + '"][data-year="' + year + '"] a')].find(el => el.textContent.trim() === String(day));
        if (!link) throw new Error('এই তারিখ বুকিংয়ের জন্য খোলা নেই। ক্যালেন্ডারের উপলব্ধ তারিখ বেছে নিন।');
        link.click(); selected = true; break;
      }
      const next = calendar.querySelector(shownYear * 12 + monthIndex < year * 12 + month - 1 ? '.ui-datepicker-next' : '.ui-datepicker-prev');
      if (!next || next.classList.contains('ui-state-disabled')) break;
      next.click();
      await new Promise(r => setTimeout(r, 100));
    }
    if (!selected || !dateInput.value) throw new Error('তারিখ নির্বাচন করা যায়নি। ক্যালেন্ডারের উপলব্ধ তারিখ বেছে নিন।');
    const seat = document.getElementById('choose_class');
    if (!seat || ![...seat.options].some(o => o.value === journey.seatClass)) throw new Error('এই সিট ক্লাস পাওয়া যায়নি।');
    seat.value = journey.seatClass;
    seat.dispatchEvent(new Event('change', {bubbles:true}));
    seat.dispatchEvent(new Event('input', {bubbles:true}));
    return {ok:true,message:'ফর্ম পূরণ হয়েছে। তথ্য মিলিয়ে রেলওয়ের Search Trains চাপুন। এরপর ট্রেন/সিট নির্বাচন ও পেমেন্ট সম্পন্ন করুন।'};
  } catch (error) { return {ok:false,message:error.message}; }
  finally { globalThis.__railwayFilling = false; }
}
if (typeof module !== 'undefined') module.exports = {railwayFill};
