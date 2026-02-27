import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { fileURLToPath } from "url";
import open from "open";

export async function startServer(customPort?: number, customDataDir?: string) {
  const app = express();
  const PORT = Number(customPort || process.env.PORT || 3000);

  app.use(express.json());

  const DATA_DIR = customDataDir || process.env.DATA_DIR || path.join(process.cwd(), "data");
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const CONFIG_PATH = path.join(DATA_DIR, "config.xlsx");

  // Initialize default files if missing
  async function initDefaults() {
    if (!fs.existsSync(CONFIG_PATH)) {
      const workbook = new ExcelJS.Workbook();
      
      const locSheet = workbook.addWorksheet("Locations");
      locSheet.columns = [{ header: "Name", key: "name" }];

      const agentSheet = workbook.addWorksheet("Agents");
      agentSheet.columns = [{ header: "Name", key: "name" }];

      const settingsSheet = workbook.addWorksheet("Settings");
      settingsSheet.columns = [
        { header: "Key", key: "key" },
        { header: "Value", key: "value" }
      ];
      settingsSheet.addRow({ key: "booksPath", value: DATA_DIR });

      const descSheet = workbook.addWorksheet("Descriptions");
      descSheet.columns = [
        { header: "Mandarin", key: "zh" },
        { header: "English", key: "en" },
      ];
      descSheet.addRows([
        { zh: "洗衣机", en: "Washing Machine" },
        { zh: "电灯", en: "Lights" },
        { zh: "烘干机", en: "Dryer" },
        { zh: "维修", en: "Repair" },
        { zh: "零件", en: "Parts" },
        { zh: "人工", en: "Labour" },
        { zh: "材料", en: "Materials" },
        { zh: "现金", en: "Cash" },
        { zh: "刷卡", en: "Card" },
      ]);

      await workbook.xlsx.writeFile(CONFIG_PATH);
    }
  }

  await initDefaults();

  // API Routes
  app.get("/api/config", async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(CONFIG_PATH);
      
      const locations = [];
      const locSheet = workbook.getWorksheet("Locations");
      if (locSheet) {
        locSheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) locations.push(row.getCell(1).value);
        });
      }

      const agents = [];
      const agentSheet = workbook.getWorksheet("Agents");
      if (agentSheet) {
        agentSheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) agents.push(row.getCell(1).value);
        });
      }

      const descriptions = {};
      const descSheet = workbook.getWorksheet("Descriptions");
      if (descSheet) {
        descSheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) {
            const zh = row.getCell(1).value?.toString();
            const en = row.getCell(2).value?.toString();
            if (zh && en) descriptions[zh] = en;
          }
        });
      }

      let booksPath = DATA_DIR;
      const settingsSheet = workbook.getWorksheet("Settings");
      if (settingsSheet) {
        settingsSheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1 && row.getCell(1).value === "booksPath") {
            booksPath = row.getCell(2).value?.toString() || DATA_DIR;
          }
        });
      }

      res.json({ locations, agents, descriptions, booksPath });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/transactions", async (req, res) => {
    try {
      const { date, paymentMethod, location, agent, description, amount, gst, total } = req.body;
      
      const transactionDate = new Date(date);
      const year = format(transactionDate, "yyyy");
      const fileName = `${format(transactionDate, "yyyyMM")}Book.xlsx`;
      
      // Get booksPath from config
      const configWorkbook = new ExcelJS.Workbook();
      await configWorkbook.xlsx.readFile(CONFIG_PATH);
      let booksPath = DATA_DIR;
      const settingsSheet = configWorkbook.getWorksheet("Settings");
      if (settingsSheet) {
        settingsSheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1 && row.getCell(1).value === "booksPath") {
            booksPath = row.getCell(2).value?.toString() || DATA_DIR;
          }
        });
      }

      const yearDir = path.join(booksPath, year);
      if (!fs.existsSync(yearDir)) {
        fs.mkdirSync(yearDir, { recursive: true });
      }

      const filePath = path.join(yearDir, fileName);

      const workbook = new ExcelJS.Workbook();
      let sheet;

      if (fs.existsSync(filePath)) {
        await workbook.xlsx.readFile(filePath);
        sheet = workbook.getWorksheet("Transactions") || workbook.addWorksheet("Transactions");
      } else {
        sheet = workbook.addWorksheet("Transactions");
      }

      // Ensure columns are defined for consistent mapping
      sheet.columns = [
        { header: "Date", key: "date", width: 15 },
        { header: "Payment Method", key: "paymentMethod", width: 15 },
        { header: "Location", key: "location", width: 20 },
        { header: "Agent", key: "agent", width: 20 },
        { header: "Description", key: "description", width: 30 },
        { header: "Parts Costs", key: "amount", width: 15 },
        { header: "GST", key: "gst", width: 12 },
        { header: "Total", key: "total", width: 12 },
      ];

      sheet.addRow({
        date: format(transactionDate, "yyyy-MM-dd"),
        paymentMethod,
        location,
        agent,
        description,
        amount: parseFloat(amount) || 0,
        gst: parseFloat(gst) || 0,
        total: parseFloat(total) || 0,
      });

      await workbook.xlsx.writeFile(filePath);
      res.json({ success: true, file: fileName });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add new config items
  app.post("/api/config/add", async (req, res) => {
    try {
      const { type, value, translation } = req.body;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(CONFIG_PATH);
      
      if (type === 'description') {
        const sheet = workbook.getWorksheet("Descriptions");
        sheet.addRow([value, translation]);
      } else if (type === 'settings') {
        const sheet = workbook.getWorksheet("Settings");
        let found = false;
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1 && row.getCell(1).value === "booksPath") {
            row.getCell(2).value = value;
            found = true;
          }
        });
        if (!found) {
          sheet.addRow(["booksPath", value]);
        }
      } else {
        const sheetName = type === 'location' ? "Locations" : "Agents";
        const sheet = workbook.getWorksheet(sheetName);
        sheet.addRow([value]);
      }
      
      await workbook.xlsx.writeFile(CONFIG_PATH);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && !process.env.ELECTRON_RUN) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Use __dirname equivalent for ES modules to find dist folder
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const distPath = path.join(__dirname, "dist");
    
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Server running on ${url}`);
    
    // Open browser if --open flag is present
    if (process.argv.includes('--open')) {
      open(url);
    }
  });

  return app;
}

// Only start if run directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('server.ts')) {
  startServer();
}
