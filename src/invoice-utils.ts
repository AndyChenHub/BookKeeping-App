import type { BusinessProfile, InvoiceRecord } from "./types";

/**
 * Formats an ISO date (YYYY-MM-DD) into Australian standard DD/MM/YYYY.
 */
export function formatAuDate(dateStr: string | undefined | null): string {
  const raw = String(dateStr || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return raw;
}

/**
 * Formats an 11-digit Australian Business Number as XX XXX XXX XXX.
 */
export function formatAuAbn(raw: string | undefined | null): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/[\s-]/g, "");
  if (/^\d{11}$/.test(digits)) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
  }
  return trimmed;
}

/**
 * Formats a 6-digit Australian Bank BSB as XXX-XXX.
 */
export function formatAuBsb(raw: string | undefined | null): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/[\s-]/g, "");
  if (/^\d{6}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}`;
  }
  return trimmed;
}

/**
 * Determines whether an invoice should be titled "TAX INVOICE" vs "INVOICE"
 * per Australian Taxation Office (ATO) rules.
 */
export function isAustralianTaxInvoice(
  invoice: Pick<InvoiceRecord, "gstTotal">,
  business: BusinessProfile
): boolean {
  if ((invoice.gstTotal || 0) > 0) {
    return true;
  }
  if (business.gstRegistered === false) {
    return false;
  }
  if (business.gstRegistered === true) {
    return true;
  }
  return Boolean(business.businessAbn?.trim());
}

/**
 * Extracts the best address label from an invoice (preferring serviceAddress,
 * then first line of clientDetails, then clientName).
 */
export function resolveInvoiceAddress(
  invoice: Partial<Pick<InvoiceRecord, "serviceAddress" | "clientDetails" | "clientName">>
): string {
  if (invoice.serviceAddress && invoice.serviceAddress.trim()) {
    return invoice.serviceAddress.trim();
  }
  if (invoice.clientDetails && invoice.clientDetails.trim()) {
    const firstLine = invoice.clientDetails
      .split(/\r?\n/)[0]
      ?.trim();
    if (firstLine) return firstLine;
  }
  if (invoice.clientName && invoice.clientName.trim()) {
    return invoice.clientName.trim();
  }
  return "";
}

function sanitizeFileSegment(raw: string, maxLen = 65): string {
  return raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/[,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .slice(0, maxLen)
    .trim();
}

/**
 * Builds the PDF base filename (without .pdf) including the issue date and address.
 * Example: "2026-11-11 - 15 Collins St Melbourne - INV-0001"
 */
export function buildInvoicePdfBaseName(
  invoice: Partial<
    Pick<InvoiceRecord, "issueDate" | "serviceAddress" | "clientDetails" | "clientName" | "invoiceNumber">
  >
): string {
  const datePart = sanitizeFileSegment(invoice.issueDate || "", 20) || "Invoice";
  const addressPart = sanitizeFileSegment(resolveInvoiceAddress(invoice), 64);
  const numPart = sanitizeFileSegment(invoice.invoiceNumber || "", 24);

  const parts = [datePart];
  if (addressPart) {
    parts.push(addressPart);
  }
  if (numPart && numPart.toLowerCase() !== addressPart.toLowerCase()) {
    parts.push(numPart);
  }
  return parts.join(" - ");
}

export function buildInvoicePdfFileName(
  invoice: Partial<
    Pick<InvoiceRecord, "issueDate" | "serviceAddress" | "clientDetails" | "clientName" | "invoiceNumber">
  >
): string {
  return `${buildInvoicePdfBaseName(invoice)}.pdf`;
}
