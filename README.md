# Railway Ticket Assistant (Windows)

## Chrome extension (no server needed)
Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select the `extension` folder in this project. See `extension/README.md` for Bengali instructions. Version 1.1 fills the journey form, selects a specified train and class, chooses a requested number of random or exact seats, and continues to the OTP/passenger-details handoff. Login, CAPTCHA, OTP entry and payment remain manual. A form-only mode is also available.

Development verification: `npm test` runs browser fixture tests. These verify automation behavior, not live ticket availability or payment.

## Install
1. Install Node.js LTS if it is not already installed.
2. Extract this folder, for example into:
   C:\laragon\www\railway-ticket-assistant
3. Open Laragon Terminal in this folder.
4. Run:
   npm install
5. Then run:
   npm run install-browser
6. Start:
   npm start
7. Open:
   http://localhost:3000

## What it does
- Provides a simple From / To / Date / Class control panel.
- Opens the official Bangladesh Railway e-ticket website in Chromium.
- Attempts basic form filling when compatible fields are available.
- Leaves CAPTCHA/security verification and final purchase/payment to you.

The Railway website can change its page structure, so selectors may require updates later.
