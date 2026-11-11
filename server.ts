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
import type {
  BusinessProfile,
  InvoiceLineItem,
  InvoiceRecord,
  InvoiceStatus,
  RecordInvoiceLink,
} from "./src/types";
import { buildInvoicePdfFileName } from "./src/invoice-utils";
import { renderInvoiceHtml } from "./invoice-template";

export interface StartServerOptions {
  port?: number;
  dataDir?: string;
  distDir?: string;
  isElectron?: boolean;
  onPickFolder?: () => Promise<string | null>;
  onOpenPath?: (targetPath: string) => Promise<void>;
  onRenderPdf?: (htmlContent: string) => Promise<Buffer>;
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
  invoiceCount: number;
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

function generateId(prefix = "tx"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
      if (iface.address.startsWith("169.254.")) continue;

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

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export async function startServer(options: StartServerOptions = {}): Promise<ServerHandle> {
  const app = express();
  const preferredPort = Number(options.port || process.env.PORT || 3000);
  const mutex = new AsyncMutex();

  app.use(express.json({ limit: "4mb" }));

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

  const sseClients = new Map<Response, { isRemote: boolean }>();

  function broadcastSync(scope: "all" | "transactions" | "config" | "backups" | "invoices" = "all") {
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
      { header: "Key", key: "key", width: 24 },
      { header: "Value", key: "value", width: 50 },
    ];
    settingsSheet.getRow(1).font = { bold: true };
    settingsSheet.addRow({ key: "booksPath", value: "" });
    settingsSheet.addRow({ key: "invoicePrefix", value: "INV-" });
    settingsSheet.addRow({ key: "nextInvoiceSeq", value: "1" });

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
    businessProfile: BusinessProfile;
    nextInvoiceSeq: number;
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

    const settingsMap = new Map<string, string>();
    const settingsSheet = workbook.getWorksheet("Settings");
    if (settingsSheet) {
      settingsSheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const k = cellToString(row.getCell(1).value);
          const v = cellToString(row.getCell(2).value);
          if (k) settingsMap.set(k, v);
        }
      });
    }

    const customBooksPath = settingsMap.get("booksPath") || "";
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

    const rawGstReg = settingsMap.get("gstRegistered");
    const gstRegistered =
      rawGstReg === "true" ? true : rawGstReg === "false" ? false : undefined;

    const businessProfile: BusinessProfile = {
      businessName: settingsMap.get("businessName") || "",
      businessAbn: settingsMap.get("businessAbn") || "",
      gstRegistered,
      businessPhone: settingsMap.get("businessPhone") || "",
      businessEmail: settingsMap.get("businessEmail") || "",
      businessAddress: settingsMap.get("businessAddress") || "",
      bankAccountName: settingsMap.get("bankAccountName") || "",
      bankBsb: settingsMap.get("bankBsb") || "",
      bankAccountNumber: settingsMap.get("bankAccountNumber") || "",
      payId: settingsMap.get("payId") || "",
      invoicePrefix: settingsMap.get("invoicePrefix") || "INV-",
    };

    const nextInvoiceSeq = Math.max(1, parseInt(settingsMap.get("nextInvoiceSeq") || "1", 10) || 1);

    return {
      locations,
      agents,
      descriptions,
      customBooksPath,
      booksPath: effectiveBooksPath,
      businessProfile,
      nextInvoiceSeq,
    };
  }

  async function writeSettingsKeysInternal(entries: Record<string, string>): Promise<void> {
    await initDefaults();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(CONFIG_PATH);
    const sheet = workbook.getWorksheet("Settings") || workbook.addWorksheet("Settings");
    if (sheet.rowCount === 0) {
      sheet.columns = [
        { header: "Key", key: "key", width: 24 },
        { header: "Value", key: "value", width: 50 },
      ];
      sheet.getRow(1).font = { bold: true };
    }

    for (const [key, val] of Object.entries(entries)) {
      let found = false;
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1 && cellToString(row.getCell(1).value) === key) {
          row.getCell(2).value = val;
          found = true;
        }
      });
      if (!found) {
        sheet.addRow([key, val]);
      }
    }

    await safeWriteWorkbook(workbook, CONFIG_PATH);
  }

  function getBookFilePath(booksPath: string, monthKey: string): string {
    const [year, month] = monthKey.split("-");
    return path.join(booksPath, year, `${year}${month}Book.xlsx`);
  }

  function getInvoicesFilePath(booksPath: string): string {
    return path.join(booksPath, "Invoices.xlsx");
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
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getColumn(6).numFmt = "$#,##0.00";
    sheet.getColumn(7).numFmt = "$#,##0.00";
    sheet.getColumn(8).numFmt = "$#,##0.00";
    sheet.getColumn(9).hidden = true;
  }

  function configureInvoicesSheet(sheet: ExcelJS.Worksheet): void {
    sheet.columns = [
      { header: "Invoice Number", key: "invoiceNumber", width: 18 },
      { header: "Status", key: "status", width: 13 },
      { header: "Issue Date", key: "issueDate", width: 14 },
      { header: "Due Date", key: "dueDate", width: 14 },
      { header: "Bill To", key: "clientName", width: 26 },
      { header: "Service Address / Contact", key: "clientDetails", width: 32 },
      { header: "Items Summary", key: "summary", width: 38 },
      { header: "Parts Total", key: "partsTotal", width: 15 },
      { header: "GST Total", key: "gstTotal", width: 14 },
      { header: "Total", key: "total", width: 15 },
      { header: "Paid Date", key: "paidDate", width: 14 },
      { header: "Payment Method", key: "paymentMethod", width: 18 },
      { header: "Notes", key: "notes", width: 30 },
      { header: "Invoice ID", key: "id", width: 24, hidden: true },
      { header: "Payload JSON", key: "payload", width: 40, hidden: true },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getColumn(8).numFmt = "$#,##0.00";
    sheet.getColumn(9).numFmt = "$#,##0.00";
    sheet.getColumn(10).numFmt = "$#,##0.00";
    sheet.getColumn(14).hidden = true;
    sheet.getColumn(15).hidden = true;
  }

  async function readInvoicesInternal(booksPath: string): Promise<InvoiceRecord[]> {
    const filePath = getInvoicesFilePath(booksPath);
    if (!fs.existsSync(filePath)) return [];

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet("Invoices") || workbook.worksheets[0];
    if (!sheet) return [];

    const records: InvoiceRecord[] = [];
    let needsBackfill = false;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const invoiceNumber = cellToString(row.getCell(1).value);
      const rawStatus = cellToString(row.getCell(2).value);
      const status: InvoiceStatus = rawStatus.toLowerCase() === "paid" ? "Paid" : "Unpaid";
      const issueDate = cellToDateString(row.getCell(3).value);
      const dueDate = cellToDateString(row.getCell(4).value);
      const clientName = cellToString(row.getCell(5).value);
      const clientDetails = cellToString(row.getCell(6).value);
      const summaryDesc = cellToString(row.getCell(7).value);
      const partsTotal = roundMoney(cellToNumber(row.getCell(8).value));
      const gstTotal = roundMoney(cellToNumber(row.getCell(9).value));
      const total = roundMoney(cellToNumber(row.getCell(10).value));
      const rawPaidDate = cellToString(row.getCell(11).value);
      const paidDate = rawPaidDate ? cellToDateString(row.getCell(11).value) : "";
      const paymentMethod = cellToString(row.getCell(12).value);
      const notes = cellToString(row.getCell(13).value);
      let id = cellToString(row.getCell(14).value);
      const payloadRaw = cellToString(row.getCell(15).value);

      if (!invoiceNumber && !clientName && total === 0 && !summaryDesc) {
        return;
      }

      if (!id) {
        id = generateId("inv");
        row.getCell(14).value = id;
        needsBackfill = true;
      }

      let items: InvoiceLineItem[] = [];
      let linkedRecordIds: string[] = [];
      let createdAt = new Date().toISOString();
      let serviceAddress = "";
      let clientAbn = "";
      let resolvedClientDetails = clientDetails;

      if (payloadRaw) {
        try {
          const parsed = JSON.parse(payloadRaw);
          if (Array.isArray(parsed.items)) items = parsed.items;
          if (Array.isArray(parsed.linkedRecordIds)) linkedRecordIds = parsed.linkedRecordIds;
          if (typeof parsed.createdAt === "string") createdAt = parsed.createdAt;
          if (typeof parsed.serviceAddress === "string") serviceAddress = parsed.serviceAddress;
          if (typeof parsed.clientAbn === "string") clientAbn = parsed.clientAbn;
          if (typeof parsed.clientDetails === "string") {
            resolvedClientDetails = parsed.clientDetails;
          }
        } catch {
          // fallback below
        }
      }

      if (items.length === 0) {
        items = [
          {
            id: generateId("item"),
            date: issueDate,
            description: summaryDesc || "Service",
            quantity: 1,
            parts: partsTotal,
            gst: gstTotal,
            total,
          },
        ];
      }

      records.push({
        id,
        invoiceNumber: invoiceNumber || "INV-0001",
        status,
        issueDate,
        dueDate,
        clientName,
        clientAbn,
        serviceAddress,
        clientDetails: resolvedClientDetails,
        items,
        linkedRecordIds,
        partsTotal,
        gstTotal,
        total,
        paidDate,
        paymentMethod,
        notes,
        createdAt,
      });
    });

    if (needsBackfill) {
      try {
        configureInvoicesSheet(sheet);
        await safeWriteWorkbook(workbook, filePath);
      } catch {
        // ignore if read-only in Excel
      }
    }

    return records;
  }

  async function writeInvoicesInternal(booksPath: string, invoices: InvoiceRecord[]): Promise<void> {
    const filePath = getInvoicesFilePath(booksPath);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Invoices");
    configureInvoicesSheet(sheet);

    for (const inv of invoices) {
      const summary = inv.items.map((it) => it.description).filter(Boolean).join("; ");
      const visibleAddressAndContact = [inv.serviceAddress, inv.clientDetails]
        .map((s) => (s || "").trim())
        .filter(Boolean)
        .join(" | ");
      const payload = JSON.stringify({
        serviceAddress: inv.serviceAddress || "",
        clientAbn: inv.clientAbn || "",
        clientDetails: inv.clientDetails || "",
        items: inv.items,
        linkedRecordIds: inv.linkedRecordIds,
        createdAt: inv.createdAt,
      });

      sheet.addRow({
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        clientName: inv.clientName,
        clientDetails: visibleAddressAndContact,
        summary,
        partsTotal: roundMoney(inv.partsTotal),
        gstTotal: roundMoney(inv.gstTotal),
        total: roundMoney(inv.total),
        paidDate: inv.status === "Paid" ? inv.paidDate : "",
        paymentMethod: inv.paymentMethod,
        notes: inv.notes,
        id: inv.id,
        payload,
      });
    }

    configureInvoicesSheet(sheet);
    await safeWriteWorkbook(workbook, filePath);
  }

  function formatNextInvoiceNumber(
    prefix: string,
    seq: number,
    existingInvoices: InvoiceRecord[]
  ): { formatted: string; seqUsed: number } {
    const cleanPrefix = prefix || "INV-";
    const existingNums = new Set(existingInvoices.map((i) => i.invoiceNumber.trim().toLowerCase()));
    let candidateSeq = Math.max(1, seq);
    while (true) {
      const padded = String(candidateSeq).padStart(4, "0");
      const formatted = `${cleanPrefix}${padded}`;
      if (!existingNums.has(formatted.toLowerCase())) {
        return { formatted, seqUsed: candidateSeq };
      }
      candidateSeq++;
    }
  }

  function normalizeInvoiceInput(
    body: Partial<InvoiceRecord>,
    fallbackId?: string,
    fallbackCreatedAt?: string
  ): InvoiceRecord {
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items: InvoiceLineItem[] = rawItems
      .map((it) => ({
        id: it.id || generateId("item"),
        recordId: it.recordId || undefined,
        date: typeof it.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.date)
          ? it.date
          : format(new Date(), "yyyy-MM-dd"),
        description: String(it.description || "").trim(),
        quantity: Math.max(1, Number(it.quantity) || 1),
        parts: roundMoney(Number(it.parts) || 0),
        gst: roundMoney(Number(it.gst) || 0),
        total: roundMoney(Number(it.total) || 0),
      }))
      .filter((it) => it.description || it.total > 0 || it.parts > 0);

    const partsTotal = roundMoney(items.reduce((acc, it) => acc + it.parts, 0));
    const gstTotal = roundMoney(items.reduce((acc, it) => acc + it.gst, 0));
    const total = roundMoney(items.reduce((acc, it) => acc + it.total, 0));

    const linkedSet = new Set<string>();
    if (Array.isArray(body.linkedRecordIds)) {
      for (const rid of body.linkedRecordIds) {
        if (rid) linkedSet.add(String(rid));
      }
    }
    for (const it of items) {
      if (it.recordId) linkedSet.add(it.recordId);
    }

    const status: InvoiceStatus = body.status === "Paid" ? "Paid" : "Unpaid";
    const issueDate =
      typeof body.issueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.issueDate)
        ? body.issueDate
        : format(new Date(), "yyyy-MM-dd");
    const dueDate =
      typeof body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)
        ? body.dueDate
        : issueDate;
    const paidDate =
      status === "Paid"
        ? typeof body.paidDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.paidDate)
          ? body.paidDate
          : format(new Date(), "yyyy-MM-dd")
        : "";

    return {
      id: fallbackId || body.id || generateId("inv"),
      invoiceNumber: String(body.invoiceNumber || "").trim(),
      status,
      issueDate,
      dueDate,
      clientName: String(body.clientName || "").trim(),
      clientAbn: String(body.clientAbn || "").trim(),
      serviceAddress: String(body.serviceAddress || "").trim(),
      clientDetails: String(body.clientDetails || "").trim(),
      items,
      linkedRecordIds: Array.from(linkedSet),
      partsTotal,
      gstTotal,
      total,
      paidDate,
      paymentMethod: String(body.paymentMethod || (status === "Paid" ? "Bank Transfer" : "")).trim(),
      notes: String(body.notes || "").trim(),
      createdAt: fallbackCreatedAt || body.createdAt || new Date().toISOString(),
    };
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

      if (!description && total === 0 && amount === 0 && !location && !agent) {
        return;
      }

      if (!id) {
        id = generateId("tx");
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

  function listAllBookFiles(
    booksPath: string
  ): Array<{ monthKey: string; year: string; fileName: string; fullPath: string }> {
    const results: Array<{ monthKey: string; year: string; fileName: string; fullPath: string }> =
      [];
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

  // --- BACKUP & RESTORE ENGINE (Includes config.xlsx, monthly books, AND Invoices.xlsx!) ---

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
          manifests.push({
            ...parsed,
            invoiceCount: parsed.invoiceCount ?? 0,
          });
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

  async function createBackupInternal(
    reason: "daily" | "manual" | "safety"
  ): Promise<BackupManifest> {
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

    // Copy Invoices.xlsx if present
    const invoicesFile = getInvoicesFilePath(cfg.booksPath);
    let invoiceCount = 0;
    if (fs.existsSync(invoicesFile)) {
      fs.copyFileSync(invoicesFile, path.join(targetDir, "Invoices.xlsx"));
      try {
        const invList = await readInvoicesInternal(cfg.booksPath);
        invoiceCount = invList.length;
      } catch {
        // ignore
      }
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
        // still keep raw file copied
      }
    }

    const manifest: BackupManifest = {
      id,
      createdAt: now.toISOString(),
      dateKey,
      reason,
      bookCount: books.length,
      recordCount,
      invoiceCount,
      totalAmount: roundMoney(totalAmount),
    };

    fs.writeFileSync(
      path.join(targetDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );
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

  await mutex.runExclusive(async () => {
    await initDefaults();
  });
  ensureDailyBackup().catch((err) => console.error("Daily backup check error:", err));

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
        canRenderPdf: Boolean(options.onRenderPdf || findSystemBrowserForPdf()),
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
      res.json({
        locations: cfg.locations,
        agents: cfg.agents,
        descriptions: cfg.descriptions,
        customBooksPath: cfg.customBooksPath,
        booksPath: cfg.booksPath,
        businessProfile: cfg.businessProfile,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/config/business", async (req, res) => {
    try {
      const profile = req.body as Partial<BusinessProfile>;
      await mutex.runExclusive(async () => {
        await writeSettingsKeysInternal({
          businessName: String(profile.businessName || "").trim(),
          businessAbn: String(profile.businessAbn || "").trim(),
          gstRegistered:
            profile.gstRegistered === false
              ? "false"
              : profile.gstRegistered === true
                ? "true"
                : "",
          businessPhone: String(profile.businessPhone || "").trim(),
          businessEmail: String(profile.businessEmail || "").trim(),
          businessAddress: String(profile.businessAddress || "").trim(),
          bankAccountName: String(profile.bankAccountName || "").trim(),
          bankBsb: String(profile.bankBsb || "").trim(),
          bankAccountNumber: String(profile.bankAccountNumber || "").trim(),
          payId: String(profile.payId || "").trim(),
          invoicePrefix: String(profile.invoicePrefix || "INV-").trim() || "INV-",
        });
        hasChangesSinceLastBackup = true;
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
            if (
              rowNumber > 1 &&
              cellToString(row.getCell(1).value).toLowerCase() === trimmed.toLowerCase()
            ) {
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

  // --- TRANSACTIONS ENDPOINTS ---

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
        const monthSet = new Set<string>([
          currentMonth,
          requestedMonth,
          ...allBooks.map((b) => b.monthKey),
        ]);
        const availableMonths = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

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
            total: roundMoney(total),
            cashTotal: roundMoney(cashTotal),
            cardTotal: roundMoney(cardTotal),
            partsTotal: roundMoney(partsTotal),
            gstTotal: roundMoney(gstTotal),
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
      const parsedDate =
        typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
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
          id: generateId("tx"),
          date: dateStr,
          paymentMethod: String(paymentMethod || "Cash"),
          location: String(location || ""),
          agent: String(agent || ""),
          description: String(description || ""),
          amount: roundMoney(parseFloat(amount) || 0),
          gst: roundMoney(parseFloat(gst) || 0),
          total: roundMoney(parseFloat(total) || 0),
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
        amount: roundMoney(parseFloat(amount) || 0),
        gst: roundMoney(parseFloat(gst) || 0),
        total: roundMoney(parseFloat(total) || 0),
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

  // --- INVOICES ENDPOINTS ---

  app.get("/api/invoices", async (_req, res) => {
    try {
      const payload = await mutex.runExclusive(async () => {
        const cfg = await readConfigInternal();
        const list = await readInvoicesInternal(cfg.booksPath);
        const filePath = getInvoicesFilePath(cfg.booksPath);

        // Sort newest issueDate first, then reverse creation order
        const indexed = list.map((inv, idx) => ({ inv, idx }));
        indexed.sort((a, b) => {
          const dCmp = b.inv.issueDate.localeCompare(a.inv.issueDate);
          if (dCmp !== 0) return dCmp;
          return b.idx - a.idx;
        });
        const sorted = indexed.map((x) => x.inv);

        let unpaidCount = 0;
        let paidCount = 0;
        let unpaidAmount = 0;
        let paidAmount = 0;
        const recordInvoiceMap: Record<string, RecordInvoiceLink> = {};

        for (const inv of sorted) {
          if (inv.status === "Paid") {
            paidCount++;
            paidAmount += inv.total || 0;
          } else {
            unpaidCount++;
            unpaidAmount += inv.total || 0;
          }
          for (const recId of inv.linkedRecordIds) {
            if (recId && !recordInvoiceMap[recId]) {
              recordInvoiceMap[recId] = {
                invoiceId: inv.id,
                invoiceNumber: inv.invoiceNumber,
                status: inv.status,
              };
            }
          }
        }

        const { formatted: nextInvoiceNumber } = formatNextInvoiceNumber(
          cfg.businessProfile.invoicePrefix,
          cfg.nextInvoiceSeq,
          sorted
        );

        return {
          invoices: sorted,
          fileExists: fs.existsSync(filePath),
          nextInvoiceNumber,
          recordInvoiceMap,
          summary: {
            totalCount: sorted.length,
            unpaidCount,
            paidCount,
            unpaidAmount: roundMoney(unpaidAmount),
            paidAmount: roundMoney(paidAmount),
            totalAmount: roundMoney(unpaidAmount + paidAmount),
          },
        };
      });

      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/api/invoices/download", async (_req, res) => {
    try {
      const cfg = await mutex.runExclusive(() => readConfigInternal());
      const filePath = getInvoicesFilePath(cfg.booksPath);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "No Invoices.xlsx file exists yet." });
        return;
      }
      res.download(filePath, "Invoices.xlsx");
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/invoices", async (req, res) => {
    try {
      const created = await mutex.runExclusive(async () => {
        const cfg = await readConfigInternal();
        const existing = await readInvoicesInternal(cfg.booksPath);

        const { formatted: autoNum, seqUsed } = formatNextInvoiceNumber(
          cfg.businessProfile.invoicePrefix,
          cfg.nextInvoiceSeq,
          existing
        );

        const normalized = normalizeInvoiceInput(req.body);
        if (!normalized.invoiceNumber) {
          normalized.invoiceNumber = autoNum;
        }
        if (normalized.items.length === 0) {
          throw new Error("Invoice must contain at least one line item.");
        }

        existing.push(normalized);
        await writeInvoicesInternal(cfg.booksPath, existing);

        // Advance sequence counter if used or matched
        if (normalized.invoiceNumber === autoNum || seqUsed >= cfg.nextInvoiceSeq) {
          await writeSettingsKeysInternal({
            nextInvoiceSeq: String(seqUsed + 1),
          });
        }

        hasChangesSinceLastBackup = true;
        return normalized;
      });

      broadcastSync("invoices");
      ensureDailyBackup().catch(() => {});
      res.json({ success: true, invoice: created });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      res.status(code === "EXCEL_FILE_OPEN" ? 409 : 500).json({
        error: (error as Error).message,
        code,
      });
    }
  });

  app.put("/api/invoices/:id", async (req, res) => {
    try {
      const targetId = req.params.id;
      const updated = await mutex.runExclusive(async () => {
        const cfg = await readConfigInternal();
        const existing = await readInvoicesInternal(cfg.booksPath);
        const idx = existing.findIndex((i) => i.id === targetId);
        if (idx === -1) {
          throw new Error("Invoice not found.");
        }

        const prev = existing[idx];
        const nextInv = normalizeInvoiceInput(req.body, prev.id, prev.createdAt);
        if (!nextInv.invoiceNumber) {
          nextInv.invoiceNumber = prev.invoiceNumber;
        }
        if (nextInv.items.length === 0) {
          throw new Error("Invoice must contain at least one line item.");
        }

        existing[idx] = nextInv;
        await writeInvoicesInternal(cfg.booksPath, existing);
        hasChangesSinceLastBackup = true;
        return nextInv;
      });

      broadcastSync("invoices");
      res.json({ success: true, invoice: updated });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      res.status(code === "EXCEL_FILE_OPEN" ? 409 : 500).json({
        error: (error as Error).message,
        code,
      });
    }
  });

  app.patch("/api/invoices/:id/status", async (req, res) => {
    try {
      const targetId = req.params.id;
      const { status, paymentMethod, paidDate } = req.body as {
        status: InvoiceStatus;
        paymentMethod?: string;
        paidDate?: string;
      };

      const updated = await mutex.runExclusive(async () => {
        const cfg = await readConfigInternal();
        const existing = await readInvoicesInternal(cfg.booksPath);
        const idx = existing.findIndex((i) => i.id === targetId);
        if (idx === -1) {
          throw new Error("Invoice not found.");
        }

        const inv = existing[idx];
        const nextStatus: InvoiceStatus = status === "Paid" ? "Paid" : "Unpaid";
        inv.status = nextStatus;
        if (nextStatus === "Paid") {
          inv.paidDate =
            paidDate && /^\d{4}-\d{2}-\d{2}$/.test(paidDate)
              ? paidDate
              : inv.paidDate || format(new Date(), "yyyy-MM-dd");
          inv.paymentMethod = paymentMethod || inv.paymentMethod || "Bank Transfer";
        } else {
          inv.paidDate = "";
        }

        await writeInvoicesInternal(cfg.booksPath, existing);
        hasChangesSinceLastBackup = true;
        return inv;
      });

      broadcastSync("invoices");
      res.json({ success: true, invoice: updated });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      res.status(code === "EXCEL_FILE_OPEN" ? 409 : 500).json({
        error: (error as Error).message,
        code,
      });
    }
  });

  app.delete("/api/invoices/:id", async (req, res) => {
    try {
      const targetId = req.params.id;
      await mutex.runExclusive(async () => {
        const cfg = await readConfigInternal();
        const existing = await readInvoicesInternal(cfg.booksPath);
        const filtered = existing.filter((i) => i.id !== targetId);
        if (filtered.length === existing.length) {
          throw new Error("Invoice not found.");
        }
        await writeInvoicesInternal(cfg.booksPath, filtered);
        hasChangesSinceLastBackup = true;
      });

      broadcastSync("invoices");
      res.json({ success: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      res.status(code === "EXCEL_FILE_OPEN" ? 409 : 500).json({
        error: (error as Error).message,
        code,
      });
    }
  });

  app.get("/api/invoices/:id/print", async (req, res) => {
    try {
      const targetId = req.params.id;
      const autoPrint = req.query.autoprint === "1";
      const { invoice, business } = await mutex.runExclusive(async () => {
        const cfg = await readConfigInternal();
        const existing = await readInvoicesInternal(cfg.booksPath);
        const found = existing.find((i) => i.id === targetId);
        if (!found) throw new Error("Invoice not found.");
        return { invoice: found, business: cfg.businessProfile };
      });

      const html = renderInvoiceHtml(invoice, business, { forPdf: false, autoPrint });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      res.status(404).send((error as Error).message);
    }
  });

  function findSystemBrowserForPdf(): string | null {
    const candidates: string[] = [];
    if (process.platform === "win32") {
      const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
      const pf = process.env["ProgramFiles"] || "C:\\Program Files";
      const localApp = process.env["LOCALAPPDATA"] || "";
      candidates.push(
        path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(pf86, "Google", "Chrome", "Application", "chrome.exe")
      );
      if (localApp) {
        candidates.push(path.join(localApp, "Google", "Chrome", "Application", "chrome.exe"));
      }
    } else if (process.platform === "darwin") {
      candidates.push(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
      );
    } else {
      candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium");
    }

    for (const exe of candidates) {
      if (exe && fs.existsSync(exe)) return exe;
    }
    return null;
  }

  async function renderPdfWithSystemBrowser(htmlContent: string): Promise<Buffer | null> {
    const browserExe = findSystemBrowserForPdf();
    if (!browserExe) return null;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bk-pdf-"));
    const htmlPath = path.join(tmpDir, "invoice.html");
    const pdfPath = path.join(tmpDir, "invoice.pdf");
    try {
      fs.writeFileSync(htmlPath, htmlContent, "utf8");
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          browserExe,
          [
            "--headless",
            "--disable-gpu",
            "--no-pdf-header-footer",
            `--print-to-pdf=${pdfPath}`,
            htmlPath,
          ],
          { stdio: "ignore", windowsHide: true }
        );
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0 && fs.existsSync(pdfPath)) resolve();
          else reject(new Error(`Browser PDF exit code ${code}`));
        });
      });
      return fs.readFileSync(pdfPath);
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  }

  app.get("/api/invoices/:id/pdf", async (req, res) => {
    try {
      const targetId = req.params.id;
      const { invoice, business } = await mutex.runExclusive(async () => {
        const cfg = await readConfigInternal();
        const existing = await readInvoicesInternal(cfg.booksPath);
        const found = existing.find((i) => i.id === targetId);
        if (!found) throw new Error("Invoice not found.");
        return { invoice: found, business: cfg.businessProfile };
      });

      const html = renderInvoiceHtml(invoice, business, { forPdf: true });
      let pdfBuffer: Buffer | null = null;
      if (options.onRenderPdf) {
        pdfBuffer = await options.onRenderPdf(html);
      } else {
        pdfBuffer = await renderPdfWithSystemBrowser(html);
      }

      if (!pdfBuffer) {
        res.redirect(`/api/invoices/${encodeURIComponent(targetId)}/print?autoprint=1`);
        return;
      }

      const fullFileName = buildInvoicePdfFileName(invoice);
      const asciiFallback =
        fullFileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "Invoice.pdf";
      const encodedUtf8 = encodeURIComponent(fullFileName);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`
      );
      res.send(pdfBuffer);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
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
        const currentBooks = listAllBookFiles(currentCfg.booksPath);
        const currentInvPath = getInvoicesFilePath(currentCfg.booksPath);
        const filesToVerify = [...currentBooks.map((b) => b.fullPath)];
        if (fs.existsSync(currentInvPath)) filesToVerify.push(currentInvPath);

        for (const fPath of filesToVerify) {
          try {
            const fd = fs.openSync(fPath, "r+");
            fs.closeSync(fd);
          } catch (err) {
            if (isFileBusyError(err)) {
              const busyErr = new Error(
                `Please close "${path.basename(fPath)}" in Microsoft Excel before restoring.`
              ) as NodeJS.ErrnoException;
              busyErr.code = "EXCEL_FILE_OPEN";
              throw busyErr;
            }
          }
        }

        const safetyBackup = await createBackupInternal("safety");

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

        // Restore Invoices.xlsx
        const restoredInvDest = getInvoicesFilePath(restoredCfg.booksPath);
        const backupInvoicesPath = path.join(sourceDir, "Invoices.xlsx");
        if (fs.existsSync(backupInvoicesPath)) {
          fs.copyFileSync(backupInvoicesPath, restoredInvDest);
        } else if (fs.existsSync(restoredInvDest)) {
          try {
            fs.unlinkSync(restoredInvDest);
          } catch {
            // ignore
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

  // --- LOCAL PC HELPERS ---

  app.post("/api/system/open-folder", async (req, res) => {
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: "Only available directly on the host computer." });
      return;
    }
    try {
      const { month, invoices } = req.body as { month?: string; invoices?: boolean };
      const cfg = await mutex.runExclusive(() => readConfigInternal());
      let target = cfg.booksPath;
      if (invoices) {
        const invFile = getInvoicesFilePath(cfg.booksPath);
        if (fs.existsSync(invFile)) {
          target = invFile;
        }
      } else if (month && /^\d{4}-\d{2}$/.test(month)) {
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

  const isDevMode =
    process.env.NODE_ENV !== "production" && !options.isElectron && !process.env.ELECTRON_RUN;
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

const invokedScript = process.argv[1] || "";
if (
  !process.versions.electron &&
  (invokedScript.endsWith("server.ts") ||
    invokedScript.endsWith("server.cjs") ||
    invokedScript.endsWith("server.js"))
) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
