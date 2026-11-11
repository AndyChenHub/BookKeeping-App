export type Language = "zh" | "en";

export type ActiveTab = "entry" | "records" | "backup";

export interface ConfigData {
  locations: string[];
  agents: string[];
  descriptions: Record<string, string>;
  customBooksPath: string;
  booksPath: string;
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

export interface BackupManifest {
  id: string;
  createdAt: string;
  dateKey: string;
  reason: "daily" | "manual" | "safety";
  bookCount: number;
  recordCount: number;
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
  remoteClients: number;
  primaryUrl: string;
  primaryQrDataUrl: string;
  interfaces: NetworkInterfaceInfo[];
  dataDir: string;
  booksPath: string;
}
