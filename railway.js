const CLASSES = ['AC_B', 'AC_S', 'SNIGDHA', 'F_BERTH', 'F_SEAT', 'F_CHAIR', 'S_CHAIR', 'SHOVAN', 'SHULOV', 'AC_CHAIR'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function dhakaToday(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
function validateJourney(body = {}, today = dhakaToday()) {
  if (!body || typeof body !== 'object') throw new Error('যাত্রার তথ্য দিন।');
  const { from, to, date, seatClass } = body;
  if ([from, to].some(v => typeof v !== 'string' || !v.trim() || v.trim().length > 40 || /[\x00-\x1f]/.test(v))) throw new Error('সঠিক From ও To স্টেশন দিন (সর্বোচ্চ ৪০ অক্ষর)।');
  if (from.trim().toLowerCase() === to.trim().toLowerCase()) throw new Error('দুটি আলাদা স্টেশন নির্বাচন করুন।');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('সঠিক যাত্রার তারিখ দিন।');
  if (date < today) throw new Error('যাত্রার তারিখ অতীতে হতে পারে না।');
  if (!CLASSES.includes(seatClass)) throw new Error('একটি সিট ক্লাস নির্বাচন করুন।');
  return { from: from.trim(), to: to.trim(), date, seatClass };
}
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function station(page, selector, value) {
  const input = page.locator(selector);
  await input.click();
  await input.fill(value);
  await page.locator('.ui-autocomplete:visible .ui-menu-item').filter({ hasText: new RegExp(`^\\s*${escapeRegex(value)}\\s*$`, 'i') }).first().click();
  if ((await input.inputValue()).toLowerCase() !== value.toLowerCase()) throw new Error('Station selection did not match.');
}
async function journeyDate(page, value) {
  const [year, month, day] = value.split('-').map(Number);
  await page.locator('#doj').click();
  const calendar = page.locator('#ui-datepicker-div');
  await calendar.waitFor({ state: 'visible' });
  for (let i = 0; i < 12; i++) {
    const shownMonth = (await calendar.locator('.ui-datepicker-month').innerText()).trim();
    const shownYear = Number(await calendar.locator('.ui-datepicker-year').innerText());
    if (shownMonth === MONTHS[month - 1] && shownYear === year) {
      await calendar.locator(`td[data-month="${month - 1}"][data-year="${year}"] a`).filter({ hasText: new RegExp(`^${day}$`) }).click();
      return;
    }
    const shown = shownYear * 12 + MONTHS.indexOf(shownMonth);
    const next = calendar.locator(shown < year * 12 + month - 1 ? '.ui-datepicker-next' : '.ui-datepicker-prev');
    if ((await next.getAttribute('class') || '').includes('ui-state-disabled')) break;
    await next.click();
  }
  throw new Error('Date is outside the calendar booking window.');
}
async function fillSearch(page, journey) {
  await page.locator('#dest_from').waitFor({ state: 'visible', timeout: 15000 });
  if (await page.getByRole('button', { name: 'I AGREE', exact: true }).isVisible()) {
    return { state: 'action_required', message: 'রেলওয়ের ব্রাউজারে শর্তাবলি পড়ে সম্মতি দিন। এরপর এখানে “আবার চালান” চাপুন।', fields: [] };
  }
  const fields = [];
  for (const [name, action] of [
    ['From', () => station(page, '#dest_from', journey.from)],
    ['To', () => station(page, '#dest_to', journey.to)],
    ['Date', () => journeyDate(page, journey.date)],
    ['Class', () => page.locator('#choose_class').selectOption(journey.seatClass)]
  ]) {
    try { await action(); fields.push({ name, ok: true }); }
    catch { fields.push({ name, ok: false }); return { state: 'action_required', fields, message: `${name} পূরণ করা যায়নি। স্টেশনের বানান, তারিখের প্রাপ্যতা বা স্ক্রিনে যাচাইয়ের ধাপ দেখুন। নিজে ফর্ম পূরণ করে Search Trains চাপতে পারেন, অথবা এখানে আবার চালান।` }; }
  }
  await page.getByRole('button', { name: 'SEARCH TRAINS', exact: true }).click();
  return { state: 'search_submitted', fields, message: 'Search Trains চাপা হয়েছে। রেলওয়ের ব্রাউজারে ফলাফল বা যাচাইয়ের বার্তা দেখুন। ট্রেন ও সিট বেছে লগইন/OTP এবং পেমেন্ট সম্পন্ন করুন।' };
}
module.exports = { validateJourney, fillSearch, dhakaToday, CLASSES };
