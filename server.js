const express = require('express');
const path = require('path');
const { chromium } = require('playwright');
const { validateJourney, fillSearch } = require('./railway');
function createApp(launch = () => chromium.launch({ headless: false })) {
  const app = express();
  let browser, page, busy = false;
  app.use((req, res, next) => {
    if (!['127.0.0.1', 'localhost'].includes(req.hostname)) return res.sendStatus(403);
    if (req.method === 'POST' && req.get('origin') && req.get('origin') !== 'http://' + req.get('host')) return res.sendStatus(403);
    next();
  });
  app.use(express.json({ limit: '4kb' }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.post('/start', async (req, res) => {
    let journey;
    try { journey = validateJourney(req.body); }
    catch (error) { return res.status(422).json({ ok: false, message: error.message }); }
    if (busy) return res.status(409).json({ ok: false, message: 'একটি কাজ চলছে। একটু অপেক্ষা করুন।' });
    busy = true;
    try {
      if (!browser?.isConnected()) { browser = await launch(); page = null; }
      if (!page || page.isClosed()) page = await browser.newPage({ viewport: null });
      page.setDefaultTimeout(6000);
      if (!req.body.resume || !page.url().startsWith('https://eticket.railway.gov.bd/')) {
        await page.goto('https://eticket.railway.gov.bd/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      }
      await page.bringToFront();
      res.json({ ok: true, ...await fillSearch(page, journey) });
    } catch (error) {
      res.status(500).json({ ok: false, message: /Executable doesn't exist/.test(error.message)
        ? 'ব্রাউজার ইনস্টল করুন: npm run install-browser।'
        : 'কাজটি শেষ হয়নি। খোলা ব্রাউজারে সংযোগ বা যাচাইয়ের ধাপ দেখুন, তারপর আবার চেষ্টা করুন।', detail: error.message });
    } finally { busy = false; }
  });
  app.use((error, req, res, next) => res.status(400).json({ ok: false, message: 'অনুরোধটি সঠিক নয়।' }));
  return { app, close: async () => { if (browser) await browser.close(); } };
}
if (require.main === module) {
  const { app, close } = createApp();
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, '127.0.0.1', () => console.log('Railway Ticket Assistant: http://127.0.0.1:' + port));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await close(); server.close(() => process.exit(0)); });
}
module.exports = { createApp };

