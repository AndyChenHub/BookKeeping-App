import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Plus,
  Trash2,
  Check,
  Download,
  Printer,
  Pencil,
  Building2,
  Sparkles,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  AlertCircle,
} from "lucide-react";
import { format, addDays, parseISO, isValid } from "date-fns";
import type {
  BusinessProfile,
  ConfigData,
  InvoiceLineItem,
  InvoiceRecord,
  InvoiceStatus,
  Language,
  Transaction,
} from "../types";
import { translations, localizeDescription } from "../i18n";
import {
  buildInvoicePdfFileName,
  formatAuAbn,
  formatAuBsb,
  formatAuDate,
  isAustralianTaxInvoice,
} from "../invoice-utils";

function makeLocalId() {
  return `li_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export interface InvoiceDraft {
  id?: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  clientName: string;
  clientAbn: string;
  serviceAddress: string;
  clientDetails: string;
  items: InvoiceLineItem[];
  paidDate: string;
  paymentMethod: string;
  notes: string;
}

export function buildDraftFromRecords(
  records: Transaction[],
  nextInvoiceNumber: string
): InvoiceDraft {
  const today = format(new Date(), "yyyy-MM-dd");
  const due14 = format(addDays(new Date(), 14), "yyyy-MM-dd");

  const uniqueLocations = Array.from(
    new Set(records.map((r) => (r.location || "").trim()).filter(Boolean))
  );
  const serviceAddress = uniqueLocations.join("; ");

  const firstAgent = records.find((r) => r.agent?.trim())?.agent?.trim() || "";
  const firstClient = firstAgent || uniqueLocations[0] || "";

  const items: InvoiceLineItem[] =
    records.length > 0
      ? records.map((r) => ({
          id: makeLocalId(),
          recordId: r.id,
          date: r.date || today,
          description: r.description || "Service",
          quantity: 1,
          parts: r.amount || 0,
          gst: r.gst || 0,
          total: r.total || 0,
        }))
      : [
          {
            id: makeLocalId(),
            date: today,
            description: "",
            quantity: 1,
            parts: 0,
            gst: 0,
            total: 0,
          },
        ];

  return {
    invoiceNumber: nextInvoiceNumber,
    status: "Unpaid",
    issueDate: today,
    dueDate: due14,
    clientName: firstClient,
    clientAbn: "",
    serviceAddress,
    clientDetails: "",
    items,
    paidDate: "",
    paymentMethod: "Bank Transfer",
    notes: "",
  };
}

export function buildDraftFromInvoice(inv: InvoiceRecord): InvoiceDraft {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    clientName: inv.clientName,
    clientAbn: inv.clientAbn || "",
    serviceAddress: inv.serviceAddress || "",
    clientDetails: inv.clientDetails,
    items: inv.items.map((it) => ({ ...it, quantity: Math.max(1, Number(it.quantity) || 1) })),
    paidDate: inv.paidDate || format(new Date(), "yyyy-MM-dd"),
    paymentMethod: inv.paymentMethod || "Bank Transfer",
    notes: inv.notes || "",
  };
}

interface InvoiceEditorModalProps {
  open: boolean;
  initialDraft: InvoiceDraft | null;
  config: ConfigData;
  availableRecords: Transaction[];
  lang: Language;
  onSave: (draft: InvoiceDraft) => Promise<InvoiceRecord>;
  onClose: () => void;
}

export function InvoiceEditorModal({
  open,
  initialDraft,
  config,
  availableRecords,
  lang,
  onSave,
  onClose,
}: InvoiceEditorModalProps) {
  const t = translations[lang];
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [showRecordPicker, setShowRecordPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && initialDraft) {
      setDraft({
        ...initialDraft,
        items: initialDraft.items.map((i) => ({
          ...i,
          quantity: Math.max(1, Number(i.quantity) || 1),
        })),
      });
      setShowRecordPicker(false);
    }
  }, [open, initialDraft]);

  const quickClients = useMemo(() => {
    const set = new Set<string>();
    for (const ag of config.agents) if (ag.trim()) set.add(ag.trim());
    for (const loc of config.locations) if (loc.trim()) set.add(loc.trim());
    return Array.from(set).slice(0, 8);
  }, [config.locations, config.agents]);

  const quickAddresses = useMemo(() => {
    return Array.from(new Set(config.locations.map((l) => l.trim()).filter(Boolean))).slice(0, 8);
  }, [config.locations]);

  if (!open || !draft) return null;

  const isEditing = Boolean(draft.id);

  const totals = draft.items.reduce(
    (acc, it) => ({
      parts: acc.parts + (Number(it.parts) || 0),
      gst: acc.gst + (Number(it.gst) || 0),
      total: acc.total + (Number(it.total) || 0),
    }),
    { parts: 0, gst: 0, total: 0 }
  );
  const subtotalExGst = Math.max(0, totals.total - totals.gst);
  const isTaxInv = isAustralianTaxInvoice({ gstTotal: totals.gst }, config.businessProfile);
  const showAtoThousandWarning =
    isTaxInv && totals.total >= 1000 && !draft.clientName.trim() && !draft.clientAbn.trim();

  const pdfFileNamePreview = buildInvoicePdfFileName(draft);

  const setDuePreset = (days: number) => {
    const base = parseISO(draft.issueDate);
    const start = isValid(base) ? base : new Date();
    setDraft((prev) =>
      prev ? { ...prev, dueDate: format(addDays(start, days), "yyyy-MM-dd") } : prev
    );
  };

  const updateItem = (idx: number, patch: Partial<InvoiceLineItem>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.items];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, items: next };
    });
  };

  const removeItem = (idx: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = prev.items.filter((_, i) => i !== idx);
      return {
        ...prev,
        items:
          next.length > 0
            ? next
            : [
                {
                  id: makeLocalId(),
                  date: prev.issueDate,
                  description: "",
                  quantity: 1,
                  parts: 0,
                  gst: 0,
                  total: 0,
                },
              ],
      };
    });
  };

  const addBlankLine = () => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            id: makeLocalId(),
            date: prev.issueDate,
            description: "",
            quantity: 1,
            parts: 0,
            gst: 0,
            total: 0,
          },
        ],
      };
    });
  };

  const addRecordAsLine = (rec: Transaction) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const alreadyIncluded = prev.items.some((i) => i.recordId === rec.id);
      if (alreadyIncluded) return prev;

      const cleanedExisting = prev.items.filter(
        (i) => i.description.trim() || i.total > 0 || i.parts > 0
      );

      const nextAddress =
        prev.serviceAddress || (rec.location ? rec.location.trim() : "");
      const nextClient =
        prev.clientName || (rec.agent ? rec.agent.trim() : rec.location?.trim() || "");

      return {
        ...prev,
        clientName: nextClient,
        serviceAddress: nextAddress,
        items: [
          ...cleanedExisting,
          {
            id: makeLocalId(),
            recordId: rec.id,
            date: rec.date,
            description: rec.description,
            quantity: 1,
            parts: rec.amount || 0,
            gst: rec.gst || 0,
            total: rec.total || 0,
          },
        ],
      };
    });
  };

  const validItemsCount = draft.items.filter(
    (i) => i.description.trim() || Number(i.total) > 0
  ).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validItemsCount === 0) return;
    setBusy(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-3xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-black/5 max-h-[94vh] flex flex-col overflow-hidden safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.06]">
          <div>
            <h3 className="text-2xl font-bold text-[#1D1D1F]">
              {isEditing ? t.editInvoiceTitle : t.createInvoiceTitle}
            </h3>
            <p className="text-xs font-semibold text-[#86868B] mt-0.5">
              {isTaxInv ? "ATO TAX INVOICE (AUD)" : "AUSTRALIAN INVOICE (AUD)"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#515154]"
          >
            <X size={24} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Row 1: Invoice # & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-semibold text-[#515154] mb-2">
                {t.invoiceNumberLabel}
              </label>
              <input
                type="text"
                value={draft.invoiceNumber}
                onChange={(e) => setDraft({ ...draft, invoiceNumber: e.target.value })}
                className="w-full h-14 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-xl font-bold text-[#1D1D1F] outline-none"
              />
            </div>

            <div>
              <label className="block text-base font-semibold text-[#515154] mb-2">
                {t.statusUnpaid} / {t.statusPaid}
              </label>
              <div className="grid grid-cols-2 gap-2.5 h-14">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, status: "Unpaid" })}
                  className={[
                    "rounded-2xl text-lg font-bold flex items-center justify-center gap-2 transition",
                    draft.status === "Unpaid"
                      ? "bg-[#FF9500] text-white shadow-sm"
                      : "bg-[#F5F5F7] text-[#515154]",
                  ].join(" ")}
                >
                  <Clock size={20} />
                  <span>{t.statusUnpaid}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      status: "Paid",
                      paidDate: draft.paidDate || format(new Date(), "yyyy-MM-dd"),
                      paymentMethod: draft.paymentMethod || "Bank Transfer",
                    })
                  }
                  className={[
                    "rounded-2xl text-lg font-bold flex items-center justify-center gap-2 transition",
                    draft.status === "Paid"
                      ? "bg-[#1E9E49] text-white shadow-sm"
                      : "bg-[#F5F5F7] text-[#515154]",
                  ].join(" ")}
                >
                  <CheckCircle2 size={20} />
                  <span>{t.statusPaid}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Paid Details when Status === Paid */}
          {draft.status === "Paid" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-[#1E9E49]/[0.06] border border-[#1E9E49]/20">
              <div>
                <label className="block text-sm font-semibold text-[#1E9E49] mb-1.5">
                  {t.paymentMethod}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "Bank Transfer", label: t.bankTransfer },
                      { id: "Cash", label: t.cash },
                      { id: "Card", label: t.card },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setDraft({ ...draft, paymentMethod: m.id })}
                      className={[
                        "h-11 px-2 rounded-xl text-sm font-semibold transition",
                        draft.paymentMethod === m.id
                          ? "bg-[#1E9E49] text-white"
                          : "bg-white text-[#1D1D1F] border border-black/10",
                      ].join(" ")}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1E9E49] mb-1.5">
                  {t.dateLabel} ({t.statusPaid})
                </label>
                <input
                  type="date"
                  value={draft.paidDate || format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => setDraft({ ...draft, paidDate: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/10 text-base font-semibold outline-none"
                />
              </div>
            </div>
          )}

          {/* Row 2: Job / Service Address & Client / Bill To */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FAFAFC] border border-black/[0.06] space-y-4">
            {/* Dedicated Service Address (prominent because it drives Australian job location + PDF export filename) */}
            <div>
              <label className="flex items-center gap-1.5 text-base font-bold text-[#1D1D1F] mb-2">
                <MapPin size={18} className="text-[#007AFF]" />
                <span>{t.serviceAddressLabel}</span>
              </label>
              <input
                type="text"
                value={draft.serviceAddress}
                onChange={(e) => setDraft({ ...draft, serviceAddress: e.target.value })}
                placeholder={t.serviceAddressPlaceholder}
                className="w-full h-14 px-4 rounded-2xl bg-white border-2 border-black/10 focus:border-[#007AFF] text-xl font-semibold outline-none transition"
              />
              {quickAddresses.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <span className="text-sm text-[#86868B]">{t.quickPickAddress}</span>
                  {quickAddresses.map((addr) => (
                    <button
                      key={addr}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          serviceAddress: addr,
                          clientName: draft.clientName || addr,
                        })
                      }
                      className={[
                        "px-3 py-1 rounded-xl text-sm font-semibold transition",
                        draft.serviceAddress === addr
                          ? "bg-[#007AFF] text-white"
                          : "bg-white border border-black/10 hover:border-[#007AFF] text-[#1D1D1F]",
                      ].join(" ")}
                    >
                      {addr}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Bill To */}
            <div>
              <label className="block text-base font-semibold text-[#515154] mb-2">
                {t.billToLabel}
              </label>
              <input
                type="text"
                value={draft.clientName}
                onChange={(e) => setDraft({ ...draft, clientName: e.target.value })}
                placeholder={t.billToPlaceholder}
                className="w-full h-13 px-4 rounded-2xl bg-white border-2 border-black/10 focus:border-[#007AFF] text-lg font-semibold outline-none transition"
              />
              {quickClients.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-sm text-[#86868B]">{t.quickPickClient}</span>
                  {quickClients.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDraft({ ...draft, clientName: c })}
                      className={[
                        "px-3 py-1 rounded-xl text-sm font-semibold transition",
                        draft.clientName === c
                          ? "bg-[#007AFF] text-white"
                          : "bg-white border border-black/10 hover:border-[#007AFF] text-[#1D1D1F]",
                      ].join(" ")}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-[#515154] mb-1.5">
                  {t.clientAbnLabel}
                </label>
                <input
                  type="text"
                  value={draft.clientAbn}
                  onChange={(e) => setDraft({ ...draft, clientAbn: e.target.value })}
                  placeholder={t.clientAbnPlaceholder}
                  className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/10 focus:border-[#007AFF] text-base outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#515154] mb-1.5">
                  {t.clientDetailsLabel}
                </label>
                <input
                  type="text"
                  value={draft.clientDetails}
                  onChange={(e) => setDraft({ ...draft, clientDetails: e.target.value })}
                  placeholder={t.clientDetailsPlaceholder}
                  className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/10 focus:border-[#007AFF] text-base outline-none transition"
                />
              </div>
            </div>

            {showAtoThousandWarning && (
              <div className="p-3.5 rounded-xl bg-[#FF9500]/12 border border-[#FF9500]/30 text-[#995200] text-sm font-semibold flex items-start gap-2">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <span>{t.atoThousandHint}</span>
              </div>
            )}

            <div className="text-xs text-[#515154] flex items-center gap-1.5 pt-1">
              <FileText size={14} className="text-[#007AFF] shrink-0" />
              <span>{t.pdfFilePreviewLabel}</span>
              <strong className="text-[#1D1D1F] break-all">{pdfFileNamePreview}</strong>
            </div>
          </div>

          {/* Row 3: Issue Date & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-semibold text-[#515154] mb-2">
                {t.issueDateLabel} ({formatAuDate(draft.issueDate)})
              </label>
              <input
                type="date"
                value={draft.issueDate}
                onChange={(e) => setDraft({ ...draft, issueDate: e.target.value })}
                className="w-full h-13 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-lg font-semibold outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-base font-semibold text-[#515154]">
                  {t.dueDateLabel} ({formatAuDate(draft.dueDate)})
                </label>
                <div className="flex gap-1.5">
                  {(
                    [
                      { d: 0, label: t.duePresetToday },
                      { d: 7, label: t.duePreset7 },
                      { d: 14, label: t.duePreset14 },
                      { d: 30, label: t.duePreset30 },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.d}
                      type="button"
                      onClick={() => setDuePreset(p.d)}
                      className="px-2 py-0.5 rounded-lg bg-[#007AFF]/10 hover:bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="date"
                value={draft.dueDate}
                onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                className="w-full h-13 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-lg font-semibold outline-none"
              />
            </div>
          </div>

          {/* Row 4: Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-lg font-bold text-[#1D1D1F]">{t.invoiceItemsLabel}</label>
              <div className="flex gap-2">
                {availableRecords.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowRecordPicker(!showRecordPicker)}
                    className="px-3.5 py-2 rounded-xl bg-[#007AFF]/10 hover:bg-[#007AFF]/18 text-[#007AFF] text-sm font-semibold flex items-center gap-1.5 transition"
                  >
                    <FileText size={16} />
                    <span>
                      {showRecordPicker ? t.hideRecordsPickerBtn : t.pickFromRecordsBtn}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={addBlankLine}
                  className="px-3.5 py-2 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] text-sm font-semibold flex items-center gap-1.5 transition"
                >
                  <Plus size={16} />
                  <span>{t.addBlankItemBtn}</span>
                </button>
              </div>
            </div>

            {/* Optional Record Picker Drawer */}
            {showRecordPicker && (
              <div className="p-3.5 rounded-2xl bg-[#F5F5F7] border border-black/[0.06] max-h-52 overflow-y-auto space-y-2">
                {availableRecords.map((rec) => {
                  const added = draft.items.some((i) => i.recordId === rec.id);
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      disabled={added}
                      onClick={() => addRecordAsLine(rec)}
                      className={[
                        "w-full px-4 py-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition",
                        added
                          ? "bg-white/50 text-[#86868B] cursor-default"
                          : "bg-white hover:bg-[#007AFF]/5 text-[#1D1D1F] shadow-2xs",
                      ].join(" ")}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold truncate">
                          {localizeDescription(rec.description, config.descriptions, lang)}
                        </p>
                        <p className="text-xs text-[#86868B]">
                          {formatAuDate(rec.date)}
                          {rec.location ? ` · ${rec.location}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold tabular-nums">${rec.total.toFixed(2)}</span>
                        {added ? (
                          <Check size={18} className="text-[#1E9E49]" />
                        ) : (
                          <Plus size={18} className="text-[#007AFF]" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Line Item Cards */}
            <div className="space-y-3">
              {draft.items.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-[#FAFAFC] border border-black/[0.07] space-y-3"
                >
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="date"
                      value={item.date}
                      onChange={(e) => updateItem(idx, { date: e.target.value })}
                      className="sm:w-40 h-12 px-3 rounded-xl bg-white border border-black/10 text-base font-medium outline-none"
                    />
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                      placeholder={t.itemDescPlaceholder}
                      className="flex-1 h-12 px-4 rounded-xl bg-white border border-black/10 focus:border-[#007AFF] text-lg font-semibold outline-none"
                    />
                    {draft.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="h-12 px-3 rounded-xl text-[#FF3B30] hover:bg-[#FF3B30]/10 flex items-center justify-center gap-1 text-sm font-semibold shrink-0"
                      >
                        <Trash2 size={18} />
                        <span className="sm:hidden">{t.removeLineBtn}</span>
                      </button>
                    )}
                  </div>

                  {/* Quick Category Chips if Description is empty */}
                  {!item.description.trim() && (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(config.descriptions).map(([zh, en]) => (
                        <button
                          key={zh}
                          type="button"
                          onClick={() => updateItem(idx, { description: en })}
                          className="px-2.5 py-1 rounded-lg bg-white border border-black/10 hover:border-[#007AFF] text-sm font-medium text-[#1D1D1F]"
                        >
                          {lang === "zh" ? `${zh} (${en})` : en}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-[#86868B] mb-1">
                        {t.qtyShort}
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={item.quantity ?? 1}
                        onChange={(e) =>
                          updateItem(idx, {
                            quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                          })
                        }
                        className="w-full h-11 px-3 rounded-xl bg-white border border-black/10 text-base font-semibold tabular-nums outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#86868B] mb-1">
                        {t.partsShort} ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={item.parts || ""}
                        placeholder="0.00"
                        onChange={(e) =>
                          updateItem(idx, { parts: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full h-11 px-3 rounded-xl bg-white border border-black/10 text-base font-semibold tabular-nums outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-[#86868B]">
                          {t.gstShort} ($)
                        </label>
                        {item.total > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              updateItem(idx, {
                                gst: Math.round((item.total / 11) * 100) / 100,
                              })
                            }
                            className="text-[11px] font-bold text-[#007AFF] flex items-center gap-0.5"
                          >
                            <Sparkles size={11} />
                            10%
                          </button>
                        )}
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={item.gst || ""}
                        placeholder="0.00"
                        onChange={(e) =>
                          updateItem(idx, { gst: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full h-11 px-3 rounded-xl bg-white border border-black/10 text-base font-semibold tabular-nums outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#1D1D1F] mb-1">
                        {t.totalAmount} (AUD $)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={item.total || ""}
                        placeholder="0.00"
                        onChange={(e) =>
                          updateItem(idx, { total: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full h-11 px-3 rounded-xl bg-white border-2 border-[#007AFF]/40 focus:border-[#007AFF] text-lg font-bold tabular-nums outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals Box + Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div>
              <label className="block text-base font-semibold text-[#515154] mb-2">
                {t.invoiceNotesLabel}
              </label>
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder={t.invoiceNotesPlaceholder}
                className="w-full p-3.5 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-base outline-none resize-none"
              />
            </div>

            <div className="p-5 rounded-2xl bg-[#F5F5F7] space-y-2 tabular-nums">
              <div className="flex justify-between text-base text-[#515154]">
                <span>{t.subtotalExGst}</span>
                <span>${subtotalExGst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base text-[#515154]">
                <span>{t.gstShort}</span>
                <span>${totals.gst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-2xl font-bold text-[#1D1D1F] pt-2 border-t border-black/10">
                <span>Total (AUD)</span>
                <span>${totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
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
            disabled={busy || validItemsCount === 0}
            className="flex-1 h-14 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-lg font-bold disabled:opacity-40 shadow-md shadow-[#007AFF]/20"
          >
            {t.saveInvoiceBtn} (${totals.total.toFixed(2)})
          </button>
        </div>
      </form>
    </div>
  );
}

interface InvoicePreviewModalProps {
  invoice: InvoiceRecord | null;
  business: BusinessProfile;
  lang: Language;
  onToggleStatus: (inv: InvoiceRecord) => Promise<void>;
  onEdit: (inv: InvoiceRecord) => void;
  onOpenBusinessSettings: () => void;
  onClose: () => void;
}

export function InvoicePreviewModal({
  invoice,
  business,
  lang,
  onToggleStatus,
  onEdit,
  onOpenBusinessSettings,
  onClose,
}: InvoicePreviewModalProps) {
  const t = translations[lang];
  if (!invoice) return null;

  const isPaid = invoice.status === "Paid";
  const isTaxInv = isAustralianTaxInvoice(invoice, business);
  const subtotalExGst = Math.max(0, invoice.total - invoice.gstTotal);
  const balanceDue = isPaid ? 0 : invoice.total;
  const formattedSellerAbn = formatAuAbn(business.businessAbn);
  const formattedBuyerAbn = formatAuAbn(invoice.clientAbn);
  const formattedBsb = formatAuBsb(business.bankBsb);
  const pdfFileName = buildInvoicePdfFileName(invoice);

  const hasBank = Boolean(
    business.bankAccountName ||
      business.bankBsb ||
      business.bankAccountNumber ||
      business.payId
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-3xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-black/5 max-h-[94vh] flex flex-col overflow-hidden safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-black/[0.06] bg-[#FAFAFC]">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-[#1D1D1F]">{invoice.invoiceNumber}</span>
            <span
              className={[
                "px-3 py-1 rounded-full text-sm font-bold",
                isPaid
                  ? "bg-[#1E9E49]/15 text-[#1E9E49]"
                  : "bg-[#FF9500]/15 text-[#B25E00]",
              ].join(" ")}
            >
              {isPaid ? t.statusPaid : t.statusUnpaid}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleStatus(invoice)}
              className={[
                "h-10 px-4 rounded-xl text-sm font-bold transition",
                isPaid
                  ? "bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#515154]"
                  : "bg-[#1E9E49] hover:bg-[#17853B] text-white",
              ].join(" ")}
            >
              {isPaid ? t.markUnpaidBtn : t.markPaidBtn}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(invoice);
              }}
              className="h-10 px-3.5 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#007AFF] text-sm font-semibold flex items-center gap-1.5"
            >
              <Pencil size={16} />
              <span>{t.editBtn}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#515154]"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Visual Australian Tax Invoice Sheet */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-[#F5F5F7]">
          {(!business.businessName || !business.businessAbn) && (
            <div className="mb-4 p-4 rounded-2xl bg-[#007AFF]/10 border border-[#007AFF]/20 flex items-center justify-between gap-3">
              <span className="text-base font-medium text-[#1D1D1F]">
                {t.businessModalHint}
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBusinessSettings();
                }}
                className="px-4 py-2 rounded-xl bg-[#007AFF] text-white text-sm font-semibold shrink-0"
              >
                {t.businessInfoBtn}
              </button>
            </div>
          )}

          <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-sm border border-black/5 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-black/[0.08]">
              <div>
                <h2 className="text-2xl font-extrabold text-[#1D1D1F]">
                  {business.businessName || t.appName}
                </h2>
                <div className="text-sm text-[#515154] mt-1 space-y-0.5">
                  {formattedSellerAbn && (
                    <p className="font-bold text-[#1D1D1F]">ABN: {formattedSellerAbn}</p>
                  )}
                  {business.businessAddress && <p>{business.businessAddress}</p>}
                  {business.businessPhone && <p>Phone: {business.businessPhone}</p>}
                  {business.businessEmail && <p>Email: {business.businessEmail}</p>}
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-2xl font-extrabold tracking-wide text-[#1D1D1F]">
                  {isTaxInv ? "TAX INVOICE" : "INVOICE"}
                </p>
                <p className="text-lg font-bold text-[#007AFF]">
                  Invoice # {invoice.invoiceNumber}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-[#FAFAFC] border border-black/[0.05] space-y-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#86868B]">
                    Bill To (Customer)
                  </p>
                  <p className="text-lg font-bold text-[#1D1D1F] mt-0.5">
                    {invoice.clientName || invoice.serviceAddress || "Customer"}
                  </p>
                  {formattedBuyerAbn && (
                    <p className="text-sm text-[#515154]">
                      <strong>ABN:</strong> {formattedBuyerAbn}
                    </p>
                  )}
                  {invoice.clientDetails && (
                    <p className="text-sm text-[#515154] mt-0.5 whitespace-pre-line">
                      {invoice.clientDetails}
                    </p>
                  )}
                </div>

                {invoice.serviceAddress && (
                  <div className="pt-2 border-t border-black/[0.07]">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#86868B]">
                      Job / Service Address
                    </p>
                    <p className="text-base font-bold text-[#1D1D1F] mt-0.5">
                      {invoice.serviceAddress}
                    </p>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-[#FAFAFC] border border-black/[0.05] space-y-1.5 text-sm tabular-nums">
                <div className="flex justify-between">
                  <span className="text-[#515154]">Invoice Number</span>
                  <span className="font-bold text-[#1D1D1F]">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#515154]">{t.issueDateLabel}</span>
                  <span className="font-bold text-[#1D1D1F]">
                    {formatAuDate(invoice.issueDate)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#515154]">{t.dueDateLabel}</span>
                  <span className="font-bold text-[#1D1D1F]">
                    {formatAuDate(invoice.dueDate)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#515154]">Currency</span>
                  <span className="font-bold text-[#1D1D1F]">AUD ($)</span>
                </div>
                {isPaid && invoice.paidDate && (
                  <div className="flex justify-between text-[#1E9E49]">
                    <span>{t.statusPaid}</span>
                    <span className="font-bold">
                      {formatAuDate(invoice.paidDate)} ({invoice.paymentMethod})
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-black/[0.07] rounded-2xl overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F5F7] text-xs font-bold uppercase text-[#6E6E73]">
                    <th className="py-3 px-3.5">Date</th>
                    <th className="py-3 px-3.5">Description</th>
                    <th className="py-3 px-3 text-right">Qty</th>
                    <th className="py-3 px-3.5 text-right">Excl. GST</th>
                    <th className="py-3 px-3.5 text-right">{isTaxInv ? "GST (10%)" : "GST"}</th>
                    <th className="py-3 px-3.5 text-right">Amount (AUD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06] text-sm sm:text-base">
                  {invoice.items.map((item) => {
                    const qty = Math.max(1, Number(item.quantity) || 1);
                    const unitExGst = Math.max(0, (item.total || 0) - (item.gst || 0)) / qty;
                    return (
                      <tr key={item.id}>
                        <td className="py-3.5 px-3.5 text-sm text-[#515154] tabular-nums whitespace-nowrap">
                          {formatAuDate(item.date)}
                        </td>
                        <td className="py-3.5 px-3.5">
                          <div className="font-semibold text-[#1D1D1F]">{item.description}</div>
                          {(item.parts || 0) > 0 && (
                            <div className="text-xs text-[#6E6E73]">
                              Includes materials / parts: ${(item.parts || 0).toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right tabular-nums text-[#515154]">
                          {qty}
                        </td>
                        <td className="py-3.5 px-3.5 text-right tabular-nums text-[#515154]">
                          ${unitExGst.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-3.5 text-right tabular-nums text-[#515154]">
                          ${(item.gst || 0).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-3.5 text-right font-bold tabular-nums text-[#1D1D1F]">
                          ${(item.total || 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex flex-col items-end gap-2">
              <div className="w-full sm:w-80 p-4 rounded-2xl bg-[#FAFAFC] border border-black/[0.06] space-y-1.5 tabular-nums">
                <div className="flex justify-between text-sm text-[#515154]">
                  <span>Subtotal (Excl. GST)</span>
                  <span>${subtotalExGst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-[#515154]">
                  <span>{isTaxInv ? "Total GST (10%)" : "GST"}</span>
                  <span>${invoice.gstTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xl font-extrabold text-[#1D1D1F] pt-2 border-t border-black/10">
                  <span>Total (AUD)</span>
                  <span>${invoice.total.toFixed(2)}</span>
                </div>
                <div
                  className={[
                    "flex justify-between text-sm font-bold pt-2 border-t border-dashed border-black/15",
                    isPaid ? "text-[#1E9E49]" : "text-[#007AFF]",
                  ].join(" ")}
                >
                  <span>Balance Due (AUD)</span>
                  <span>${balanceDue.toFixed(2)}</span>
                </div>
              </div>

              <p className="text-xs text-[#6E6E73]">
                {isTaxInv
                  ? "Total price includes GST. All amounts are in Australian Dollars (AUD)."
                  : "No GST has been charged. All amounts are in Australian Dollars (AUD)."}
              </p>
            </div>

            {(hasBank || invoice.notes) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-black/[0.06] text-sm">
                {hasBank && (
                  <div className="p-4 rounded-2xl bg-[#F5F5F7] space-y-1">
                    <p className="text-xs font-bold uppercase text-[#86868B]">
                      How to Pay (Australian EFT / PayID)
                    </p>
                    {business.bankAccountName && (
                      <p>
                        <strong>Account Name:</strong> {business.bankAccountName}
                      </p>
                    )}
                    {formattedBsb && (
                      <p>
                        <strong>BSB:</strong> {formattedBsb}
                      </p>
                    )}
                    {business.bankAccountNumber && (
                      <p>
                        <strong>Account Number:</strong> {business.bankAccountNumber}
                      </p>
                    )}
                    {business.payId && (
                      <p>
                        <strong>PayID:</strong> {business.payId}
                      </p>
                    )}
                    <p className="text-xs text-[#515154] pt-1">
                      Reference: <strong>{invoice.invoiceNumber}</strong>
                    </p>
                  </div>
                )}
                {invoice.notes && (
                  <div className="p-4 rounded-2xl bg-[#F5F5F7] space-y-1">
                    <p className="text-xs font-bold uppercase text-[#86868B]">
                      Notes &amp; Payment Terms
                    </p>
                    <p className="whitespace-pre-line">{invoice.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom PDF & Print Bar */}
        <div className="px-6 py-4 border-t border-black/[0.06] bg-white space-y-2">
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={`/api/invoices/${encodeURIComponent(invoice.id)}/pdf`}
              download={pdfFileName}
              className="flex-1 h-14 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-lg font-bold flex items-center justify-center gap-2.5 shadow-md shadow-[#007AFF]/20 transition"
            >
              <Download size={22} />
              <span>{t.downloadPdfBtn}</span>
            </a>
            <a
              href={`/api/invoices/${encodeURIComponent(invoice.id)}/print?autoprint=1`}
              target="_blank"
              rel="noreferrer"
              className="sm:w-48 h-14 rounded-2xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] text-lg font-semibold flex items-center justify-center gap-2.5 transition"
            >
              <Printer size={22} />
              <span>{t.printInvoiceBtn}</span>
            </a>
          </div>
          <p className="text-xs text-center text-[#86868B] truncate">
            {t.pdfFilePreviewLabel} <strong className="text-[#515154]">{pdfFileName}</strong>
          </p>
        </div>
      </div>
    </div>
  );
}

interface BusinessProfileModalProps {
  open: boolean;
  profile: BusinessProfile;
  lang: Language;
  onSave: (next: BusinessProfile) => Promise<void>;
  onClose: () => void;
}

export function BusinessProfileModal({
  open,
  profile,
  lang,
  onSave,
  onClose,
}: BusinessProfileModalProps) {
  const t = translations[lang];
  const [form, setForm] = useState<BusinessProfile>(profile);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        ...profile,
        gstRegistered: profile.gstRegistered ?? true,
        payId: profile.payId || "",
      });
    }
  }, [open, profile]);

  if (!open) return null;

  const isGstOn = form.gstRegistered !== false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-black/5 max-h-[92vh] flex flex-col overflow-hidden safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.06]">
          <div className="flex items-center gap-2.5">
            <Building2 size={24} className="text-[#007AFF]" />
            <h3 className="text-xl font-bold text-[#1D1D1F]">{t.businessModalTitle}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#515154]"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-base text-[#515154]">{t.businessModalHint}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-[#515154] mb-1.5">
                {t.bizNameLabel}
              </label>
              <input
                type="text"
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                placeholder={t.bizNamePlaceholder}
                className="w-full h-13 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-lg font-semibold outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#515154] mb-1.5">
                {t.bizAbnLabel}
              </label>
              <input
                type="text"
                value={form.businessAbn}
                onChange={(e) => setForm({ ...form, businessAbn: e.target.value })}
                placeholder={t.bizAbnPlaceholder}
                className="w-full h-12 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-base font-mono outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#515154] mb-1.5">
                {t.invoicePrefixLabel}
              </label>
              <input
                type="text"
                value={form.invoicePrefix}
                onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
                placeholder="INV-"
                className="w-full h-12 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-base font-mono outline-none"
              />
            </div>

            {/* GST Registration Toggle */}
            <div className="sm:col-span-2 p-3.5 rounded-2xl bg-[#F5F5F7] flex items-center justify-between gap-4">
              <div>
                <p className="text-base font-bold text-[#1D1D1F]">{t.gstRegisteredLabel}</p>
                <p className="text-xs text-[#6E6E73] mt-0.5">{t.gstRegisteredHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setForm({ ...form, gstRegistered: !isGstOn })}
                className={[
                  "w-16 h-9 rounded-full transition-colors p-1 shrink-0 flex items-center",
                  isGstOn ? "bg-[#1E9E49] justify-end" : "bg-[#C7C7CC] justify-start",
                ].join(" ")}
              >
                <span className="w-7 h-7 rounded-full bg-white shadow-sm block" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#515154] mb-1.5">
                {t.bizPhoneLabel}
              </label>
              <input
                type="text"
                value={form.businessPhone}
                onChange={(e) => setForm({ ...form, businessPhone: e.target.value })}
                placeholder={t.bizPhonePlaceholder}
                className="w-full h-12 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-base outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#515154] mb-1.5">
                {t.bizEmailLabel}
              </label>
              <input
                type="email"
                value={form.businessEmail}
                onChange={(e) => setForm({ ...form, businessEmail: e.target.value })}
                placeholder={t.bizEmailPlaceholder}
                className="w-full h-12 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-base outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-[#515154] mb-1.5">
                {t.bizAddressLabel}
              </label>
              <input
                type="text"
                value={form.businessAddress}
                onChange={(e) => setForm({ ...form, businessAddress: e.target.value })}
                placeholder={t.bizAddressPlaceholder}
                className="w-full h-12 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-base outline-none"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-black/[0.06] space-y-3">
            <h4 className="text-base font-bold text-[#1D1D1F]">{t.bankSectionTitle}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-[#515154] mb-1">
                  {t.bankAccNameLabel}
                </label>
                <input
                  type="text"
                  value={form.bankAccountName}
                  onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })}
                  className="w-full h-12 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-base outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#515154] mb-1">
                  {t.bankBsbLabel}
                </label>
                <input
                  type="text"
                  value={form.bankBsb}
                  onChange={(e) => setForm({ ...form, bankBsb: e.target.value })}
                  placeholder="000-000"
                  className="w-full h-12 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-base font-mono outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#515154] mb-1">
                  {t.bankAccNumLabel}
                </label>
                <input
                  type="text"
                  value={form.bankAccountNumber}
                  onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
                  className="w-full h-12 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-base font-mono outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-[#515154] mb-1">
                  {t.payIdLabel}
                </label>
                <input
                  type="text"
                  value={form.payId || ""}
                  onChange={(e) => setForm({ ...form, payId: e.target.value })}
                  placeholder={t.payIdPlaceholder}
                  className="w-full h-12 px-4 rounded-2xl bg-[#F5F5F7] focus:bg-white border-2 border-transparent focus:border-[#007AFF] text-base outline-none"
                />
              </div>
            </div>
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
            disabled={busy}
            className="flex-1 h-14 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-lg font-bold disabled:opacity-50"
          >
            {t.saveChangesBtn}
          </button>
        </div>
      </form>
    </div>
  );
}
