# Roshan Cloths Store — Offline-first Web App

## Features
- Dashboard with today's sales, products, stock, customers and low-stock alerts
- Product inventory: name, code, category, size, color, purchase/selling prices and stock
- Sales and billing: line items, discounts, payment method, stock deduction, printable receipt
- Customer records
- Sales and estimated gross-profit reports
- JSON backup/restore and sales CSV export
- IndexedDB local persistence and service-worker app shell caching
- Mobile responsive layout and Home Screen web app manifest

## Run locally
A service worker requires localhost or HTTPS. Do not open `index.html` directly with `file://`.

If Python 3 is installed, open Terminal, `cd` into this folder and run:
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000` on the Mac. For iPhone testing, deploy to an HTTPS static host or run a LAN server and use your Mac's local IP (service-worker installation generally needs HTTPS on the iPhone; localhost is the exception).

## iPhone setup
Deploy the folder to an HTTPS static hosting provider. Open the URL in Safari, wait for the app to load once, then Share → Add to Home Screen. Launch it from the new icon. Data stays in that browser's IndexedDB and is not automatically synced to other devices. Export JSON backups regularly.

## Important data notes
- This is a starter app, not a certified accounting/GST package.
- Profit is estimated from saved product purchase cost and excludes expenses, returns and tax.
- No automatic cloud backup, account login, multi-device sync or GST invoice compliance is included.
- If a product's purchase price changes later, past sale profit calculations use the current saved product cost. Keep this in mind for accounting.
- Browser storage can be cleared; export backups frequently.
