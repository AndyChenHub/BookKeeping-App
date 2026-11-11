# BookKeeping

A simple, Apple-inspired bookkeeping app designed for effortless daily use on both **Windows PC** and **Phone (iPhone / Android)** — backed by a single shared local server, standardized English Excel workbooks, automatic daily backups, and one-tap restore.

---

## 🚀 Quick Start (Using the `.exe`)

1. Double-click **`release\BookKeeping.exe`** (you can also pin it to your Taskbar or create a Desktop shortcut).
2. The app starts its built-in server automatically and opens the ledger window.
3. If Windows Defender Firewall prompts you on first launch, check **Private networks** and click **Allow access** so your phone can connect over Wi-Fi.

---

## 📱 Using on Computer & Phone Together

Both your computer and phone connect to the **same server** running inside `BookKeeping.exe`, so entries and edits made on either device appear on both immediately:

1. Connect your phone to the **same Wi-Fi** as the computer.
2. Click **Connect Phone (手机扫码)** at the top right of the app on your computer.
3. Open your phone's **Camera** and point it at the QR code.
4. *Optional:* On iPhone Safari, tap **Share → Add to Home Screen** to launch BookKeeping anytime like a native iOS app.

---

## ✨ Key Features

- **Senior-Friendly Apple Design:** Clean cards, high-contrast typography, large touch targets, and an uncluttered 3-step entry flow.
- **1-Tap Language Switch (`中文 | EN`):** Switch the screen between Chinese and English anytime. Regardless of screen language, Excel spreadsheets are always saved cleanly in English.
- **View, Edit & Delete Records:** Browse monthly totals, filter by Cash or Card, search entries, and fix or delete any past record directly in the app (automatically updating the `.xlsx` file).
- **Invoices & PDF Generation:**
  - Create a professional Tax Invoice from any single record (1 tap) or combine multiple records onto one invoice.
  - Dedicated **Invoices (`发票`)** page to track **Paid / Unpaid** totals, toggle Paid/Unpaid status in one click, modify line items, delete invoices, configure Business & Bank details, and export/print clean A4 **PDF** invoices on both PC and Phone.
- **Automatic Daily Backups & Easy Restore:**
  - Automatically backs up `config.xlsx` and all monthly Excel books every day into `data/backups/`.
  - Create a manual backup anytime with **Back Up Now**.
  - Restore any previous day with one click (**Restore** automatically creates a safety backup of your current data first so nothing is ever lost).

---

## 📂 Data & Excel Files

By default, data is stored in the `data/` folder (or `BookKeepingData/` when moving the portable `.exe` elsewhere):
- `config.xlsx` — Saved Items (Mandarin ↔ English), Locations, People/Agents, Business Invoice Profile, and settings.
- `YYYY/YYYYMMBook.xlsx` — Monthly transaction ledgers (e.g., `2026/202611Book.xlsx`).
- `Invoices.xlsx` — All created invoices, Paid/Unpaid status, and line items.
- `backups/` — Timestamped daily, manual, and pre-restore snapshots.

*Tip: Close any open `.xlsx` file in Microsoft Excel before saving or restoring inside the app so Windows does not lock the file.*

---

## 🛠️ Developer Commands

```bash
# Start in development mode
npm run dev

# Type-check & build web + Electron bundles
npm run lint
npm run build

# Package standalone Windows executable (outputs release/BookKeeping.exe)
npm run electron:package
```
