export type Language = "zh" | "en";

export type ActiveTab = "entry" | "records" | "invoices" | "backup";

export interface BusinessProfile {
  businessName: string;
  businessAbn: string;
  gstRegistered?: boolean;
  businessPhone: string;
  businessEmail: string;
  businessAddress: string;
  bankAccountName: string;
  bankBsb: string;
  bankAccountNumber: string;
  payId?: string;
  invoicePrefix: string;
}

export interface ConfigData {
  locations: string[];
  agents: string[];
  descriptions: Record<string, string>;
  customBooksPath: string;
  booksPath: string;
  businessProfile: BusinessProfile;
}

export interface Transaction {
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

export interface MonthSummary {
  count: number;
  total: number;
  cashTotal: number;
  cardTotal: number;
  partsTotal: number;
  gstTotal: number;
}

export interface TransactionsResponse {
  month: string;
  fileExists: boolean;
  fileName: string;
  transactions: Transaction[];
  availableMonths: string[];
  summary: MonthSummary;
}

export interface InvoiceLineItem {
  id: string;
  recordId?: string;
  date: string;
  description: string;
  quantity?: number;
  parts: number;
  gst: number;
  total: number;
}

export type InvoiceStatus = "Unpaid" | "Paid";

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  clientName: string;
  clientAbn?: string;
  serviceAddress: string;
  clientDetails: string;
  items: InvoiceLineItem[];
  linkedRecordIds: string[];
  partsTotal: number;
  gstTotal: number;
  total: number;
  paidDate: string;
  paymentMethod: string;
  notes: string;
  createdAt: string;
}

export interface InvoiceSummary {
  totalCount: number;
  unpaidCount: number;
  paidCount: number;
  unpaidAmount: number;
  paidAmount: number;
  totalAmount: number;
}

export interface RecordInvoiceLink {
  invoiceId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
}

export interface InvoicesResponse {
  invoices: InvoiceRecord[];
  summary: InvoiceSummary;
  nextInvoiceNumber: string;
  fileExists: boolean;
  recordInvoiceMap: Record<string, RecordInvoiceLink>;
}

export interface BackupManifest {
  id: string;
  createdAt: string;
  dateKey: string;
  reason: "daily" | "manual" | "safety";
  bookCount: number;
  recordCount: number;
  invoiceCount?: number;
  totalAmount: number;
}

export interface BackupsResponse {
  backups: BackupManifest[];
  backedUpToday: boolean;
  latestBackup: BackupManifest | null;
}

export interface NetworkInterfaceInfo {
  name: string;
  ip: string;
  url: string;
  qrDataUrl: string;
}

export interface ServerInfo {
  port: number;
  hostname: string;
  isLocalMachine: boolean;
  canPickFolder: boolean;
  canRenderPdf: boolean;
  remoteClients: number;
  primaryUrl: string;
  primaryQrDataUrl: string;
  interfaces: NetworkInterfaceInfo[];
  dataDir: string;
  booksPath: string;
}
