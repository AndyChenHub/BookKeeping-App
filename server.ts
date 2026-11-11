import express, { type Request, type Response } from "express";
import http from "http";
import os from "os";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";
import QRCode from "qrcode";
import { format, isValid, parseISO } from "date-fns";

export interface StartServerOptions {
  port?: number;
  dataDir?: string;
  distDir?: string;
  isElectron?: boolean;
  onPickFolder?: () => Promise<string | null>;
  onOpenPath?: (targetPath: string) => Promise<void>;
}

export interface ServerHandle {
  app: express.Express;
  server: http.Server;
  port: number;
  dataDir: string;
  close: () => Promise<void>;
}

export interface TransactionRecord {
  id: string;
  date: string;
  paymentMethod: string;
  location: string;
  agent: string;
  description: string;
  amount: number;
  gst: number;
  total: number;
}

export interface BackupManifest {
  id: string;
  createdAt: string;
  dateKey: string;
  reason: "daily" | "manual" | "safety";
  bookCount: number;
  recordCount: number;
  totalAmount: number;
}

class AsyncMutex {
  private promise: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.promise;
    this.promise = prev.then(() => next);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

function generateId(): string {
  return `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cellToString(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (val instanceof Date) return isValid(val) ? format(val, "yyyy-MM-dd") : "";
  if (typeof val === "object") {
    if ("text" in val && typeof val.text === "string") return val.text.trim();
    if ("richText" in val && Array.isArray(val.richText)) {
      return val.richText.map((part) => part.text || "").join("").trim();
    }
    if ("result" in val && val.result !== undefined && val.result !== null) {
      return String(val.result).trim();
    }
  }
  return String(val).trim();
}

function cellToNumber(val: ExcelJS.CellValue): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "object" && "result" in val && typeof val.result === "number") {
    return Number.isFinite(val.result) ? val.result : 0;
  }
  const cleaned = cellToString(val).replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cellToDateString(val: ExcelJS.CellValue, fallbackMonth?: string): string {
  if (val instanceof Date && isValid(val)) {
    return format(val, "yyyy-MM-dd");
  }
  const raw = cellToString(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const parsed = new Date(raw);
  if (raw && isValid(parsed)) {
    return format(parsed, "yyyy-MM-dd");
  }
  if (fallbackMonth && /^\d{4}-\d{2}$/.test(fallbackMonth)) {
    return `${fallbackMonth}-01`;
  }
  return format(new Date(), "yyyy-MM-dd");
}

function isFileBusyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as NodeJS.ErrnoException).code;
  const msg = String((err as Error).message || "");
  return (
    code === "EBUSY" ||
    code === "EPERM" ||
    code === "EACCES" ||
    msg.includes("EBUSY") ||
    msg.includes("resource busy or locked")
  );
}

async function safeWriteWorkbook(workbook: ExcelJS.Workbook, targetPath: string): Promise<void> {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Check if target file is currently locked by Microsoft Excel on Windows
  if (fs.existsSync(targetPath)) {
    try {
      const fd = fs.openSync(targetPath, "r+");
      fs.closeSync(fd);
    } catch (err) {
      if (isFileBusyError(err)) {
        const busyErr = new Error(
          `Excel file "${path.basename(targetPath)}" is currently open in another program. Please close Microsoft Excel and try again.`
        ) as NodeJS.ErrnoException;
        busyErr.code = "EXCEL_FILE_OPEN";
        throw busyErr;
      }
    }
  }

  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await workbook.xlsx.writeFile(tmpPath);
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        fs.renameSync(tmpPath, targetPath);
        return;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
      }
    }
    // Fallback copy if rename across volume or transient lock
    fs.copyFileSync(tmpPath, targetPath);
    fs.unlinkSync(tmpPath);
    if (lastErr && !fs.existsSync(targetPath)) {
      throw lastErr;
    }
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore cleanup error
      }
    }
    if (isFileBusyError(err)) {
      const busyErr = new Error(
        `Excel file "${path.basename(targetPath)}" is currently open in Microsoft Excel. Please close it first and try again.`
      ) as NodeJS.ErrnoException;
      busyErr.code = "EXCEL_FILE_OPEN";
      throw busyErr;
    }
    throw err;
  }
}

function getLanAddresses(): Array<{ name: string; ip: string; score: number }> {
  const interfaces = os.networkInterfaces();
  const candidates: Array<{ name: string; ip: string; score: number }> = [];

  for (const [name, list] of Object.entries(interfaces)) {
    if (!list) continue;
    const lower = name.toLowerCase();
    // Deprioritize virtual adapters (WSL, Hyper-V, Docker, VirtualBox, VMware, VPNs)
    const isVirtual =
      lower.includes("vethernet") ||
      lower.includes("wsl") ||
      lower.includes("docker") ||
      lower.includes("virtual") ||
      lower.includes("vmware") ||
      lower.includes("vbox") ||
      lower.includes("loopback") ||
      lower.includes("bluetooth");

    for (const iface of list) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      if (iface.address.startsWith("169.254.")) continue; // APIPA link-local

      let score = isVirtual ? 10 : 50;
      if (!isVirtual && (lower.includes("wi-fi") || lower.includes("wifi") || lower.includes("wlan"))) {
        score += 40;
      } else if (!isVirtual && (lower.includes("ethernet") || lower.includes("eth") || lower.includes("en"))) {
        score += 30;
      }
      if (iface.address.startsWith("192.168.")) score += 20;
      else if (iface.address.startsWith("10.")) score += 15;

      candidates.push({ name, ip: iface.address, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function openPathWithOS(targetPath: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (process.platform === "win32") {
        const child = spawn("explorer.exe", [targetPath], { detached: true, stdio: "ignore" });
        child.unref();
      } else if (process.platform === "darwin") {
        const child = spawn("open", [targetPath], { detached: true, stdio: "ignore" });
        child.unref();
      } else {
        const child = spawn("xdg-open", [targetPath], { detached: true, stdio: "ignore" });
        child.unref();
      }
    } catch {
      // ignore
    }
    resolve();
  });
}

function isLocalRequest(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export async function startServer(options: StartServerOptions = {}): Promise<ServerHandle> {
  const app = express();
  const preferredPort = Number(options.port || process.env.PORT || 3000);
  const mutex = new AsyncMutex();

  app.use(express.json({ limit: "2mb" }));

  const DATA_DIR = path.resolve(
    options.dataDir || process.env.DATA_DIR || path.join(process.cwd(), "data")
  );
  const BACKUPS_DIR = path.join(DATA_DIR, "backups");
  const CONFIG_PATH = path.join(DATA_DIR, "config.xlsx");

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  let hasChangesSinceLastBackup = false;

  // SSE Clients for real-time Computer <-> Phone sync
  const sseClients = new Map<Response, { isRemote: boolean }>();

  function broadcastSync(scope: "all" | "transactions" | "config" | "backups" = "all") {
    const remoteCount = Array.from(sseClients.values()).filter((c) => c.isRemote).length;
    const payload = JSON.stringify({
      type: "sync",
      scope,
      remoteClients: remoteCount,
      timestamp: Date.now(),
    });
    for (const client of sseClients.keys()) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  const sseHeartbeat = setInterval(() => {
    for (const client of sseClients.keys()) {
      try {
        client.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        sseClients.delete(client);
      }
    }
  }, 25000);

  async function initDefaults(): Promise<void> {
    if (fs.existsSync(CONFIG_PATH)) return;

    const workbook = new ExcelJS.Workbook();

    const locSheet = workbook.addWorksheet("Locations");
    locSheet.columns = [{ header: "Name", key: "name", width: 25 }];
    locSheet.getRow(1).font = { bold: true };

    const agentSheet = workbook.addWorksheet("Agents");
    agentSheet.columns = [{ header: "Name", key: "name", width: 25 }];
    agentSheet.getRow(1).font = { bold: true };

    const settingsSheet = workbook.addWorksheet("Settings");
    settingsSheet.columns = [
      { header: "Key", key: "key", width: 20 },
      { header: "Value", key: "value", width: 50 },
    ];
    settingsSheet.getRow(1).font = { bold: true };
    settingsSheet.addRow({ key: "booksPath", value: "" });

    const descSheet = workbook.addWorksheet("Descriptions");
    descSheet.columns = [
      { header: "Mandarin", key: "zh", width: 25 },
      { header: "English", key: "en", width: 30 },
    ];
    descSheet.getRow(1).font = { bold: true };
    descSheet.addRows([
      { zh: "洗衣机", en: "Washing Machine" },
      { zh: "烘干机", en: "Dryer" },
      { zh: "电灯", en: "Lights" },
      { zh: "维修", en: "Repair" },
      { zh: "零件", en: "Parts" },
      { zh: "人工", en: "Labour" },
      { zh: "材料", en: "Materials" },
    ]);

    await safeWriteWorkbook(workbook, CONFIG_PATH);
  }

  async function readConfigInternal(): Promise<{
    locations: string[];
    agents: string[];
    descriptions: Record<string, string>;
    customBooksPath: string;
    booksPath: string;
  }> {
    await initDefaults();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(CONFIG_PATH);

    const locations: string[] = [];
    const locSheet = workbook.getWorksheet("Locations");
    if (locSheet) {
      locSheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const val = cellToString(row.getCell(1).value);
          if (val && !locations.includes(val)) locations.push(val);
        }
      });
    }

    const agents: string[] = [];
    const agentSheet = workbook.getWorksheet("Agents");
    if (agentSheet) {
      agentSheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const val = cellToString(row.getCell(1).value);
          if (val && !agents.includes(val)) agents.push(val);
        }
      });
    }

    const descriptions: Record<string, string> = {};
    const descSheet = workbook.getWorksheet("Descriptions");
    if (descSheet) {
      descSheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const zh = cellToString(row.getCell(1).value);
          const en = cellToString(row.getCell(2).value);
          if (zh && en) descriptions[zh] = en;
          else if (zh) descriptions[zh] = zh;
          else if (en) descriptions[en] = en;
        }
      });
    }

    let customBooksPath = "";
    const settingsSheet = workbook.getWorksheet("Settings");
    if (settingsSheet) {
      settingsSheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1 && cellToString(row.getCell(1).value) === "booksPath") {
          customBooksPath = cellToString(row.getCell(2).value);
        }
      });
    }

    let effectiveBooksPath = DATA_DIR;
    if (customBooksPath) {
      try {
        if (!fs.existsSync(customBooksPath)) {
          fs.mkdirSync(customBooksPath, { recursive: true });
        }
        effectiveBooksPath = path.resolve(customBooksPath);
      } catch {
        effectiveBooksPath = DATA_DIR;
      }
    }

    return {
      locations,
      agents,
      descriptions,
      customBooksPath,
      booksPath: effectiveBooksPath,
    };
  }

  function getBookFilePath(booksPath: string, monthKey: string): string {
    const [year, month] = monthKey.split("-");
    return path.join(booksPath, year, `${year}${month}Book.xlsx`);
  }

  function configureTransactionsSheet(sheet: ExcelJS.Worksheet): void {
    sheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Payment Method", key: "paymentMethod", width: 18 },
      { header: "Location", key: "location", width: 22 },
      { header: "Agent", key: "agent", width: 20 },
      { header: "Description", key: "description", width: 34 },
      { header: "Parts Costs", key: "amount", width: 15 },
      { header: "GST", key: "gst", width: 14 },
      { header: "Total", key: "total", width: 15 },
      { header: "Record ID", key: "id", width: 22, hidden: true },
    ];
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getColumn(6).numFmt = "$#,##0.00";
    sheet.getColumn(7).numFmt = "$#,##0.00";
    sheet.getColumn(8).numFmt = "$#,##0.00";
    sheet.getColumn(9).hidden = true;
  }

  async function readMonthTransactionsInternal(
    booksPath: string,
    monthKey: string
  ): Promise<TransactionRecord[]> {
    const filePath = getBookFilePath(booksPath, monthKey);
    if (!fs.existsSync(filePath)) return [];

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet("Transactions") || workbook.worksheets[0];
    if (!sheet) return [];

    const records: TransactionRecord[] = [];
    let needsIdBackfill = false;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const dateStr = cellToDateString(row.getCell(1).value, monthKey);
      const paymentMethod = cellToString(row.getCell(2).value) || "Cash";
      const location = cellToString(row.getCell(3).value);
      const agent = cellToString(row.getCell(4).value);
      const description = cellToString(row.getCell(5).value);
      const amount = cellToNumber(row.getCell(6).value);
      const gst = cellToNumber(row.getCell(7).value);
      const total = cellToNumber(row.getCell(8).value);
      let id = cellToString(row.getCell(9).value);

      // Ignore completely empty rows
      if (!description && total === 0 && amount === 0 && !location && !agent) {
        return;
      }

      if (!id) {
        id = generateId();
        row.getCell(9).value = id;
        needsIdBackfill = true;
      }

      records.push({
        id,
        date: dateStr,
        paymentMethod,
        location,
        agent,
        description,
        amount,
        gst,
        total,
      });
    });

    if (needsIdBackfill) {
      try {
        sheet.getColumn(9).hidden = true;
        await safeWriteWorkbook(workbook, filePath);
      } catch {
        // Non-fatal if Excel currently has it open read-only
      }
    }

    return records;
  }

  function listAllBookFiles(booksPath: string): Array<{ monthKey: string; year: string; fileName: string; fullPath: string }> {
    const results: Array<{ monthKey: string; year: string; fileName: string; fullPath: string }> = [];
    if (!fs.existsSync(booksPath)) return results;

    const entries = fs.readdirSync(booksPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && /^\d{4}$/.test(entry.name)) {
        const yearDir = path.join(booksPath, entry.name);
        const files = fs.readdirSync(yearDir);
        for (const file of files) {
          const match = /^(\d{4})(\d{2})Book\.xlsx$/i.exec(file);
          if (match) {
            results.push({
              monthKey: `${match[1]}-${match[2]}`,
              year: match[1],
              fileName: file,
              fullPath: path.join(yearDir, file),
            });
          }
        }
      } else if (entry.isFile()) {
        const match = /^(\d{4})(\d{2})Book\.xlsx$/i.exec(entry.name);
        if (match) {
          results.push({
            monthKey: `${match[1]}-${match[2]}`,
            year: match[1],
            fileName: entry.name,
            fullPath: path.join(booksPath, entry.name),
          });
        }
      }
    }

    results.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    return results;
  }

  // --- BACKUP & RESTORE ENGINE ---

  function listBackupsInternal(): BackupManifest[] {
    if (!fs.existsSync(BACKUPS_DIR)) return [];
    const dirs = fs.readdirSync(BACKUPS_DIR, { withFileTypes: true });
    const manifests: BackupManifest[] = [];

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const manifestPath = path.join(BACKUPS_DIR, dir.name, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const raw = fs.readFileSync(manifestPath, "utf8");
        const parsed = JSON.parse(raw) as BackupManifest;
        if (parsed && parsed.id) {
          manifests.push(parsed);
        }
      } catch {
        // ignore corrupted backup folder
      }
    }

    manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return manifests;
  }

  function pruneOldBackupsInternal(): void {
    const backups = listBackupsInternal();
    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Keep at least the 15 most recent backups regardless of age, and never auto-delete manual backups under 60 total
    backups.forEach((b, idx) => {
      if (idx < 15) return;
      if (b.reason === "manual" && idx < 60) return;
      const createdMs = new Date(b.createdAt).getTime();
      if (createdMs < cutoffMs || idx >= 60) {
        const folder = path.join(BACKUPS_DIR, b.id);
        try {
          fs.rmSync(folder, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    });
  }

  async function createBackupInternal(reason: "daily" | "manual" | "safety"): Promise<BackupManifest> {
    const now = new Date();
    const dateKey = format(now, "yyyy-MM-dd");
    const stamp = format(now, "yyyy-MM-dd_HH-mm-ss");
    const id = `${stamp}_${reason}_${Math.random().toString(36).slice(2, 5)}`;
    const targetDir = path.join(BACKUPS_DIR, id);
    const targetBooksDir = path.join(targetDir, "books");

    fs.mkdirSync(targetBooksDir, { recursive: true });

    const cfg = await readConfigInternal();
    if (fs.existsSync(CONFIG_PATH)) {
      fs.copyFileSync(CONFIG_PATH, path.join(targetDir, "config.xlsx"));
    }

    const books = listAllBookFiles(cfg.booksPath);
    let recordCount = 0;
    let totalAmount = 0;

    for (const book of books) {
      const destYearDir = path.join(targetBooksDir, book.year);
      fs.mkdirSync(destYearDir, { recursive: true });
      fs.copyFileSync(book.fullPath, path.join(destYearDir, book.fileName));

      try {
        const rows = await readMonthTransactionsInternal(cfg.booksPath, book.monthKey);
        recordCount += rows.length;
        for (const r of rows) {
          totalAmount += r.total || 0;
        }
      } catch {
        // still keep raw file copied even if parsing skipped
      }
    }

    const manifest: BackupManifest = {
      id,
      createdAt: now.toISOString(),
      dateKey,
      reason,
      bookCount: books.length,
      recordCount,
      totalAmount: Math.round(totalAmount * 100) / 100,
    };

    fs.writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    hasChangesSinceLastBackup = false;
    pruneOldBackupsInternal();
    return manifest;
  }

  async function ensureDailyBackup(): Promise<void> {
    await mutex.runExclusive(async () => {
      const todayKey = format(new Date(), "yyyy-MM-dd");
      const existing = listBackupsInternal();
      const hasTodayDaily = existing.some((b) => b.reason === "daily" && b.dateKey === todayKey);
      if (!hasTodayDaily) {
        await createBackupInternal("daily");
        broadcastSync("backups");
      }
    });
  }

  // Initialize defaults & run initial daily backup check
  await mutex.runExclusive(async () => {
    await initDefaults();
  });
  ensureDailyBackup().catch((err) => console.error("Daily backup check error:", err));

  // Periodic daily rollover check every 15 minutes
  const dailyBackupTimer = setInterval(() => {
    ensureDailyBackup().catch((err) => console.error("Scheduled daily backup error:", err));
  }, 15 * 60 * 1000);

  // --- API ROUTES ---

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, app: "bookkeeping-ledger", timestamp: Date.now() });
  });

  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const isRemote = !isLocalRequest(req);
    sseClients.set(res, { isRemote });

    const remoteCount = Array.from(sseClients.values()).filter((c) => c.isRemote).length;
    res.write(`data: ${JSON.stringify({ type: "connected", remoteClients: remoteCount })}\n\n`);
    if (isRemote) {
      broadcastSync("all");
    }

    req.on("close", () => {
      sseClients.delete(res);
      if (isRemote) {
        broadcastSync("all");
      }
    });
  });

  app.get("/api/server-info", async (req, res) => {
    try {
      const lanList = getLanAddresses();
      const activePort = actualPort || preferredPort;

      const urls = await Promise.all(
        lanList.map(async (item) => {
          const url = `http://${item.ip}:${activePort}`;
          const qrDataUrl = await QRCode.toDataURL(url, {
            margin: 2,
            width: 320,
            color: { dark: "#1D1D1F", light: "#FFFFFF" },
          });
          return {
            name: item.name,
            ip: item.ip,
            url,
            qrDataUrl,
          };
        })
      );

      const fallbackUrl = `http://localhost:${activePort}`;
      const primary = urls[0] || {
        name: "Local",
        ip: "localhost",
        url: fallbackUrl,
        qrDataUrl: await QRCode.toDataURL(fallbackUrl, { margin: 2, width: 320 }),
      };

      const cfg = await mutex.runExclusive(() => readConfigInternal());
      const remoteClients = Array.from(sseClients.values()).filter((c) => c.isRemote).length;

      res.json({
        port: activePort,
        hostname: os.hostname(),
        isLocalMachine: isLocalRequest(req),
        canPickFolder: Boolean(options.onPickFolder) && isLocalRequest(req),
        remoteClients,
        primaryUrl: primary.url,
        primaryQrDataUrl: primary.qrDataUrl,
        interfaces: urls,
        dataDir: DATA_DIR,
        booksPath: cfg.booksPath,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/api/config", async (_req, res) => {
    try {
      const cfg = await mutex.runExclusive(() => readConfigInternal());
      res.json(cfg);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/config/add", async (req, res) => {
    try {
      const { type, value, translation } = req.body as {
        type: "location" | "agent" | "description" | "settings";
        value?: string;
        translation?: string;
      };

      await mutex.runExclusive(async () => {
        await initDefaults();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(CONFIG_PATH);

        if (type === "description") {
          const zh = (value || "").trim() || (translation || "").trim();
          const en = (translation || "").trim() || (value || "").trim();
          if (!zh && !en) throw new Error("Item name cannot be empty.");

          const sheet = workbook.getWorksheet("Descriptions") || workbook.addWorksheet("Descriptions");
          let updated = false;
          sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1 && cellToString(row.getCell(1).value) === zh) {
              row.getCell(2).value = en;
              updated = true;
            }
          });
          if (!updated) {
            sheet.addRow([zh, en]);
          }
        } else if (type === "settings") {
          const nextPath = (value || "").trim();
          if (nextPath && !fs.existsSync(nextPath)) {
            fs.mkdirSync(nextPath, { recursive: true });
          }
          const sheet = workbook.getWorksheet("Settings") || workbook.addWorksheet("Settings");
          let found = false;
          sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1 && cellToString(row.getCell(1).value) === "booksPath") {
              row.getCell(2).value = nextPath;
              found = true;
            }
          });
          if (!found) {
            sheet.addRow(["booksPath", nextPath]);
          }
        } else {
          const trimmed = (value || "").trim();
          if (!trimmed) throw new Error("Value cannot be empty.");
          const sheetName = type === "location" ? "Locations" : "Agents";
          const sheet = workbook.getWorksheet(sheetName) || workbook.addWorksheet(sheetName);
          let exists = false;
          sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1 && cellToString(row.getCell(1).value).toLowerCase() === trimmed.toLowerCase()) {
              exists = true;
            }
          });
          if (!exists) {
            sheet.addRow([trimmed]);
          }
        }

        await safeWriteWorkbook(workbook, CONFIG_PATH);
        hasChangesSinceLastBackup = true;
      });

      broadcastSync("config");
      ensureDailyBackup().catch(() => {});
      res.json({ success: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      res.status(code === "EXCEL_FILE_OPEN" ? 409 : 500).json({
        error: (error as Error).message,
        code,
      });
    }
  });

  app.post("/api/config/delete", async (req, res) => {
    try {
      const { type, value } = req.body as {
        type: "location" | "agent" | "description";
        value: string;
      };

      await mutex.runExclusive(async () => {
        await initDefaults();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(CONFIG_PATH);

        const sheetName =
          type === "description" ? "Descriptions" : type === "location" ? "Locations" : "Agents";
        const sheet = workbook.getWorksheet(sheetName);
        if (sheet) {
          const rowsToDelete: number[] = [];
          sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1 && cellToString(row.getCell(1).value) === value) {
              rowsToDelete.push(rowNumber);
            }
          });
          for (let i = rowsToDelete.length - 1; i >= 0; i--) {
            sheet.spliceRows(rowsToDelete[i], 1);
          }
          await safeWriteWorkbook(workbook, CONFIG_PATH);
          hasChangesSinceLastBackup = true;
        }
      });

      broadcastSync("config");
      res.json({ success: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      res.status(code === "EXCEL_FILE_OPEN" ? 409 : 500).json({
        error: (error as Error).message,
        code,
      });
    }
  });

  app.get("/api/transactions", async (req, res) => {
    try {
      const requestedMonth =
        typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)
          ? req.query.month
          : format(new Date(), "yyyy-MM");

      const result = await mutex.runExclusive(async () => {
        const cfg = await readConfigInternal();
        const rows = await readMonthTransactionsInternal(cfg.booksPath, requestedMonth);
        const allBooks = listAllBookFiles(cfg.booksPath);
        const currentMonth = format(new Date(), "yyyy-MM");
        const monthSet = new Set<string>([currentMonth, requestedMonth, ...allBooks.map((b) => b.monthKey)]);
        const availableMonths = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

        // Sort newest date first; within same date, reverse insertion order so latest saved appears at top
        const indexed = rows.map((r, idx) => ({ r, idx }));
        indexed.sort((a, b) => {
          const dateCmp = b.r.date.localeCompare(a.r.date);
          if (dateCmp !== 0) return dateCmp;
          return b.idx - a.idx;
        });
        const sorted = indexed.map((item) => item.r);

        let total = 0;
        let cashTotal = 0;
        let cardTotal = 0;
        let partsTotal = 0;
        let gstTotal = 0;

        for (const r of sorted) {
          total += r.total || 0;
          partsTotal += r.amount || 0;
          gstTotal += r.gst || 0;
          if (r.paymentMethod.toLowerCase() === "card") {
            cardTotal += r.total || 0;
          } else {
            cashTotal += r.total || 0;
          }
        }

        const filePath = getBookFilePath(cfg.booksPath, requestedMonth);

        return {
          month: requestedMonth,
          fileExists: fs.existsSync(filePath),
          fileName: path.basename(filePath),
          transactions: sorted,
          availableMonths,
          summary: {
            count: sorted.length,
            total: Math.round(total * 100) / 100,
            cashTotal: Math.round(cashTotal * 100) / 100,
            cardTotal: Math.round(cardTotal * 100) / 100,
            partsTotal: Math.round(partsTotal * 100) / 100,
            gstTotal: Math.round(gstTotal * 100) / 100,
          },
        };
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/api/transactions/download", async (req, res) => {
    try {
      const requestedMonth =
        typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)
          ? req.query.month
          : format(new Date(), "yyyy-MM");

      const cfg = await mutex.runExclusive(() => readConfigInternal());
      const filePath = getBookFilePath(cfg.booksPath, requestedMonth);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "No Excel file exists for this month yet." });
        return;
      }
      res.download(filePath, path.basename(filePath));
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/transactions", async (req, res) => {
    try {
      const { date, paymentMethod, location, agent, description, amount, gst, total } = req.body;
      const parsedDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? parseISO(date)
        : new Date(date || Date.now());
      const safeDate = isValid(parsedDate) ? parsedDate : new Date();
      const dateStr = format(safeDate, "yyyy-MM-dd");
      const monthKey = format(safeDate, "yyyy-MM");

      const created = await mutex.runExclusive(async () => {
        const cfg = await readConfigInternal();
        const filePath = getBookFilePath(cfg.booksPath, monthKey);
        const workbook = new ExcelJS.Workbook();
        let sheet: ExcelJS.Worksheet;

        if (fs.existsSync(filePath)) {
          await workbook.xlsx.readFile(filePath);
          sheet = workbook.getWorksheet("Transactions") || workbook.addWorksheet("Transactions");
        } else {
          sheet = workbook.addWorksheet("Transactions");
        }

        configureTransactionsSheet(sheet);

        const record: TransactionRecord = {
          id: generateId(),
          date: dateStr,
          paymentMethod: String(paymentMethod || "Cash"),
          location: String(location || ""),
          agent: String(agent || ""),
          description: String(description || ""),
          amount: Math.round((parseFloat(amount) || 0) * 100) / 100,
          gst: Math.round((parseFloat(gst) || 0) * 100) / 100,
          total: Math.round((parseFloat(total) || 0) * 100) / 100,
        };

        sheet.addRow(record);
        sheet.getColumn(9).hidden = true;

        await safeWriteWorkbook(workbook, filePath);
        hasChangesSinceLastBackup = true;
        return { record, fileName: path.basename(filePath) };
      });

      broadcastSync("transactions");
      ensureDailyBackup().catch(() => {});
      res.json({ success: true, file: created.fileName, transaction: created.record });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      res.status(code === "EXCEL_FILE_OPEN" ? 409 : 500).json({
        error: (error as Error).message,
        code,
      });
    }
  });

  app.put("/api/transactions/:id", async (req, res) => {
    try {
      const targetId = req.params.id;
      const { originalMonth, date, paymentMethod, location, agent, description, amount, gst, total } =
        req.body;

      const parsedDate =
        typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? parseISO(date)
          : new Date(date || Date.now());
      const safeDate = isValid(parsedDate) ? parsedDate : new Date();
      const newDateStr = format(safeDate, "yyyy-MM-dd");
      const newMonthKey = format(safeDate, "yyyy-MM");

      const updatedRecord: TransactionRecord = {
        id: targetId,
        date: newDateStr,
        paymentMethod: String(paymentMethod || "Cash"),
        location: String(location || ""),
        agent: String(agent || ""),
        description: String(description || ""),
        amount: Math.round((parseFloat(amount) || 0) * 100) / 100,
        gst: Math.round((parseFloat(gst) || 0) * 100) / 100,
        total: Math.round((parseFloat(total) || 0) * 100) / 100,
      };

      await mutex.runExclusive(async () => {
        const cfg = await readConfigInternal();
        const candidateMonths = new Set<string>();
        if (typeof originalMonth === "string" && /^\d{4}-\d{2}$/.test(originalMonth)) {
          candidateMonths.add(originalMonth);
        }
        candidateMonths.add(newMonthKey);
        for (const b of listAllBookFiles(cfg.booksPath)) {
          candidateMonths.add(b.monthKey);
        }

        let foundInMonth: string | null = null;

        for (const mKey of candidateMonths) {
          const fPath = getBookFilePath(cfg.booksPath, mKey);
          if (!fs.existsSync(fPath)) continue;

          const wb = new ExcelJS.Workbook();
          await wb.xlsx.readFile(fPath);
          const sheet = wb.getWorksheet("Transactions") || wb.worksheets[0];
          if (!sheet) continue;

          let matchedRowNumber = -1;
          sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1 && cellToString(row.getCell(9).value) === targetId) {
              matchedRowNumber = rowNumber;
            }
          });

          if (matchedRowNumber !== -1) {
            foundInMonth = mKey;
            if (mKey === newMonthKey) {
              configureTransactionsSheet(sheet);
              const row = sheet.getRow(matchedRowNumber);
              row.getCell(1).value = updatedRecord.date;
              row.getCell(2).value = updatedRecord.paymentMethod;
              row.getCell(3).value = updatedRecord.location;
              row.getCell(4).value = updatedRecord.agent;
              row.getCell(5).value = updatedRecord.description;
              row.getCell(6).value = updatedRecord.amount;
              row.getCell(7).value = updatedRecord.gst;
              row.getCell(8).value = updatedRecord.total;
              row.getCell(9).value = updatedRecord.id;
              sheet.getColumn(9).hidden = true;
              await safeWriteWorkbook(wb, fPath);
            } else {
              // Remove from old month workbook and append to new month workbook
              sheet.spliceRows(matchedRowNumber, 1);
              await safeWriteWorkbook(wb, fPath);

              const newPath = getBookFilePath(cfg.booksPath, newMonthKey);
              const newWb = new ExcelJS.Workbook();
              let newSheet: ExcelJS.Worksheet;
              if (fs.existsSync(newPath)) {
                await newWb.xlsx.readFile(newPath);
                newSheet = newWb.getWorksheet("Transactions") || newWb.addWorksheet("Transactions");
              } else {
                newSheet = newWb.addWorksheet("Transactions");
              }
              configureTransactionsSheet(newSheet);
              newSheet.addRow(updatedRecord);
              newSheet.getColumn(9).hidden = true;
              await safeWriteWorkbook(newWb, newPath);
            }
            break;
          }
        }

        if (!foundInMonth) {
          throw new Error("Transaction record not found.");
        }
        hasChangesSinceLastBackup = true;
      });

      broadcastSync("transactions");
      res.json({ success: true, transaction: updatedRecord });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      res.status(code === "EXCEL_FILE_OPEN" ? 409 : 500).json({
        error: (error as Error).message,
        code,
      });
    }
  });

  app.delete("/api/transactions/:id", async (req, res) => {
    try {
      const targetId = req.params.id;
      const hintMonth = typeof req.query.month === "string" ? req.query.month : "";

      await mutex.runExclusive(async () => {
        const cfg = await readConfigInternal();
        const candidateMonths = new Set<string>();
        if (/^\d{4}-\d{2}$/.test(hintMonth)) {
          candidateMonths.add(hintMonth);
        }
        for (const b of listAllBookFiles(cfg.booksPath)) {
          candidateMonths.add(b.monthKey);
        }

        let deleted = false;
        for (const mKey of candidateMonths) {
          const fPath = getBookFilePath(cfg.booksPath, mKey);
          if (!fs.existsSync(fPath)) continue;

          const wb = new ExcelJS.Workbook();
          await wb.xlsx.readFile(fPath);
          const sheet = wb.getWorksheet("Transactions") || wb.worksheets[0];
          if (!sheet) continue;

          let matchedRowNumber = -1;
          sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1 && cellToString(row.getCell(9).value) === targetId) {
              matchedRowNumber = rowNumber;
            }
          });

          if (matchedRowNumber !== -1) {
            sheet.spliceRows(matchedRowNumber, 1);
            await safeWriteWorkbook(wb, fPath);
            deleted = true;
            hasChangesSinceLastBackup = true;
            break;
          }
        }

        if (!deleted) {
          throw new Error("Transaction record not found.");
        }
      });

      broadcastSync("transactions");
      res.json({ success: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      res.status(code === "EXCEL_FILE_OPEN" ? 409 : 500).json({
        error: (error as Error).message,
        code,
      });
    }
  });

  // --- BACKUP & RESTORE ENDPOINTS ---

  app.get("/api/backups", async (_req, res) => {
    try {
      const backups = await mutex.runExclusive(async () => listBackupsInternal());
      const todayKey = format(new Date(), "yyyy-MM-dd");
      const backedUpToday = backups.some((b) => b.dateKey === todayKey);
      res.json({
        backups,
        backedUpToday,
        latestBackup: backups[0] || null,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/backups", async (_req, res) => {
    try {
      const manifest = await mutex.runExclusive(() => createBackupInternal("manual"));
      broadcastSync("backups");
      res.json({ success: true, backup: manifest });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/backups/:id/restore", async (req, res) => {
    try {
      const backupId = path.basename(req.params.id);
      const result = await mutex.runExclusive(async () => {
        const sourceDir = path.join(BACKUPS_DIR, backupId);
        const manifestPath = path.join(sourceDir, "manifest.json");
        if (!fs.existsSync(manifestPath)) {
          throw new Error("Selected backup could not be found.");
        }

        const currentCfg = await readConfigInternal();
        // Verify none of the current Excel files are locked open in Microsoft Excel before restoring
        const currentBooks = listAllBookFiles(currentCfg.booksPath);
        for (const book of currentBooks) {
          try {
            const fd = fs.openSync(book.fullPath, "r+");
            fs.closeSync(fd);
          } catch (err) {
            if (isFileBusyError(err)) {
              const busyErr = new Error(
                `Please close "${book.fileName}" in Microsoft Excel before restoring.`
              ) as NodeJS.ErrnoException;
              busyErr.code = "EXCEL_FILE_OPEN";
              throw busyErr;
            }
          }
        }

        // Always create an automatic safety snapshot right before restoring!
        const safetyBackup = await createBackupInternal("safety");

        // Restore config.xlsx
        const backupConfigPath = path.join(sourceDir, "config.xlsx");
        if (fs.existsSync(backupConfigPath)) {
          fs.copyFileSync(backupConfigPath, CONFIG_PATH);
        }

        const restoredCfg = await readConfigInternal();
        const existingAfterConfig = listAllBookFiles(restoredCfg.booksPath);
        for (const book of existingAfterConfig) {
          try {
            fs.unlinkSync(book.fullPath);
          } catch {
            // ignore
          }
        }

        // Copy all monthly Excel books from the backup snapshot
        const backupBooksDir = path.join(sourceDir, "books");
        if (fs.existsSync(backupBooksDir)) {
          const yearEntries = fs.readdirSync(backupBooksDir, { withFileTypes: true });
          for (const yEntry of yearEntries) {
            if (!yEntry.isDirectory()) continue;
            const srcYearDir = path.join(backupBooksDir, yEntry.name);
            const destYearDir = path.join(restoredCfg.booksPath, yEntry.name);
            fs.mkdirSync(destYearDir, { recursive: true });
            for (const fName of fs.readdirSync(srcYearDir)) {
              fs.copyFileSync(path.join(srcYearDir, fName), path.join(destYearDir, fName));
            }
          }
        }

        hasChangesSinceLastBackup = false;
        return { safetyBackup };
      });

      broadcastSync("all");
      res.json({ success: true, safetyBackup: result.safetyBackup });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      res.status(code === "EXCEL_FILE_OPEN" ? 409 : 500).json({
        error: (error as Error).message,
        code,
      });
    }
  });

  // --- LOCAL PC HELPERS (Open Excel / Open Folder / Native Folder Picker) ---

  app.post("/api/system/open-folder", async (req, res) => {
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: "Only available directly on the host computer." });
      return;
    }
    try {
      const { month } = req.body as { month?: string };
      const cfg = await mutex.runExclusive(() => readConfigInternal());
      let target = cfg.booksPath;
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        const bookFile = getBookFilePath(cfg.booksPath, month);
        if (fs.existsSync(bookFile)) {
          target = bookFile;
        }
      }
      if (options.onOpenPath) {
        await options.onOpenPath(target);
      } else {
        await openPathWithOS(target);
      }
      res.json({ success: true, opened: target });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/system/pick-folder", async (req, res) => {
    if (!isLocalRequest(req) || !options.onPickFolder) {
      res.status(400).json({ error: "Folder picker is only available inside the desktop app." });
      return;
    }
    try {
      const chosen = await options.onPickFolder();
      res.json({ folderPath: chosen });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // --- STATIC / VITE FRONTEND SERVING ---

  const isDevMode = process.env.NODE_ENV !== "production" && !options.isElectron && !process.env.ELECTRON_RUN;
  if (isDevMode) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const resolvedDist =
      options.distDir ||
      (() => {
        try {
          const currentDir =
            typeof __dirname !== "undefined"
              ? __dirname
              : path.dirname(fileURLToPath(import.meta.url));
          const candidate1 = path.join(currentDir, "dist");
          if (fs.existsSync(candidate1)) return candidate1;
          return path.resolve(currentDir, "..", "dist");
        } catch {
          return path.join(process.cwd(), "dist");
        }
      })();

    app.use(express.static(resolvedDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(resolvedDist, "index.html"));
    });
  }

  // --- BIND SERVER WITH AUTOMATIC PORT FALLBACK ---

  let actualPort = preferredPort;
  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    const tryListen = (portToTry: number, retriesLeft: number) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.removeListener("listening", onListening);
        if (err.code === "EADDRINUSE" && retriesLeft > 0) {
          tryListen(portToTry + 1, retriesLeft - 1);
        } else {
          reject(err);
        }
      };
      const onListening = () => {
        server.removeListener("error", onError);
        actualPort = portToTry;
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(portToTry, "0.0.0.0");
    };

    tryListen(preferredPort, 10);
  });

  const localUrl = `http://localhost:${actualPort}`;
  const lan = getLanAddresses();
  console.log(`Server running on ${localUrl}`);
  if (lan[0]) {
    console.log(`Phone Wi-Fi access: http://${lan[0].ip}:${actualPort}`);
  }

  if (process.argv.includes("--open")) {
    await openPathWithOS(localUrl);
  }

  async function close(): Promise<void> {
    clearInterval(sseHeartbeat);
    clearInterval(dailyBackupTimer);
    for (const client of sseClients.keys()) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    sseClients.clear();

    if (hasChangesSinceLastBackup) {
      try {
        await mutex.runExclusive(() => createBackupInternal("daily"));
      } catch (err) {
        console.error("Shutdown backup failed:", err);
      }
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  return {
    app,
    server,
    port: actualPort,
    dataDir: DATA_DIR,
    close,
  };
}

// Run directly when invoked via CLI (`tsx server.ts` or `node dist-electron/server.cjs`)
const invokedScript = process.argv[1] || "";
if (
  !process.versions.electron &&
  (invokedScript.endsWith("server.ts") || invokedScript.endsWith("server.cjs") || invokedScript.endsWith("server.js"))
) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
