import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Copy,
  Smartphone,
  Wifi,
  Banknote,
  CreditCard,
  Calendar as CalendarIcon,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  parseISO,
  isValid,
} from "date-fns";
import type { ConfigData, Language, ServerInfo, Transaction } from "../types";
import { translations, formatFriendlyDate } from "../i18n";

interface CalendarModalProps {
  open: boolean;
  selectedDate: string;
  lang: Language;
  onSelect: (dateStr: string) => void;
  onClose: () => void;
}

export function CalendarModal({
  open,
  selectedDate,
  lang,
  onSelect,
  onClose,
}: CalendarModalProps) {
  const t = translations[lang];
  const parsedSelected = useMemo(() => {
    const p = parseISO(selectedDate);
    return isValid(p) ? p : new Date();
  }, [selectedDate]);

  const [viewDate, setViewDate] = useState<Date>(parsedSelected);

  useEffect(() => {
    if (open) {
      setViewDate(parsedSelected);
    }
  }, [open, parsedSelected]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewDate));
    const end = endOfWeek(endOfMonth(viewDate));
    return eachDayOfInterval({ start, end });
  }, [viewDate]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-black/5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.06]">
          <h3 className="text-xl font-semibold text-[#1D1D1F]">{t.selectDateTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#515154]"
            aria-label={t.closeBtn}
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <button
              type="button"
              onClick={() => setViewDate(subMonths(viewDate, 1))}
              className="w-12 h-12 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#1D1D1F] active:scale-95 transition"
            >
              <ChevronLeft size={26} />
            </button>
            <div className="text-xl font-semibold text-[#1D1D1F]">
              {lang === "zh" ? format(viewDate, "yyyy年 M月") : format(viewDate, "MMMM yyyy")}
            </div>
            <button
              type="button"
              onClick={() => setViewDate(addMonths(viewDate, 1))}
              className="w-12 h-12 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#1D1D1F] active:scale-95 transition"
            >
              <ChevronRight size={26} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {t.weekdays.map((wd) => (
              <div
                key={wd}
                className="text-center text-sm font-semibold text-[#86868B] py-1"
              >
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const selected = isSameDay(day, parsedSelected);
              const inMonth = isSameMonth(day, viewDate);
              const today = isToday(day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    onSelect(format(day, "yyyy-MM-dd"));
                    onClose();
                  }}
                  className={[
                    "h-12 rounded-2xl text-lg font-semibold flex items-center justify-center transition active:scale-95 tabular-nums",
                    selected
                      ? "bg-[#007AFF] text-white shadow-md shadow-[#007AFF]/25"
                      : inMonth
                      ? "text-[#1D1D1F] hover:bg-[#F5F5F7]"
                      : "text-[#C7C7CC] hover:bg-[#F5F5F7]/60",
                    today && !selected ? "ring-2 ring-[#007AFF] text-[#007AFF]" : "",
                  ].join(" ")}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => {
                onSelect(format(new Date(), "yyyy-MM-dd"));
                onClose();
              }}
              className="flex-1 h-13 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] font-semibold text-lg hover:bg-[#007AFF]/15 transition"
            >
              {t.today}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-13 rounded-2xl bg-[#F5F5F7] text-[#1D1D1F] font-semibold text-lg hover:bg-[#E8E8ED] transition"
            >
              {t.closeBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface OptionPickerModalProps {
  open: boolean;
  title: string;
  addLabel: string;
  options: string[];
  selectedValue: string;
  lang: Language;
  onSelect: (val: string) => void;
  onAddNew: (val: string) => Promise<void>;
  onClose: () => void;
}

export function OptionPickerModal({
  open,
  title,
  addLabel,
  options,
  selectedValue,
  lang,
  onSelect,
  onAddNew,
  onClose,
}: OptionPickerModalProps) {
  const t = translations[lang];
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSearch("");
      setAdding(false);
      setNewVal("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  if (!open) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newVal.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onAddNew(trimmed);
      onSelect(trimmed);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-black/5 max-h-[85vh] flex flex-col overflow-hidden safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.06]">
          <h3 className="text-2xl font-semibold text-[#1D1D1F]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#515154]"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-5 border-b border-black/[0.06] bg-[#FAFAFC] space-y-3">
          {!adding ? (
            <div className="flex gap-3">
              {options.length > 5 && (
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.searchOrSelect}
                  className="flex-1 h-13 px-4 rounded-2xl bg-white border border-black/10 text-lg outline-none focus:border-[#007AFF]"
                />
              )}
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="h-13 px-5 rounded-2xl bg-[#007AFF] text-white font-semibold text-lg flex items-center justify-center gap-2 hover:bg-[#0066D6] active:scale-[0.98] transition flex-1 sm:flex-initial"
              >
                <Plus size={22} />
                <span>{addLabel}</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                autoFocus
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                placeholder={t.singleNamePlaceholder}
                className="flex-1 h-14 px-4 rounded-2xl bg-white border-2 border-[#007AFF] text-xl outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy || !newVal.trim()}
                  className="flex-1 sm:flex-initial h-14 px-6 rounded-2xl bg-[#1E9E49] text-white font-semibold text-lg disabled:opacity-50"
                >
                  {t.confirmAddBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="h-14 px-4 rounded-2xl bg-[#E8E8ED] text-[#1D1D1F] font-semibold text-lg"
                >
                  {t.cancelBtn}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {selectedValue && (
            <button
              type="button"
              onClick={() => {
                onSelect("");
                onClose();
              }}
              className="w-full min-h-[56px] px-5 py-3 rounded-2xl text-left text-lg font-medium text-[#86868B] hover:bg-[#F5F5F7] flex items-center justify-between"
            >
              <span>{t.clearChoice}</span>
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-lg text-[#86868B]">
              {t.emptyListHint}
            </div>
          ) : (
            filtered.map((item) => {
              const active = item === selectedValue;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    onSelect(item);
                    onClose();
                  }}
                  className={[
                    "w-full min-h-[60px] px-5 py-3.5 rounded-2xl text-left text-xl font-semibold flex items-center justify-between transition active:scale-[0.99]",
                    active
                      ? "bg-[#007AFF]/10 text-[#007AFF] ring-2 ring-[#007AFF]"
                      : "bg-[#F5F5F7]/70 hover:bg-[#F5F5F7] text-[#1D1D1F]",
                  ].join(" ")}
                >
                  <span>{item}</span>
                  {active && <Check size={24} className="text-[#007AFF] shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

interface AddConfigItemModalProps {
  mode: "description" | "location" | "agent" | null;
  lang: Language;
  onSave: (type: "description" | "location" | "agent", value: string, translation?: string) => Promise<void>;
  onClose: () => void;
}

export function AddConfigItemModal({ mode, lang, onSave, onClose }: AddConfigItemModalProps) {
  const t = translations[lang];
  const [zhValue, setZhValue] = useState("");
  const [enValue, setEnValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode) {
      setZhValue("");
      setEnValue("");
    }
  }, [mode]);

  if (!mode) return null;

  const title =
    mode === "description"
      ? t.addNewItemBtn
      : mode === "location"
      ? t.addNewLocation
      : t.addNewAgent;

  const canSubmit =
    mode === "description"
      ? Boolean(zhValue.trim() || enValue.trim())
      : Boolean(zhValue.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      if (mode === "description") {
        const primary = zhValue.trim() || enValue.trim();
        const english = enValue.trim() || zhValue.trim();
        await onSave("description", primary, english);
      } else {
        await onSave(mode, zhValue.trim());
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-black/5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.06]">
          <h3 className="text-2xl font-semibold text-[#1D1D1F]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#515154]"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {mode === "description" ? (
            <>
              <div>
                <label className="block text-base font-semibold text-[#515154] mb-2">
                  {t.zhNameLabel}
                </label>
                <input
                  type="text"
                  autoFocus={lang === "zh"}
                  value={zhValue}
                  onChange={(e) => setZhValue(e.target.value)}
                  placeholder={t.zhNamePlaceholder}
                  className="w-full h-15 px-5 rounded-2xl bg-[#F5F5F7] border-2 border-transparent focus:bg-white focus:border-[#007AFF] text-xl font-medium outline-none transition"
                />
              </div>
              <div>
                <label className="block text-base font-semibold text-[#515154] mb-2">
                  {t.enNameLabel}
                </label>
                <input
                  type="text"
                  autoFocus={lang === "en"}
                  value={enValue}
                  onChange={(e) => setEnValue(e.target.value)}
                  placeholder={t.enNamePlaceholder}
                  className="w-full h-15 px-5 rounded-2xl bg-[#F5F5F7] border-2 border-transparent focus:bg-white focus:border-[#007AFF] text-xl font-medium outline-none transition"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-base font-semibold text-[#515154] mb-2">
                {t.singleNameLabel}
              </label>
              <input
                type="text"
                autoFocus
                value={zhValue}
                onChange={(e) => setZhValue(e.target.value)}
                placeholder={t.singleNamePlaceholder}
                className="w-full h-15 px-5 rounded-2xl bg-[#F5F5F7] border-2 border-transparent focus:bg-white focus:border-[#007AFF] text-xl font-medium outline-none transition"
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-14 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] text-lg font-semibold transition"
            >
              {t.cancelBtn}
            </button>
            <button
              type="submit"
              disabled={!canSubmit || busy}
              className="flex-1 h-14 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-lg font-semibold disabled:opacity-40 transition"
            >
              {t.confirmAddBtn}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

interface ConnectPhoneModalProps {
  open: boolean;
  serverInfo: ServerInfo | null;
  lang: Language;
  onClose: () => void;
}

export function ConnectPhoneModal({
  open,
  serverInfo,
  lang,
  onClose,
}: ConnectPhoneModalProps) {
  const t = translations[lang];
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSelectedIdx(0);
    setCopied(false);
  }, [open]);

  if (!open || !serverInfo) return null;

  const activeInterface = serverInfo.interfaces[selectedIdx] || {
    name: "Wi-Fi",
    ip: "localhost",
    url: serverInfo.primaryUrl,
    qrDataUrl: serverInfo.primaryQrDataUrl,
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeInterface.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-black/5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center">
              <Smartphone size={22} />
            </div>
            <h3 className="text-xl font-semibold text-[#1D1D1F]">{t.phoneCardTitle}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#515154]"
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-lg text-[#515154] leading-relaxed">{t.phoneCardDesc}</p>

          <div className="bg-[#F5F5F7] rounded-3xl p-6 flex flex-col items-center text-center">
            {serverInfo.remoteClients > 0 && (
              <div className="mb-4 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#1E9E49]/15 text-[#1E9E49] text-base font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1E9E49] animate-pulse" />
                {t.phoneConnected(serverInfo.remoteClients)}
              </div>
            )}

            <div className="bg-white p-4 rounded-3xl shadow-sm border border-black/5">
              <img
                src={activeInterface.qrDataUrl}
                alt="Phone QR Code"
                className="w-56 h-56 object-contain"
              />
            </div>

            <div className="mt-4 flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-black/5 w-full justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Wifi size={18} className="text-[#007AFF] shrink-0" />
                <span className="font-mono text-base sm:text-lg font-semibold text-[#1D1D1F] truncate">
                  {activeInterface.url}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3.5 py-1.5 rounded-xl bg-[#007AFF]/10 hover:bg-[#007AFF]/20 text-[#007AFF] font-semibold text-sm flex items-center gap-1.5 shrink-0 transition"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? t.copiedBtn : t.copyLinkBtn}</span>
              </button>
            </div>

            {serverInfo.interfaces.length > 1 && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <span className="text-sm text-[#86868B]">{t.networkAdapterLabel}</span>
                {serverInfo.interfaces.map((iface, idx) => (
                  <button
                    key={iface.url}
                    type="button"
                    onClick={() => setSelectedIdx(idx)}
                    className={[
                      "px-3 py-1 rounded-xl text-sm font-medium transition",
                      selectedIdx === idx
                        ? "bg-[#007AFF] text-white"
                        : "bg-white text-[#515154] border border-black/10",
                    ].join(" ")}
                  >
                    {iface.ip}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 text-base text-[#1D1D1F] bg-[#FAFAFC] p-4 rounded-2xl border border-black/[0.05]">
            <p className="font-semibold">{t.phoneScanStep1}</p>
            <p className="font-semibold">{t.phoneScanStep2}</p>
            <p className="text-sm text-[#515154] pt-1 leading-relaxed">{t.phoneHomeScreenTip}</p>
          </div>

          <p className="text-sm text-[#86868B] leading-relaxed">{t.firewallTip}</p>

          <button
            type="button"
            onClick={onClose}
            className="w-full h-14 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-lg font-semibold transition"
          >
            {t.closeBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

interface EditTransactionModalProps {
  transaction: Transaction | null;
  config: ConfigData;
  lang: Language;
  onSave: (id: string, updated: Omit<Transaction, "id">, originalMonth: string) => Promise<void>;
  onClose: () => void;
}

export function EditTransactionModal({
  transaction,
  config,
  lang,
  onSave,
  onClose,
}: EditTransactionModalProps) {
  const t = translations[lang];
  const [date, setDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [location, setLocation] = useState("");
  const [agent, setAgent] = useState("");
  const [selectedZhSet, setSelectedZhSet] = useState<Set<string>>(new Set());
  const [customNote, setCustomNote] = useState("");
  const [parts, setParts] = useState("");
  const [gst, setGst] = useState("");
  const [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [pickerType, setPickerType] = useState<"location" | "agent" | null>(null);

  useEffect(() => {
    if (!transaction) return;
    setDate(transaction.date);
    setPaymentMethod(transaction.paymentMethod || "Cash");
    setLocation(transaction.location || "");
    setAgent(transaction.agent || "");
    setParts(transaction.amount ? String(transaction.amount) : "");
    setGst(transaction.gst ? String(transaction.gst) : "");
    setTotal(String(transaction.total ?? ""));

    // Match English description parts back to known config.descriptions
    const reverseMap = new Map<string, string>();
    for (const [zh, en] of Object.entries(config.descriptions)) {
      reverseMap.set(en.trim().toLowerCase(), zh);
    }

    const matchedZh = new Set<string>();
    const unmatchedParts: string[] = [];
    for (const rawPart of (transaction.description || "").split(",")) {
      const part = rawPart.trim();
      if (!part) continue;
      const foundZh = reverseMap.get(part.toLowerCase());
      if (foundZh) {
        matchedZh.add(foundZh);
      } else {
        unmatchedParts.push(part);
      }
    }
    setSelectedZhSet(matchedZh);
    setCustomNote(unmatchedParts.join(", "));
  }, [transaction, config.descriptions]);

  if (!transaction) return null;

  const originalMonth = transaction.date.slice(0, 7);

  const toggleZh = (zh: string) => {
    setSelectedZhSet((prev) => {
      const next = new Set(prev);
      if (next.has(zh)) next.delete(zh);
      else next.add(zh);
      return next;
    });
  };

  const englishDescription = [
    ...Array.from(selectedZhSet).map((zh) => config.descriptions[zh] || zh),
    ...(customNote.trim() ? [customNote.trim()] : []),
  ].join(", ");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!englishDescription || !total) return;
    setBusy(true);
    try {
      await onSave(
        transaction.id,
        {
          date,
          paymentMethod,
          location,
          agent,
          description: englishDescription,
          amount: parseFloat(parts) || 0,
          gst: parseFloat(gst) || 0,
          total: parseFloat(total) || 0,
        },
        originalMonth
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
        onClick={onClose}
      >
        <form
          onSubmit={handleSubmit}
          className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-black/5 max-h-[92vh] flex flex-col overflow-hidden safe-bottom"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.06]">
            <h3 className="text-2xl font-semibold text-[#1D1D1F]">{t.editRecordTitle}</h3>
            <button
              type="button"
              onClick={onClose}
              className="w-11 h-11 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#515154]"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div>
              <label className="block text-base font-semibold text-[#515154] mb-2.5">
                {t.descriptionField}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {Object.entries(config.descriptions).map(([zh, en]) => {
                  const active = selectedZhSet.has(zh);
                  return (
                    <button
                      key={zh}
                      type="button"
                      onClick={() => toggleZh(zh)}
                      className={[
                        "min-h-[54px] px-4 py-2.5 rounded-2xl text-lg font-semibold flex items-center justify-between transition",
                        active
                          ? "bg-[#007AFF] text-white shadow-sm"
                          : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]",
                      ].join(" ")}
                    >
                      <span className="truncate">{lang === "zh" ? zh : en}</span>
                      {active && <Check size={20} className="shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder={t.extraNotePlaceholder}
                className="mt-3 w-full h-13 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-lg outline-none transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-base font-semibold text-[#515154] mb-2">
                  {t.totalAmount} ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  className="w-full h-15 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-2xl font-bold tabular-nums outline-none"
                />
              </div>
              <div>
                <label className="block text-base font-semibold text-[#515154] mb-2">
                  {t.paymentMethod}
                </label>
                <div className="grid grid-cols-2 gap-2.5 h-15">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("Cash")}
                    className={[
                      "rounded-2xl font-semibold text-lg flex items-center justify-center gap-2 transition",
                      paymentMethod === "Cash"
                        ? "bg-[#1E9E49] text-white"
                        : "bg-[#F5F5F7] text-[#1D1D1F]",
                    ].join(" ")}
                  >
                    <Banknote size={22} />
                    <span>{t.cash}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("Card")}
                    className={[
                      "rounded-2xl font-semibold text-lg flex items-center justify-center gap-2 transition",
                      paymentMethod === "Card"
                        ? "bg-[#007AFF] text-white"
                        : "bg-[#F5F5F7] text-[#1D1D1F]",
                    ].join(" ")}
                  >
                    <CreditCard size={22} />
                    <span>{t.card}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-base font-semibold text-[#515154] mb-2">
                  {t.partsCost} ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={parts}
                  onChange={(e) => setParts(e.target.value)}
                  className="w-full h-14 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-xl font-semibold tabular-nums outline-none"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-base font-semibold text-[#515154]">
                    {t.gstShort} ($)
                  </label>
                  {parseFloat(total) > 0 && (
                    <button
                      type="button"
                      onClick={() => setGst(((parseFloat(total) || 0) / 11).toFixed(2))}
                      className="text-sm font-semibold text-[#007AFF] hover:underline"
                    >
                      10%
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={gst}
                  onChange={(e) => setGst(e.target.value)}
                  className="w-full h-14 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-xl font-semibold tabular-nums outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setShowCal(true)}
                className="h-14 px-4 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-left flex items-center gap-3"
              >
                <CalendarIcon size={20} className="text-[#007AFF] shrink-0" />
                <span className="text-base font-semibold text-[#1D1D1F] truncate">
                  {formatFriendlyDate(date, lang)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPickerType("location")}
                className="h-14 px-4 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-left flex items-center justify-between"
              >
                <span className="text-base font-semibold text-[#1D1D1F] truncate">
                  {location || t.unassignedLocation}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPickerType("agent")}
                className="h-14 px-4 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-left flex items-center justify-between"
              >
                <span className="text-base font-semibold text-[#1D1D1F] truncate">
                  {agent || t.unassignedAgent}
                </span>
              </button>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-black/[0.06] bg-[#FAFAFC] flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-14 rounded-2xl bg-[#E8E8ED] text-[#1D1D1F] text-lg font-semibold"
            >
              {t.cancelBtn}
            </button>
            <button
              type="submit"
              disabled={busy || !englishDescription || !total}
              className="flex-1 h-14 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-lg font-semibold disabled:opacity-40"
            >
              {t.saveChangesBtn}
            </button>
          </div>
        </form>
      </div>

      <CalendarModal
        open={showCal}
        selectedDate={date}
        lang={lang}
        onSelect={setDate}
        onClose={() => setShowCal(false)}
      />

      <OptionPickerModal
        open={pickerType !== null}
        title={pickerType === "location" ? t.pickLocationTitle : t.pickAgentTitle}
        addLabel={pickerType === "location" ? t.addNewLocation : t.addNewAgent}
        options={pickerType === "location" ? config.locations : config.agents}
        selectedValue={pickerType === "location" ? location : agent}
        lang={lang}
        onSelect={(val) => {
          if (pickerType === "location") setLocation(val);
          else setAgent(val);
        }}
        onAddNew={async (val) => {
          if (!pickerType) return;
          await fetch("/api/config/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: pickerType, value: val }),
          });
        }}
        onClose={() => setPickerType(null)}
      />
    </>
  );
}

interface ConfirmModalProps {
  open: boolean;
  tone: "danger" | "restore";
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  tone,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-black/5 p-6 text-center space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={[
            "w-16 h-16 rounded-full mx-auto flex items-center justify-center",
            tone === "danger"
              ? "bg-[#FF3B30]/12 text-[#FF3B30]"
              : "bg-[#1E9E49]/12 text-[#1E9E49]",
          ].join(" ")}
        >
          {tone === "danger" ? <AlertTriangle size={32} /> : <ShieldCheck size={32} />}
        </div>

        <div className="space-y-2">
          <h3 className="text-2xl font-semibold text-[#1D1D1F]">{title}</h3>
          <p className="text-lg text-[#515154] leading-relaxed">{body}</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 h-14 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] text-lg font-semibold transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={[
              "flex-1 h-14 rounded-2xl text-white text-lg font-semibold transition disabled:opacity-50",
              tone === "danger"
                ? "bg-[#FF3B30] hover:bg-[#E0352B]"
                : "bg-[#1E9E49] hover:bg-[#18873D]",
            ].join(" ")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
