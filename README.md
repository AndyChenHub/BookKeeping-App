# Business Transaction Digitizer - Dashboard & Configuration Guide

This guide explains how to manage the data and configuration for your application.

## 📂 Data Structure
All your data is stored in the `data/` folder:
- **`config.xlsx`**: Contains your Locations, Agents, and Descriptions (Mandarin/English mappings).
- **`YYYYMMBook.xlsx`**: Monthly transaction logs (e.g., `202602Book.xlsx`).

---

## 🛠️ Managing Configuration (`config.xlsx`)
You can manage your dropdowns and descriptions in two ways:

### 1. Through the App (Recommended)
Use the **"+ 新增 Add"** buttons within the application to add new:
- **Locations** (地点)
- **Agents** (经办人)
- **Descriptions** (描述内容)

Changes made through the app are saved instantly to `config.xlsx`.

### 2. Manually Editing Excel
You can open `data/config.xlsx` in Microsoft Excel to make bulk changes:
- **Locations Sheet**: Add or remove names in the first column.
- **Agents Sheet**: Add or remove names in the first column.
- **Descriptions Sheet**: Column A is Mandarin (ZH), Column B is English (EN).

*Note: Close Excel before running the app to avoid "File in use" errors.*

---

## 📊 Viewing the Dashboard (Monthly Books)
Each month, a new Excel file is created (e.g., `202602Book.xlsx`).
- These files contain all transactions saved during that month.
- You can open these files in Excel to create charts, pivot tables, or summaries.
- **Appending Data**: The app is designed to **append** new transactions to the end of the existing list. It will not overwrite your previous entries.

---

## 💻 Making Changes to the App
If you want to modify the layout or logic:
1. **Frontend**: Edit `src/App.tsx` for UI changes.
2. **Backend**: Edit `server.ts` for file handling or API logic.
3. **Styles**: Use Tailwind CSS classes directly in the components.

To run the app after making changes:
```bash
npm run local
```
or double-click **`run.bat`**.
