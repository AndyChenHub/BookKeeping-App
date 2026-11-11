import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus,
  Check,
  CheckCircle2,
  Banknote,
  CreditCard,
  Calendar as CalendarIcon,
  MapPin,
  User,
  Smartphone,
  ShieldCheck,
  RotateCcw,
  FolderOpen,
  FileSpreadsheet,
  Download,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  BookOpen,
  PlusCircle,
  Settings2,
  AlertCircle,
  X,
  Wifi,
  Copy,
} from "lucide-react";
import { format, subDays, addMonths, subMonths, parseISO, isValid } from "date-fns";
import type {
  ActiveTab,
  BackupManifest,
  BackupsResponse,
  ConfigData,
  Language,
  ServerInfo,
  Transaction,
  TransactionsResponse,
} from "./types";
import {
  translations,
  formatFriendlyDate,
  formatFriendlyMonth,
  formatBackupDateTime,
  localizeDescription,
  localizePayment,
} from "./i18n";
import {
  CalendarModal,
  OptionPickerModal,
  AddConfigItemModal,
  ConnectPhoneModal,
  EditTransactionModal,
  ConfirmModal,
} from "./components/Modals";

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem("bookkeeping_lang");
    if (saved === "zh" || saved === "en") return saved;
    return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  });

  const t = translations[lang];

  const changeLang = (next: Language) => {
    setLang(next);
    localStorage.setItem("bookkeeping_lang", next);
  };

  const [activeTab, setActiveTab] = useState<ActiveTab>("entry");
  const [loading, setLoading] = useState(true);

  // Server state
  const [config, setConfig] = useState<ConfigData>({
    locations: [],
    agents: [],
    descriptions: {},
    customBooksPath: "",
    booksPath: "",
  });
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [recordsMonth, setRecordsMonth] = useState<string>(() => format(new Date(), "yyyy-MM"));
  const [monthData, setMonthData] = useState<TransactionsResponse>({
    month: format(new Date(), "yyyy-MM"),
    fileExists: false,
    fileName: "",
    transactions: [],
    availableMonths: [format(new Date(), "yyyy-MM")],
    summary: { count: 0, total: 0, cashTotal: 0, cardTotal: 0, partsTotal: 0, gstTotal: 0 },
  });
  const [todayTransactions, setTodayTransactions] = useState<Transaction[]>([]);
  const [backupsData, setBackupsData] = useState<BackupsResponse>({
    backups: [],
    backedUpToday: false,
    latestBackup: null,
  });

  // Entry Form State
  const [selectedDescriptions, setSelectedDescriptions] = useState<Set<string>>(new Set());
  const [extraNote, setExtraNote] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Card">("Cash");
  const [partsAmount, setPartsAmount] = useState("");
  const [gstAmount, setGstAmount] = useState("");
  const [entryDate, setEntryDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [location, setLocation] = useState<string>(() => localStorage.getItem("bk_last_loc") || "");
  const [agent, setAgent] = useState<string>(() => localStorage.getItem("bk_last_agent") || "");
  const [validationHint, setValidationHint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Records Filter State
  const [paymentFilter, setPaymentFilter] = useState<"all" | "cash" | "card">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Manage Lists Sub-tab in Settings
  const [manageSection, setManageSection] = useState<"description" | "location" | "agent">("description");
  const [manualPathInput, setManualPathInput] = useState("");
  const [editingFolderManually, setEditingFolderManually] = useState(false);

  // Modals & Feedback Banners
  const [showCalendar, setShowCalendar] = useState(false);
  const [pickerModal, setPickerModal] = useState<"location" | "agent" | null>(null);
  const [addModal, setAddModal] = useState<"description" | "location" | "agent" | null>(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Transaction | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<Transaction | null>(null);
  const [restoringBackup, setRestoringBackup] = useState<BackupManifest | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [toast, setToast] = useState<{ title: string; subtitle?: string } | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copiedInlineUrl, setCopiedInlineUrl] = useState(false);

  const showToast = useCallback((title: string, subtitle?: string) => {
    setToast({ title, subtitle });
    setTimeout(() => {
      setToast((curr) => (curr?.title === title ? null : curr));
    }, 2200);
  }, []);

  const fetchAllData = useCallback(
    async (targetMonth?: string) => {
      const mKey = targetMonth || recordsMonth;
      const currentMonthKey = format(new Date(), "yyyy-MM");
      const todayKey = format(new Date(), "yyyy-MM-dd");

      try {
        const [cfgRes, txRes, bkpRes, infoRes] = await Promise.all([
          fetch("/api/config"),
          fetch(`/api/transactions?month=${encodeURIComponent(mKey)}`),
          fetch("/api/backups"),
          fetch("/api/server-info"),
        ]);

        if (cfgRes.ok) {
          const cfgJson: ConfigData = await cfgRes.json();
          setConfig(cfgJson);
        }
        if (txRes.ok) {
          const txJson: TransactionsResponse = await txRes.json();
          setMonthData(txJson);
          if (mKey === currentMonthKey) {
            setTodayTransactions(txJson.transactions.filter((r) => r.date === todayKey));
          } else {
            const curRes = await fetch(`/api/transactions?month=${encodeURIComponent(currentMonthKey)}`);
            if (curRes.ok) {
              const curJson: TransactionsResponse = await curRes.json();
              setTodayTransactions(curJson.transactions.filter((r) => r.date === todayKey));
            }
          }
        }
        if (bkpRes.ok) {
          const bkpJson: BackupsResponse = await bkpRes.json();
          setBackupsData(bkpJson);
        }
        if (infoRes.ok) {
          const infoJson: ServerInfo = await infoRes.json();
          setServerInfo(infoJson);
        }
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    },
    [recordsMonth]
  );

  useEffect(() => {
    fetchAllData(recordsMonth);
  }, [fetchAllData, recordsMonth]);

  // Real-time SSE Sync across Computer & Phone
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = () => {
      fetchAllData();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchAllData();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      es.close();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchAllData]);

  // Remember Location & Agent smoothly
  const handleSelectLocation = (val: string) => {
    setLocation(val);
    localStorage.setItem("bk_last_loc", val);
  };

  const handleSelectAgent = (val: string) => {
    setAgent(val);
    localStorage.setItem("bk_last_agent", val);
  };

  const toggleDescription = (zh: string) => {
    setValidationHint(null);
    setSelectedDescriptions((prev) => {
      const next = new Set(prev);
      if (next.has(zh)) next.delete(zh);
      else next.add(zh);
      return next;
    });
  };

  // Build standardized English description for Excel storage
  const englishDescriptionForSave = useMemo(() => {
    const items = Array.from(selectedDescriptions).map((zh) => config.descriptions[zh] || zh);
    if (extraNote.trim()) {
      items.push(extraNote.trim());
    }
    return items.join(", ");
  }, [selectedDescriptions, config.descriptions, extraNote]);

  // Build localized preview for current screen language
  const localizedSelectedPreview = useMemo(() => {
    const items = Array.from(selectedDescriptions).map((zh) =>
      lang === "zh" ? zh : config.descriptions[zh] || zh
    );
    if (extraNote.trim()) {
      items.push(extraNote.trim());
    }
    return items.join(lang === "zh" ? "，" : ", ");
  }, [selectedDescriptions, config.descriptions, extraNote, lang]);

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    const hasDesc = Boolean(englishDescriptionForSave.trim());
    const numericTotal = parseFloat(totalAmount);
    const hasTotal = Number.isFinite(numericTotal) && numericTotal > 0;

    if (!hasDesc && !hasTotal) {
      setValidationHint(t.validationMissingBoth);
      return;
    }
    if (!hasDesc) {
      setValidationHint(t.validationMissingDesc);
      return;
    }
    if (!hasTotal) {
      setValidationHint(t.validationMissingTotal);
      return;
    }

    setValidationHint(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: entryDate,
          paymentMethod,
          location,
          agent,
          description: englishDescriptionForSave,
          amount: parseFloat(partsAmount) || 0,
          gst: parseFloat(gstAmount) || 0,
          total: numericTotal,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save transaction.");
      }

      // Clear per-transaction fields while keeping Date, Payment, Location, Agent ready for quick repeat entry
      setSelectedDescriptions(new Set());
      setExtraNote("");
      setTotalAmount("");
      setPartsAmount("");
      setGstAmount("");

      showToast(`${t.savedSuccessTitle} $${numericTotal.toFixed(2)}`, t.savedSuccessSub);
      await fetchAllData();
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddConfigItem = async (
    type: "description" | "location" | "agent",
    value: string,
    translation?: string
  ) => {
    setErrorBanner(null);
    const res = await fetch("/api/config/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value, translation }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorBanner(data.error || "Could not save item.");
      throw new Error(data.error);
    }
    await fetchAllData();
    if (type === "description") {
      setSelectedDescriptions((prev) => new Set(prev).add(value));
    }
  };

  const handleDeleteConfigItem = async (type: "description" | "location" | "agent", value: string) => {
    setErrorBanner(null);
    const res = await fetch("/api/config/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorBanner(data.error || "Could not remove item.");
      return;
    }
    if (type === "location" && location === value) handleSelectLocation("");
    if (type === "agent" && agent === value) handleSelectAgent("");
    if (type === "description") {
      setSelectedDescriptions((prev) => {
        const next = new Set(prev);
        next.delete(value);
        return next;
      });
    }
    await fetchAllData();
  };

  const handleUpdateTransaction = async (
    id: string,
    updated: Omit<Transaction, "id">,
    originalMonth: string
  ) => {
    setErrorBanner(null);
    const res = await fetch(`/api/transactions/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...updated, originalMonth }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorBanner(data.error || "Failed to update record.");
      throw new Error(data.error);
    }
    showToast(t.savedSuccessTitle);
    await fetchAllData();
  };

  const handleConfirmDeleteRecord = async () => {
    if (!deletingRecord) return;
    setActionBusy(true);
    setErrorBanner(null);
    try {
      const mKey = deletingRecord.date.slice(0, 7);
      const res = await fetch(
        `/api/transactions/${encodeURIComponent(deletingRecord.id)}?month=${encodeURIComponent(mKey)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete record.");
      }
      setDeletingRecord(null);
      await fetchAllData();
    } catch (err) {
      setErrorBanner((err as Error).message);
      setDeletingRecord(null);
    } finally {
      setActionBusy(false);
    }
  };

  const handleManualBackup = async () => {
    setActionBusy(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/backups", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Backup failed.");
      showToast(t.backupSuccessToast);
      await fetchAllData();
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoringBackup) return;
    setActionBusy(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(restoringBackup.id)}/restore`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Restore failed.");
      setRestoringBackup(null);
      showToast(t.restoreSuccessToast);
      await fetchAllData();
    } catch (err) {
      setErrorBanner((err as Error).message);
      setRestoringBackup(null);
    } finally {
      setActionBusy(false);
    }
  };

  const handleOpenFolderOrExcel = async (month?: string) => {
    await fetch("/api/system/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
  };

  const handlePickStorageFolder = async () => {
    if (serverInfo?.canPickFolder) {
      const res = await fetch("/api/system/pick-folder", { method: "POST" });
      const data = await res.json();
      if (data.folderPath) {
        await fetch("/api/config/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "settings", value: data.folderPath }),
        });
        await fetchAllData();
      }
    } else {
      setManualPathInput(config.booksPath);
      setEditingFolderManually(true);
    }
  };

  const handleSaveManualFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/config/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "settings", value: manualPathInput.trim() }),
    });
    if (res.ok) {
      setEditingFolderManually(false);
      await fetchAllData();
    }
  };

  const handleResetFolder = async () => {
    await fetch("/api/config/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "settings", value: "" }),
    });
    await fetchAllData();
  };

  // Filtered & Date-Grouped Records for Tab 2
  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return monthData.transactions.filter((tx) => {
      if (paymentFilter === "cash" && tx.paymentMethod.toLowerCase() === "card") return false;
      if (paymentFilter === "card" && tx.paymentMethod.toLowerCase() !== "card") return false;
      if (!q) return true;
      const zhDesc = localizeDescription(tx.description, config.descriptions, "zh").toLowerCase();
      return (
        tx.description.toLowerCase().includes(q) ||
        zhDesc.includes(q) ||
        tx.location.toLowerCase().includes(q) ||
        tx.agent.toLowerCase().includes(q) ||
        tx.date.includes(q)
      );
    });
  }, [monthData.transactions, paymentFilter, searchQuery, config.descriptions]);

  const groupedTransactions = useMemo(() => {
    const groups: Array<{ date: string; items: Transaction[]; dayTotal: number }> = [];
    const map = new Map<string, { date: string; items: Transaction[]; dayTotal: number }>();
    for (const tx of filteredTransactions) {
      let group = map.get(tx.date);
      if (!group) {
        group = { date: tx.date, items: [], dayTotal: 0 };
        map.set(tx.date, group);
        groups.push(group);
      }
      group.items.push(tx);
      group.dayTotal += tx.total || 0;
    }
    return groups;
  }, [filteredTransactions]);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const currentMonthStr = format(new Date(), "yyyy-MM");

  const shiftMonth = (delta: number) => {
    const parsed = parseISO(`${recordsMonth}-01`);
    if (!isValid(parsed)) return;
    const next = delta > 0 ? addMonths(parsed, delta) : subMonths(parsed, Math.abs(delta));
    setRecordsMonth(format(next, "yyyy-MM"));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] p-6">
        <div className="w-16 h-16 rounded-3xl bg-[#1E9E49] flex items-center justify-center shadow-lg shadow-[#1E9E49]/25 mb-5">
          <CheckCircle2 size={36} className="text-white animate-pulse" />
        </div>
        <p className="text-2xl font-semibold text-[#1D1D1F]">{t.loadingText}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F7] text-[#1D1D1F] pb-28 md:pb-10">
      {/* Top Translucent Apple Navigation Bar */}
      <header className="sticky top-0 z-30 apple-glass border-b border-black/[0.07] safe-top">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 sm:h-20 flex items-center justify-between gap-3">
          {/* App Brand + Sync Status */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-b from-[#34C759] to-[#1E9E49] flex items-center justify-center shadow-sm shrink-0">
              <Check size={26} strokeWidth={3} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1D1F] leading-tight truncate">
                {t.appName}
              </h1>
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#1E9E49]">
                <span className="w-2 h-2 rounded-full bg-[#34C759]" />
                <span className="truncate">
                  {serverInfo && serverInfo.remoteClients > 0
                    ? t.phoneConnected(serverInfo.remoteClients)
                    : t.synced}
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Center Segmented Control */}
          <nav className="hidden md:flex items-center bg-[#E8E8ED]/90 p-1 rounded-2xl">
            {(
              [
                { id: "entry", label: t.tabEntry, icon: PlusCircle },
                { id: "records", label: t.tabRecords, icon: BookOpen },
                { id: "backup", label: t.tabBackup, icon: ShieldCheck },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "px-5 py-2.5 rounded-xl text-base font-semibold flex items-center gap-2 transition-all",
                    active
                      ? "bg-white text-[#1D1D1F] shadow-sm"
                      : "text-[#515154] hover:text-[#1D1D1F]",
                  ].join(" ")}
                >
                  <Icon size={20} className={active ? "text-[#007AFF]" : "text-[#86868B]"} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Controls: Phone QR + Language Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {serverInfo?.isLocalMachine && (
              <button
                type="button"
                onClick={() => setShowPhoneModal(true)}
                className="h-11 px-3.5 sm:px-4 rounded-2xl bg-[#007AFF]/10 hover:bg-[#007AFF]/15 text-[#007AFF] font-semibold text-base flex items-center gap-2 transition active:scale-95"
              >
                <Smartphone size={20} />
                <span className="hidden sm:inline">{t.connectPhoneBtn}</span>
              </button>
            )}

            {/* Clean 1-Tap Language Switcher */}
            <div
              className="h-11 bg-[#E8E8ED] p-1 rounded-2xl flex items-center"
              role="group"
              aria-label="Language Switch"
            >
              <button
                type="button"
                onClick={() => changeLang("zh")}
                className={[
                  "px-3 h-9 rounded-xl text-sm sm:text-base font-bold transition",
                  lang === "zh"
                    ? "bg-white text-[#1D1D1F] shadow-sm"
                    : "text-[#515154] hover:text-[#1D1D1F]",
                ].join(" ")}
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => changeLang("en")}
                className={[
                  "px-3 h-9 rounded-xl text-sm sm:text-base font-bold transition",
                  lang === "en"
                    ? "bg-white text-[#1D1D1F] shadow-sm"
                    : "text-[#515154] hover:text-[#1D1D1F]",
                ].join(" ")}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Error Alert Banner (e.g. if Excel file is currently locked open in Microsoft Excel) */}
      {errorBanner && (
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="bg-[#FF3B30]/10 border border-[#FF3B30]/25 text-[#C92A2A] rounded-2xl p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle size={24} className="shrink-0 mt-0.5" />
              <p className="text-lg font-semibold leading-snug">{errorBanner}</p>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="p-1 rounded-lg hover:bg-black/5"
            >
              <X size={22} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-5 sm:pt-7">
        {/* ================= TAB 1: NEW ENTRY ================= */}
        {activeTab === "entry" && (
          <form onSubmit={handleSaveEntry} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column on Desktop: Step 1 (Items) + Step 3 (Details) */}
            <div className="lg:col-span-7 space-y-6">
              {/* STEP 1: WHAT WAS THIS FOR? */}
              <section className="apple-card p-5 sm:p-7">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-[#1D1D1F]">{t.stepWhat}</h2>
                    <p className="text-base text-[#515154] mt-0.5">{t.stepWhatHint}</p>
                  </div>
                  {selectedDescriptions.size > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDescriptions(new Set());
                        setExtraNote("");
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-base font-semibold text-[#515154] shrink-0"
                    >
                      {t.clearSelection}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(config.descriptions).map(([zh, en]) => {
                    const selected = selectedDescriptions.has(zh);
                    const displayLabel = lang === "zh" ? zh : en;
                    return (
                      <button
                        key={zh}
                        type="button"
                        onClick={() => toggleDescription(zh)}
                        className={[
                          "min-h-[72px] px-4 py-3.5 rounded-2xl text-xl font-semibold flex items-center justify-between gap-2 text-left transition-all active:scale-[0.98]",
                          selected
                            ? "bg-[#007AFF] text-white shadow-md shadow-[#007AFF]/25 ring-2 ring-[#007AFF]"
                            : "bg-[#F5F5F7] hover:bg-[#EBEBF0] text-[#1D1D1F]",
                        ].join(" ")}
                      >
                        <span className="leading-snug break-words">{displayLabel}</span>
                        <span
                          className={[
                            "w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition",
                            selected ? "bg-white text-[#007AFF]" : "bg-black/[0.06] text-transparent",
                          ].join(" ")}
                        >
                          <Check size={18} strokeWidth={3} />
                        </span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setAddModal("description")}
                    className="min-h-[72px] px-4 py-3.5 rounded-2xl border-2 border-dashed border-[#007AFF]/40 hover:border-[#007AFF] bg-[#007AFF]/[0.04] hover:bg-[#007AFF]/[0.08] text-[#007AFF] text-xl font-semibold flex items-center justify-center gap-2 transition active:scale-[0.98]"
                  >
                    <Plus size={24} />
                    <span>{t.addNewItemBtn}</span>
                  </button>
                </div>

                {/* Optional Extra Note */}
                <div className="mt-4">
                  <input
                    type="text"
                    value={extraNote}
                    onChange={(e) => {
                      setValidationHint(null);
                      setExtraNote(e.target.value);
                    }}
                    placeholder={t.extraNotePlaceholder}
                    className="w-full h-14 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-lg font-medium outline-none transition"
                  />
                </div>

                {/* Selected Preview Strip */}
                <div className="mt-4 px-4 py-3 rounded-2xl bg-[#F5F5F7]/80 flex items-center gap-2 text-lg">
                  <span className="font-semibold text-[#515154] shrink-0">{t.selectedLabel}</span>
                  {localizedSelectedPreview ? (
                    <span className="font-bold text-[#007AFF] break-words">
                      {localizedSelectedPreview}
                    </span>
                  ) : (
                    <span className="text-[#86868B]">{t.noneSelectedYet}</span>
                  )}
                </div>
              </section>

              {/* STEP 3 ON DESKTOP (Shown below Step 2 on Mobile via CSS order if desired, or clean flow) */}
              <section className="hidden lg:block apple-card p-5 sm:p-7 space-y-5">
                <h2 className="text-2xl font-bold text-[#1D1D1F]">{t.stepDetails}</h2>

                {/* Date Quick Selector */}
                <div>
                  <label className="block text-base font-semibold text-[#515154] mb-2.5">
                    {t.dateLabel}
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setEntryDate(todayStr)}
                      className={[
                        "h-14 rounded-2xl text-lg font-semibold transition",
                        entryDate === todayStr
                          ? "bg-[#007AFF] text-white shadow-sm"
                          : "bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F]",
                      ].join(" ")}
                    >
                      {t.today}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntryDate(yesterdayStr)}
                      className={[
                        "h-14 rounded-2xl text-lg font-semibold transition",
                        entryDate === yesterdayStr
                          ? "bg-[#007AFF] text-white shadow-sm"
                          : "bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F]",
                      ].join(" ")}
                    >
                      {t.yesterday}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCalendar(true)}
                      className={[
                        "h-14 px-3 rounded-2xl text-base sm:text-lg font-semibold flex items-center justify-center gap-2 transition",
                        entryDate !== todayStr && entryDate !== yesterdayStr
                          ? "bg-[#007AFF] text-white shadow-sm"
                          : "bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F]",
                      ].join(" ")}
                    >
                      <CalendarIcon size={20} className="shrink-0" />
                      <span className="truncate">
                        {entryDate !== todayStr && entryDate !== yesterdayStr
                          ? entryDate
                          : t.otherDate}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Location & Person */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-base font-semibold text-[#515154] mb-2">
                      {t.locationLabel}
                    </label>
                    <button
                      type="button"
                      onClick={() => setPickerModal("location")}
                      className="w-full h-15 px-4 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center gap-3 text-left transition"
                    >
                      <MapPin size={22} className="text-[#007AFF] shrink-0" />
                      <span
                        className={[
                          "text-lg font-semibold truncate",
                          location ? "text-[#1D1D1F]" : "text-[#86868B]",
                        ].join(" ")}
                      >
                        {location || t.locationPlaceholder}
                      </span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-[#515154] mb-2">
                      {t.agentLabel}
                    </label>
                    <button
                      type="button"
                      onClick={() => setPickerModal("agent")}
                      className="w-full h-15 px-4 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center gap-3 text-left transition"
                    >
                      <User size={22} className="text-[#007AFF] shrink-0" />
                      <span
                        className={[
                          "text-lg font-semibold truncate",
                          agent ? "text-[#1D1D1F]" : "text-[#86868B]",
                        ].join(" ")}
                      >
                        {agent || t.agentPlaceholder}
                      </span>
                    </button>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column on Desktop: Step 2 (Amount & Payment) + Mobile Step 3 + Save Button + Saved Today */}
            <div className="lg:col-span-5 space-y-6">
              {/* STEP 2: AMOUNT & PAYMENT */}
              <section className="apple-card p-5 sm:p-7 space-y-5">
                <h2 className="text-2xl font-bold text-[#1D1D1F]">{t.stepAmount}</h2>

                {/* Giant Total Amount Input */}
                <div>
                  <label className="block text-base font-semibold text-[#515154] mb-2">
                    {t.totalAmount}
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-5 text-3xl font-bold text-[#86868B] select-none">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={totalAmount}
                      onChange={(e) => {
                        setValidationHint(null);
                        setTotalAmount(e.target.value);
                      }}
                      className="w-full h-20 pl-13 pr-12 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-4xl font-bold tabular-nums text-[#1D1D1F] outline-none transition"
                    />
                    {totalAmount && (
                      <button
                        type="button"
                        onClick={() => setTotalAmount("")}
                        className="absolute right-4 w-9 h-9 rounded-full bg-black/10 hover:bg-black/15 flex items-center justify-center text-[#515154]"
                        aria-label={t.clearSelection}
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Cash vs Card */}
                <div>
                  <label className="block text-base font-semibold text-[#515154] mb-2">
                    {t.paymentMethod}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("Cash")}
                      className={[
                        "h-16 rounded-2xl text-xl font-bold flex items-center justify-center gap-2.5 transition active:scale-[0.98]",
                        paymentMethod === "Cash"
                          ? "bg-[#1E9E49] text-white shadow-md shadow-[#1E9E49]/25"
                          : "bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F]",
                      ].join(" ")}
                    >
                      <Banknote size={26} />
                      <span>{t.cash}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("Card")}
                      className={[
                        "h-16 rounded-2xl text-xl font-bold flex items-center justify-center gap-2.5 transition active:scale-[0.98]",
                        paymentMethod === "Card"
                          ? "bg-[#007AFF] text-white shadow-md shadow-[#007AFF]/25"
                          : "bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F]",
                      ].join(" ")}
                    >
                      <CreditCard size={26} />
                      <span>{t.card}</span>
                    </button>
                  </div>
                </div>

                {/* Optional Parts & GST */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-sm sm:text-base font-semibold text-[#515154] mb-2">
                      {t.partsCost}
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-4 text-xl font-semibold text-[#86868B]">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={partsAmount}
                        onChange={(e) => setPartsAmount(e.target.value)}
                        className="w-full h-14 pl-9 pr-3 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-xl font-semibold tabular-nums outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm sm:text-base font-semibold text-[#515154] mb-2">
                      {t.gstAmount}
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-4 text-xl font-semibold text-[#86868B]">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={gstAmount}
                        onChange={(e) => setGstAmount(e.target.value)}
                        className="w-full h-14 pl-9 pr-3 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-xl font-semibold tabular-nums outline-none transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Helpful 1-Tap GST Shortcut */}
                {parseFloat(totalAmount) > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setGstAmount(((parseFloat(totalAmount) || 0) / 11).toFixed(2))}
                      className="px-3.5 py-1.5 rounded-xl bg-[#007AFF]/10 hover:bg-[#007AFF]/15 text-[#007AFF] text-sm font-semibold flex items-center gap-1.5 transition"
                    >
                      <Sparkles size={15} />
                      <span>
                        {t.calcGst10} (${((parseFloat(totalAmount) || 0) / 11).toFixed(2)})
                      </span>
                    </button>
                    {gstAmount && (
                      <button
                        type="button"
                        onClick={() => setGstAmount("")}
                        className="px-3 py-1.5 rounded-xl bg-[#F5F5F7] text-[#515154] text-sm font-semibold"
                      >
                        {t.noGst}
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* STEP 3 ON MOBILE/TABLET (Natural 1 -> 2 -> 3 order on touchscreens!) */}
              <section className="lg:hidden apple-card p-5 sm:p-7 space-y-5">
                <h2 className="text-2xl font-bold text-[#1D1D1F]">{t.stepDetails}</h2>

                <div>
                  <label className="block text-base font-semibold text-[#515154] mb-2.5">
                    {t.dateLabel}
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setEntryDate(todayStr)}
                      className={[
                        "h-14 rounded-2xl text-lg font-semibold transition",
                        entryDate === todayStr
                          ? "bg-[#007AFF] text-white shadow-sm"
                          : "bg-[#F5F5F7] text-[#1D1D1F]",
                      ].join(" ")}
                    >
                      {t.today}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntryDate(yesterdayStr)}
                      className={[
                        "h-14 rounded-2xl text-lg font-semibold transition",
                        entryDate === yesterdayStr
                          ? "bg-[#007AFF] text-white shadow-sm"
                          : "bg-[#F5F5F7] text-[#1D1D1F]",
                      ].join(" ")}
                    >
                      {t.yesterday}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCalendar(true)}
                      className={[
                        "h-14 px-2 rounded-2xl text-base font-semibold flex items-center justify-center gap-1.5 transition",
                        entryDate !== todayStr && entryDate !== yesterdayStr
                          ? "bg-[#007AFF] text-white shadow-sm"
                          : "bg-[#F5F5F7] text-[#1D1D1F]",
                      ].join(" ")}
                    >
                      <CalendarIcon size={18} className="shrink-0" />
                      <span className="truncate">
                        {entryDate !== todayStr && entryDate !== yesterdayStr
                          ? entryDate.slice(5)
                          : t.otherDate}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-base font-semibold text-[#515154] mb-1.5">
                      {t.locationLabel}
                    </label>
                    <button
                      type="button"
                      onClick={() => setPickerModal("location")}
                      className="w-full h-14 px-4 rounded-2xl bg-[#F5F5F7] flex items-center gap-3 text-left"
                    >
                      <MapPin size={22} className="text-[#007AFF] shrink-0" />
                      <span
                        className={[
                          "text-lg font-semibold truncate",
                          location ? "text-[#1D1D1F]" : "text-[#86868B]",
                        ].join(" ")}
                      >
                        {location || t.locationPlaceholder}
                      </span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-[#515154] mb-1.5">
                      {t.agentLabel}
                    </label>
                    <button
                      type="button"
                      onClick={() => setPickerModal("agent")}
                      className="w-full h-14 px-4 rounded-2xl bg-[#F5F5F7] flex items-center gap-3 text-left"
                    >
                      <User size={22} className="text-[#007AFF] shrink-0" />
                      <span
                        className={[
                          "text-lg font-semibold truncate",
                          agent ? "text-[#1D1D1F]" : "text-[#86868B]",
                        ].join(" ")}
                      >
                        {agent || t.agentPlaceholder}
                      </span>
                    </button>
                  </div>
                </div>
              </section>

              {/* Validation Gentle Guidance + Primary Save Button */}
              <div className="space-y-3">
                {validationHint && (
                  <div className="px-4 py-3 rounded-2xl bg-[#FF9500]/12 border border-[#FF9500]/30 text-[#B25E00] text-lg font-semibold flex items-center gap-2.5">
                    <AlertCircle size={22} className="shrink-0" />
                    <span>{validationHint}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[70px] px-6 py-4 rounded-3xl bg-[#1E9E49] hover:bg-[#19873E] text-white text-2xl font-bold shadow-lg shadow-[#1E9E49]/25 flex items-center justify-center gap-3 transition active:scale-[0.98] disabled:opacity-60"
                >
                  <CheckCircle2 size={30} />
                  <span>
                    {submitting
                      ? t.saving
                      : parseFloat(totalAmount) > 0
                      ? t.saveEntryWithAmount((parseFloat(totalAmount) || 0).toFixed(2))
                      : t.saveEntryBtn}
                  </span>
                </button>
              </div>

              {/* Reassuring "Saved Today" Card */}
              <section className="apple-card p-5 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-[#1D1D1F]">{t.savedTodayTitle}</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setRecordsMonth(currentMonthStr);
                      setActiveTab("records");
                    }}
                    className="text-base font-semibold text-[#007AFF] hover:underline"
                  >
                    {t.viewAllRecords}
                  </button>
                </div>

                {todayTransactions.length === 0 ? (
                  <p className="text-base text-[#86868B] py-3">{t.savedTodayEmpty}</p>
                ) : (
                  <div className="divide-y divide-black/[0.06]">
                    {todayTransactions.slice(0, 5).map((tx) => (
                      <div
                        key={tx.id}
                        className="py-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-lg font-semibold text-[#1D1D1F] truncate">
                            {localizeDescription(tx.description, config.descriptions, lang)}
                          </p>
                          <p className="text-sm text-[#86868B] truncate">
                            {localizePayment(tx.paymentMethod, lang)}
                            {tx.location ? ` · ${tx.location}` : ""}
                            {tx.agent ? ` · ${tx.agent}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xl font-bold tabular-nums text-[#1D1D1F]">
                            ${tx.total.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingRecord(tx)}
                            className="px-3 py-1.5 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-sm font-semibold text-[#007AFF]"
                          >
                            {t.editBtn}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </form>
        )}

        {/* ================= TAB 2: RECORDS ================= */}
        {activeTab === "records" && (
          <div className="space-y-6">
            {/* Month Bar & Export */}
            <div className="apple-card p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="w-12 h-12 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#1D1D1F] active:scale-95 transition"
                >
                  <ChevronLeft size={26} />
                </button>
                <div className="text-center min-w-[180px]">
                  <h2 className="text-2xl font-bold text-[#1D1D1F]">
                    {formatFriendlyMonth(recordsMonth, lang)}
                  </h2>
                  <p className="text-sm font-medium text-[#86868B]">
                    {t.recordsCount(monthData.summary.count)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="w-12 h-12 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#1D1D1F] active:scale-95 transition"
                >
                  <ChevronRight size={26} />
                </button>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                {recordsMonth !== currentMonthStr && (
                  <button
                    type="button"
                    onClick={() => setRecordsMonth(currentMonthStr)}
                    className="h-12 px-4 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] font-semibold text-base"
                  >
                    {t.thisMonth}
                  </button>
                )}

                {monthData.fileExists &&
                  (serverInfo?.isLocalMachine ? (
                    <button
                      type="button"
                      onClick={() => handleOpenFolderOrExcel(recordsMonth)}
                      className="flex-1 sm:flex-initial h-12 px-5 rounded-2xl bg-[#1E9E49]/12 hover:bg-[#1E9E49]/20 text-[#1E9E49] font-semibold text-base flex items-center justify-center gap-2 transition"
                    >
                      <FileSpreadsheet size={20} />
                      <span>{t.openExcelBtn}</span>
                    </button>
                  ) : (
                    <a
                      href={`/api/transactions/download?month=${encodeURIComponent(recordsMonth)}`}
                      className="flex-1 sm:flex-initial h-12 px-5 rounded-2xl bg-[#1E9E49]/12 hover:bg-[#1E9E49]/20 text-[#1E9E49] font-semibold text-base flex items-center justify-center gap-2 transition"
                    >
                      <Download size={20} />
                      <span>{t.downloadExcelBtn}</span>
                    </a>
                  ))}
              </div>
            </div>

            {/* Clean Apple Summary Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
              <div className="apple-card p-5">
                <p className="text-sm font-semibold text-[#515154]">{t.monthTotal}</p>
                <p className="text-3xl font-bold tabular-nums text-[#1D1D1F] mt-1">
                  ${monthData.summary.total.toFixed(2)}
                </p>
              </div>
              <div className="apple-card p-5">
                <p className="text-sm font-semibold text-[#1E9E49]">{t.cash}</p>
                <p className="text-3xl font-bold tabular-nums text-[#1D1D1F] mt-1">
                  ${monthData.summary.cashTotal.toFixed(2)}
                </p>
              </div>
              <div className="apple-card p-5">
                <p className="text-sm font-semibold text-[#007AFF]">{t.card}</p>
                <p className="text-3xl font-bold tabular-nums text-[#1D1D1F] mt-1">
                  ${monthData.summary.cardTotal.toFixed(2)}
                </p>
              </div>
              <div className="apple-card p-5">
                <p className="text-sm font-semibold text-[#515154]">
                  {t.gstShort} / {t.partsShort}
                </p>
                <p className="text-2xl font-bold tabular-nums text-[#1D1D1F] mt-1">
                  ${monthData.summary.gstTotal.toFixed(2)}
                  <span className="text-base font-medium text-[#86868B] ml-1.5">
                    / ${monthData.summary.partsTotal.toFixed(2)}
                  </span>
                </p>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search
                  size={20}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#86868B]"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="w-full h-13 pl-11 pr-10 rounded-2xl bg-white border border-black/[0.08] focus:border-[#007AFF] text-lg outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#86868B]"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              <div className="flex bg-[#E8E8ED] p-1 rounded-2xl shrink-0">
                {(
                  [
                    { id: "all", label: t.filterAll },
                    { id: "cash", label: t.filterCash },
                    { id: "card", label: t.filterCard },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPaymentFilter(f.id)}
                    className={[
                      "flex-1 sm:flex-initial px-4 h-11 rounded-xl text-base font-semibold transition",
                      paymentFilter === f.id
                        ? "bg-white text-[#1D1D1F] shadow-sm"
                        : "text-[#515154]",
                    ].join(" ")}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grouped Records List */}
            {groupedTransactions.length === 0 ? (
              <div className="apple-card py-16 px-6 text-center space-y-3">
                <BookOpen size={44} className="mx-auto text-[#C7C7CC]" />
                <p className="text-xl font-semibold text-[#86868B]">
                  {monthData.transactions.length === 0 ? t.noRecordsMonth : t.noRecordsSearch}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {groupedTransactions.map((group) => (
                  <div key={group.date} className="space-y-2.5">
                    <div className="flex items-center justify-between px-2">
                      <h3 className="text-lg font-bold text-[#515154]">
                        {formatFriendlyDate(group.date, lang)}
                      </h3>
                      <span className="text-base font-semibold tabular-nums text-[#86868B]">
                        ${group.dayTotal.toFixed(2)}
                      </span>
                    </div>

                    <div className="apple-card divide-y divide-black/[0.06] overflow-hidden">
                      {group.items.map((tx) => {
                        const isCard = tx.paymentMethod.toLowerCase() === "card";
                        const displayDesc = localizeDescription(
                          tx.description,
                          config.descriptions,
                          lang
                        );
                        return (
                          <div
                            key={tx.id}
                            className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#FAFAFC] transition"
                          >
                            <div className="space-y-1.5 min-w-0 flex-1">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="text-xl font-bold text-[#1D1D1F] break-words">
                                  {displayDesc}
                                </span>
                                <span
                                  className={[
                                    "px-2.5 py-0.5 rounded-lg text-sm font-semibold",
                                    isCard
                                      ? "bg-[#007AFF]/12 text-[#007AFF]"
                                      : "bg-[#1E9E49]/12 text-[#1E9E49]",
                                  ].join(" ")}
                                >
                                  {localizePayment(tx.paymentMethod, lang)}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-[#515154]">
                                {tx.location && (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin size={16} className="text-[#86868B]" />
                                    {tx.location}
                                  </span>
                                )}
                                {tx.agent && (
                                  <span className="inline-flex items-center gap-1">
                                    <User size={16} className="text-[#86868B]" />
                                    {tx.agent}
                                  </span>
                                )}
                                {tx.amount > 0 && (
                                  <span>
                                    {t.partsShort}: ${tx.amount.toFixed(2)}
                                  </span>
                                )}
                                {tx.gst > 0 && (
                                  <span>
                                    {t.gstShort}: ${tx.gst.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-black/[0.05]">
                              <span className="text-2xl sm:text-3xl font-bold tabular-nums text-[#1D1D1F]">
                                ${tx.total.toFixed(2)}
                              </span>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingRecord(tx)}
                                  className="h-11 px-4 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#007AFF] font-semibold text-base flex items-center gap-1.5 transition"
                                >
                                  <Pencil size={17} />
                                  <span>{t.editBtn}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingRecord(tx)}
                                  className="h-11 px-4 rounded-xl bg-[#FF3B30]/10 hover:bg-[#FF3B30]/18 text-[#FF3B30] font-semibold text-base flex items-center gap-1.5 transition"
                                >
                                  <Trash2 size={17} />
                                  <span>{t.deleteBtn}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: BACKUP & SETUP ================= */}
        {activeTab === "backup" && (
          <div className="space-y-6">
            {/* 1. DAILY BACKUP & ONE-TAP RESTORE */}
            <section className="apple-card overflow-hidden">
              <div className="p-6 sm:p-7 bg-gradient-to-br from-[#1E9E49]/[0.09] to-transparent border-b border-black/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#1E9E49] text-white flex items-center justify-center shrink-0 shadow-md shadow-[#1E9E49]/25">
                    <ShieldCheck size={32} />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-2xl font-bold text-[#1D1D1F]">{t.backupHeroTitle}</h2>
                    <p className="text-lg text-[#515154]">
                      {backupsData.backedUpToday ? t.backupProtectedToday : t.backupPendingToday}
                    </p>
                    {backupsData.latestBackup && (
                      <p className="text-base font-semibold text-[#1E9E49]">
                        {t.lastBackupTime(
                          formatBackupDateTime(backupsData.latestBackup.createdAt, lang)
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={handleManualBackup}
                  className="h-14 px-6 rounded-2xl bg-[#1E9E49] hover:bg-[#17853B] text-white text-lg font-bold flex items-center justify-center gap-2 shadow-md shadow-[#1E9E49]/20 shrink-0 transition active:scale-95 disabled:opacity-50"
                >
                  <ShieldCheck size={22} />
                  <span>{actionBusy ? t.backingUp : t.backupNowBtn}</span>
                </button>
              </div>

              <div className="p-6 sm:p-7 space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-[#1D1D1F]">{t.restoreSectionTitle}</h3>
                  <p className="text-base text-[#515154] mt-1 leading-relaxed">
                    {t.restoreSectionHint}
                  </p>
                </div>

                {backupsData.backups.length === 0 ? (
                  <p className="text-lg text-[#86868B] py-6 text-center">{t.noBackupsYet}</p>
                ) : (
                  <div className="divide-y divide-black/[0.06] border border-black/[0.06] rounded-2xl overflow-hidden max-h-[420px] overflow-y-auto">
                    {backupsData.backups.map((bkp) => {
                      const badgeLabel =
                        bkp.reason === "daily"
                          ? t.reasonDaily
                          : bkp.reason === "manual"
                          ? t.reasonManual
                          : t.reasonSafety;
                      const badgeTone =
                        bkp.reason === "daily"
                          ? "bg-[#1E9E49]/12 text-[#1E9E49]"
                          : bkp.reason === "manual"
                          ? "bg-[#007AFF]/12 text-[#007AFF]"
                          : "bg-[#FF9500]/15 text-[#B25E00]";

                      return (
                        <div
                          key={bkp.id}
                          className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-[#FAFAFC]"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="text-lg font-bold text-[#1D1D1F]">
                                {formatBackupDateTime(bkp.createdAt, lang)}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 rounded-lg text-sm font-semibold ${badgeTone}`}
                              >
                                {badgeLabel}
                              </span>
                            </div>
                            <p className="text-base text-[#515154] tabular-nums">
                              {t.backupSummary(bkp.recordCount, bkp.totalAmount.toFixed(2))}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setRestoringBackup(bkp)}
                            className="h-12 px-5 rounded-xl bg-[#007AFF]/10 hover:bg-[#007AFF] text-[#007AFF] hover:text-white font-semibold text-base flex items-center justify-center gap-2 transition shrink-0"
                          >
                            <RotateCcw size={18} />
                            <span>{t.restoreBtn}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* 2. PHONE & COMPUTER CONNECTION CARD */}
            {serverInfo && (
              <section className="apple-card p-6 sm:p-7">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="bg-[#F5F5F7] p-4 rounded-3xl shrink-0">
                    <img
                      src={serverInfo.primaryQrDataUrl}
                      alt="Connect Phone QR"
                      className="w-44 h-44 rounded-2xl bg-white p-2 object-contain"
                    />
                  </div>
                  <div className="space-y-3 flex-1 text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-2.5">
                      <Smartphone size={24} className="text-[#007AFF]" />
                      <h3 className="text-2xl font-bold text-[#1D1D1F]">{t.phoneCardTitle}</h3>
                    </div>
                    <p className="text-lg text-[#515154] leading-relaxed">{t.phoneCardDesc}</p>
                    <div className="inline-flex items-center gap-3 bg-[#F5F5F7] px-4 py-2.5 rounded-2xl">
                      <Wifi size={18} className="text-[#007AFF]" />
                      <span className="font-mono text-lg font-semibold text-[#1D1D1F]">
                        {serverInfo.primaryUrl}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(serverInfo.primaryUrl);
                            setCopiedInlineUrl(true);
                            setTimeout(() => setCopiedInlineUrl(false), 2000);
                          } catch {
                            // ignore
                          }
                        }}
                        className="px-3 py-1 rounded-xl bg-white text-[#007AFF] text-sm font-semibold shadow-sm flex items-center gap-1"
                      >
                        {copiedInlineUrl ? <Check size={15} /> : <Copy size={15} />}
                        <span>{copiedInlineUrl ? t.copiedBtn : t.copyLinkBtn}</span>
                      </button>
                    </div>
                    <p className="text-sm text-[#86868B]">{t.phoneHomeScreenTip}</p>
                  </div>
                </div>
              </section>
            )}

            {/* 3. MANAGE SAVED LISTS (ITEMS, LOCATIONS, PEOPLE) */}
            <section className="apple-card p-6 sm:p-7 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Settings2 size={24} className="text-[#007AFF]" />
                  <h3 className="text-2xl font-bold text-[#1D1D1F]">{t.manageListsTitle}</h3>
                </div>

                <button
                  type="button"
                  onClick={() => setAddModal(manageSection)}
                  className="h-12 px-5 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] text-white font-semibold text-base flex items-center justify-center gap-2 transition"
                >
                  <Plus size={20} />
                  <span>{t.addBtn}</span>
                </button>
              </div>

              <div className="flex bg-[#E8E8ED] p-1 rounded-2xl">
                {(
                  [
                    { id: "description", label: t.manageDescriptions },
                    { id: "location", label: t.manageLocations },
                    { id: "agent", label: t.manageAgents },
                  ] as const
                ).map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setManageSection(sec.id)}
                    className={[
                      "flex-1 py-2.5 rounded-xl text-base sm:text-lg font-semibold transition",
                      manageSection === sec.id
                        ? "bg-white text-[#1D1D1F] shadow-sm"
                        : "text-[#515154]",
                    ].join(" ")}
                  >
                    {sec.label}
                  </button>
                ))}
              </div>

              <div className="divide-y divide-black/[0.06] border border-black/[0.06] rounded-2xl overflow-hidden">
                {manageSection === "description" &&
                  (Object.entries(config.descriptions).length === 0 ? (
                    <div className="p-8 text-center text-lg text-[#86868B]">{t.emptyListHint}</div>
                  ) : (
                    Object.entries(config.descriptions).map(([zh, en]) => (
                      <div
                        key={zh}
                        className="px-5 py-3.5 flex items-center justify-between gap-3 bg-white"
                      >
                        <div>
                          <span className="text-lg font-bold text-[#1D1D1F]">{zh}</span>
                          {en !== zh && (
                            <span className="text-base text-[#515154] ml-3">→ {en}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteConfigItem("description", zh)}
                          className="px-3.5 py-1.5 rounded-xl text-sm font-semibold text-[#FF3B30] hover:bg-[#FF3B30]/10 transition"
                        >
                          {t.removeBtn}
                        </button>
                      </div>
                    ))
                  ))}

                {manageSection === "location" &&
                  (config.locations.length === 0 ? (
                    <div className="p-8 text-center text-lg text-[#86868B]">{t.emptyListHint}</div>
                  ) : (
                    config.locations.map((loc) => (
                      <div
                        key={loc}
                        className="px-5 py-3.5 flex items-center justify-between gap-3 bg-white"
                      >
                        <span className="text-lg font-bold text-[#1D1D1F]">{loc}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteConfigItem("location", loc)}
                          className="px-3.5 py-1.5 rounded-xl text-sm font-semibold text-[#FF3B30] hover:bg-[#FF3B30]/10 transition"
                        >
                          {t.removeBtn}
                        </button>
                      </div>
                    ))
                  ))}

                {manageSection === "agent" &&
                  (config.agents.length === 0 ? (
                    <div className="p-8 text-center text-lg text-[#86868B]">{t.emptyListHint}</div>
                  ) : (
                    config.agents.map((ag) => (
                      <div
                        key={ag}
                        className="px-5 py-3.5 flex items-center justify-between gap-3 bg-white"
                      >
                        <span className="text-lg font-bold text-[#1D1D1F]">{ag}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteConfigItem("agent", ag)}
                          className="px-3.5 py-1.5 rounded-xl text-sm font-semibold text-[#FF3B30] hover:bg-[#FF3B30]/10 transition"
                        >
                          {t.removeBtn}
                        </button>
                      </div>
                    ))
                  ))}
              </div>
            </section>

            {/* 4. EXCEL STORAGE FOLDER (PC ONLY) */}
            {serverInfo?.isLocalMachine && (
              <section className="apple-card p-6 sm:p-7 space-y-4">
                <div className="flex items-center gap-2.5">
                  <FolderOpen size={24} className="text-[#007AFF]" />
                  <h3 className="text-2xl font-bold text-[#1D1D1F]">{t.storageTitle}</h3>
                </div>
                <p className="text-base text-[#515154]">{t.storageHint}</p>

                <div className="p-4 rounded-2xl bg-[#F5F5F7] font-mono text-base text-[#1D1D1F] break-all">
                  {config.booksPath}
                </div>

                {editingFolderManually ? (
                  <form onSubmit={handleSaveManualFolder} className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={manualPathInput}
                      onChange={(e) => setManualPathInput(e.target.value)}
                      className="flex-1 h-13 px-4 rounded-2xl bg-[#F5F5F7] border-2 border-[#007AFF] text-base font-mono outline-none"
                    />
                    <button
                      type="submit"
                      className="h-13 px-6 rounded-2xl bg-[#007AFF] text-white font-semibold"
                    >
                      {t.saveChangesBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingFolderManually(false)}
                      className="h-13 px-5 rounded-2xl bg-[#E8E8ED] text-[#1D1D1F] font-semibold"
                    >
                      {t.cancelBtn}
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleOpenFolderOrExcel()}
                      className="h-12 px-5 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] text-white font-semibold text-base flex items-center gap-2 transition"
                    >
                      <FolderOpen size={19} />
                      <span>{t.openFolderBtn}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePickStorageFolder}
                      className="h-12 px-5 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] font-semibold text-base transition"
                    >
                      {t.changeFolderBtn}
                    </button>
                    {config.customBooksPath && (
                      <button
                        type="button"
                        onClick={handleResetFolder}
                        className="h-12 px-5 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#515154] font-semibold text-base transition"
                      >
                        {t.resetFolderBtn}
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom iOS Tab Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 apple-glass border-t border-black/[0.08] safe-bottom">
        <div className="grid grid-cols-3 h-19 px-2">
          {(
            [
              { id: "entry", label: t.tabEntry, icon: PlusCircle },
              { id: "records", label: t.tabRecords, icon: BookOpen },
              { id: "backup", label: t.tabBackup, icon: ShieldCheck },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "flex flex-col items-center justify-center gap-1 transition",
                  active ? "text-[#007AFF]" : "text-[#86868B]",
                ].join(" ")}
              >
                <Icon size={26} strokeWidth={active ? 2.5 : 2} />
                <span className="text-sm font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Apple Pay-style Reassuring Success Toast */}
      {toast && (
        <div
          onClick={() => setToast(null)}
          className="fixed top-22 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-[#1D1D1F]/92 backdrop-blur-xl text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-4 cursor-pointer animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="w-11 h-11 rounded-full bg-[#34C759] flex items-center justify-center shrink-0">
            <Check size={26} strokeWidth={3} className="text-white" />
          </div>
          <div>
            <p className="text-xl font-bold">{toast.title}</p>
            {toast.subtitle && <p className="text-sm text-white/80">{toast.subtitle}</p>}
          </div>
        </div>
      )}

      {/* Modals */}
      <CalendarModal
        open={showCalendar}
        selectedDate={entryDate}
        lang={lang}
        onSelect={setEntryDate}
        onClose={() => setShowCalendar(false)}
      />

      <OptionPickerModal
        open={pickerModal !== null}
        title={pickerModal === "location" ? t.pickLocationTitle : t.pickAgentTitle}
        addLabel={pickerModal === "location" ? t.addNewLocation : t.addNewAgent}
        options={pickerModal === "location" ? config.locations : config.agents}
        selectedValue={pickerModal === "location" ? location : agent}
        lang={lang}
        onSelect={(val) => {
          if (pickerModal === "location") handleSelectLocation(val);
          else handleSelectAgent(val);
        }}
        onAddNew={async (val) => {
          if (!pickerModal) return;
          await handleAddConfigItem(pickerModal, val);
        }}
        onClose={() => setPickerModal(null)}
      />

      <AddConfigItemModal
        mode={addModal}
        lang={lang}
        onSave={handleAddConfigItem}
        onClose={() => setAddModal(null)}
      />

      <ConnectPhoneModal
        open={showPhoneModal}
        serverInfo={serverInfo}
        lang={lang}
        onClose={() => setShowPhoneModal(false)}
      />

      <EditTransactionModal
        transaction={editingRecord}
        config={config}
        lang={lang}
        onSave={handleUpdateTransaction}
        onClose={() => setEditingRecord(null)}
      />

      <ConfirmModal
        open={deletingRecord !== null}
        tone="danger"
        title={t.deleteConfirmTitle}
        body={
          deletingRecord
            ? t.deleteConfirmBody(
                localizeDescription(deletingRecord.description, config.descriptions, lang),
                deletingRecord.total.toFixed(2)
              )
            : ""
        }
        confirmLabel={t.confirmDeleteBtn}
        cancelLabel={t.cancelBtn}
        busy={actionBusy}
        onConfirm={handleConfirmDeleteRecord}
        onClose={() => setDeletingRecord(null)}
      />

      <ConfirmModal
        open={restoringBackup !== null}
        tone="restore"
        title={t.restoreConfirmTitle}
        body={
          restoringBackup
            ? t.restoreConfirmBody(formatBackupDateTime(restoringBackup.createdAt, lang))
            : ""
        }
        confirmLabel={t.confirmRestoreBtn}
        cancelLabel={t.cancelBtn}
        busy={actionBusy}
        onConfirm={handleConfirmRestore}
        onClose={() => setRestoringBackup(null)}
      />
    </div>
  );
}
