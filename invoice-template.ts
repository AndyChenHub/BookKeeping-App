import type { BusinessProfile, InvoiceRecord } from "./src/types";
import {
  buildInvoicePdfBaseName,
  buildInvoicePdfFileName,
  formatAuAbn,
  formatAuBsb,
  formatAuDate,
  isAustralianTaxInvoice,
} from "./src/invoice-utils";

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderInvoiceHtml(
  invoice: InvoiceRecord,
  business: BusinessProfile,
  options: { forPdf?: boolean; autoPrint?: boolean } = {}
): string {
  const isTaxInvoice = isAustralianTaxInvoice(invoice, business);
  const docTitle = isTaxInvoice ? "TAX INVOICE" : "INVOICE";
  const isPaid = invoice.status === "Paid";
  const subtotalExGst = Math.max(0, Math.round((invoice.total - invoice.gstTotal) * 100) / 100);
  const balanceDue = isPaid ? 0 : invoice.total;

  const formattedSellerAbn = formatAuAbn(business.businessAbn);
  const formattedBuyerAbn = formatAuAbn(invoice.clientAbn);
  const formattedBsb = formatAuBsb(business.bankBsb);
  const pdfBaseName = buildInvoicePdfBaseName(invoice);
  const pdfFileName = buildInvoicePdfFileName(invoice);

  const hasBankInfo = Boolean(
    business.bankAccountName?.trim() ||
      business.bankBsb?.trim() ||
      business.bankAccountNumber?.trim() ||
      business.payId?.trim()
  );

  const toolbarHtml = options.forPdf
    ? ""
    : `
    <div class="no-print toolbar">
      <div class="toolbar-inner">
        <div>
          <span style="font-weight:700;color:#1D1D1F;">${escapeHtml(pdfBaseName)}</span>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <a href="/api/invoices/${encodeURIComponent(invoice.id)}/pdf" download="${escapeHtml(pdfFileName)}" class="pdf-btn">Export PDF</a>
          <button onclick="window.print()" class="print-btn">Print</button>
        </div>
      </div>
    </div>`;

  const autoPrintScript =
    !options.forPdf && options.autoPrint
      ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>`
      : "";

  const atoComplianceLine = isTaxInvoice
    ? "Total price includes GST. All amounts are in Australian Dollars (AUD)."
    : "No GST has been charged. All amounts are in Australian Dollars (AUD).";

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(pdfBaseName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #1D1D1F;
      background: ${options.forPdf ? "#FFFFFF" : "#F5F5F7"};
      -webkit-font-smoothing: antialiased;
      line-height: 1.5;
    }
    .toolbar {
      position: sticky;
      top: 0;
      background: rgba(255,255,255,0.92);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid rgba(0,0,0,0.08);
      padding: 14px 24px;
      z-index: 20;
    }
    .toolbar-inner {
      max-width: 820px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .pdf-btn {
      background: #007AFF;
      color: #FFFFFF;
      text-decoration: none;
      border-radius: 12px;
      padding: 10px 18px;
      font-size: 15px;
      font-weight: 700;
    }
    .print-btn {
      background: #E8E8ED;
      color: #1D1D1F;
      border: none;
      border-radius: 12px;
      padding: 10px 18px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    .sheet {
      max-width: 820px;
      margin: ${options.forPdf ? "0 auto" : "28px auto 48px"};
      background: #FFFFFF;
      border-radius: ${options.forPdf ? "0" : "24px"};
      padding: ${options.forPdf ? "14px 18px" : "46px"};
      box-shadow: ${options.forPdf ? "none" : "0 4px 24px rgba(0,0,0,0.06)"};
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      padding-bottom: 24px;
      border-bottom: 2px solid #E5E5EA;
    }
    .biz-name {
      font-size: 25px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #1D1D1F;
      margin-bottom: 6px;
    }
    .biz-meta {
      font-size: 13.5px;
      color: #515154;
      line-height: 1.6;
    }
    .abn-badge {
      display: inline-block;
      font-weight: 700;
      color: #1D1D1F;
      margin-bottom: 2px;
    }
    .inv-badge-col {
      text-align: right;
      flex-shrink: 0;
    }
    .inv-title {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: #1D1D1F;
    }
    .inv-num {
      font-size: 16px;
      font-weight: 700;
      color: #007AFF;
      margin-top: 2px;
    }
    .status-pill {
      display: inline-block;
      margin-top: 10px;
      padding: 5px 14px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background: ${isPaid ? "#E8F7ED" : "#FFF4E5"};
      color: ${isPaid ? "#1E9E49" : "#B25E00"};
      border: 1px solid ${isPaid ? "#B7E6C6" : "#FFD8A8"};
    }
    .meta-grid {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      margin: 24px 0;
    }
    .bill-to {
      flex: 1;
      background: #FAFAFC;
      border: 1px solid #ECECEF;
      border-radius: 16px;
      padding: 16px 20px;
    }
    .section-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #86868B;
      margin-bottom: 4px;
    }
    .client-name {
      font-size: 18px;
      font-weight: 700;
      color: #1D1D1F;
    }
    .client-meta {
      font-size: 13.5px;
      color: #515154;
      margin-top: 3px;
      white-space: pre-line;
    }
    .service-addr-block {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #E5E5EA;
    }
    .service-addr-val {
      font-size: 15px;
      font-weight: 700;
      color: #1D1D1F;
    }
    .dates-box {
      min-width: 245px;
      background: #FAFAFC;
      border: 1px solid #ECECEF;
      border-radius: 16px;
      padding: 16px 20px;
    }
    .date-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      font-size: 13.5px;
      margin-bottom: 7px;
    }
    .date-row:last-child { margin-bottom: 0; }
    .date-label { color: #515154; font-weight: 500; }
    .date-val { color: #1D1D1F; font-weight: 700; font-variant-numeric: tabular-nums; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
    }
    th {
      text-align: left;
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #6E6E73;
      padding: 11px 12px;
      background: #F5F5F7;
      border-top: 1px solid #E5E5EA;
      border-bottom: 1px solid #E5E5EA;
    }
    th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td {
      padding: 13px 12px;
      font-size: 14px;
      border-bottom: 1px solid #EFEFF4;
      color: #1D1D1F;
      vertical-align: top;
    }
    .sub-parts {
      font-size: 12px;
      color: #6E6E73;
      font-weight: 500;
      margin-top: 2px;
    }
    .totals-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: 22px;
    }
    .totals-box {
      width: 320px;
      background: #FAFAFC;
      border: 1px solid #ECECEF;
      border-radius: 16px;
      padding: 16px 20px;
    }
    .tot-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      color: #515154;
      margin-bottom: 7px;
      font-variant-numeric: tabular-nums;
    }
    .tot-grand {
      display: flex;
      justify-content: space-between;
      font-size: 19px;
      font-weight: 800;
      color: #1D1D1F;
      padding-top: 10px;
      margin-top: 8px;
      border-top: 2px solid #E5E5EA;
      font-variant-numeric: tabular-nums;
    }
    .tot-balance {
      display: flex;
      justify-content: space-between;
      font-size: 15px;
      font-weight: 700;
      color: ${isPaid ? "#1E9E49" : "#007AFF"};
      padding-top: 8px;
      margin-top: 8px;
      border-top: 1px dashed #D1D1D6;
      font-variant-numeric: tabular-nums;
    }
    .ato-note {
      margin-top: 14px;
      text-align: right;
      font-size: 12.5px;
      color: #6E6E73;
      font-weight: 500;
    }
    .footer-grid {
      margin-top: 26px;
      padding-top: 20px;
      border-top: 1px solid #ECECEF;
      display: grid;
      grid-template-columns: ${hasBankInfo && invoice.notes ? "1fr 1fr" : "1fr"};
      gap: 18px;
    }
    .info-card {
      background: #F5F5F7;
      border-radius: 14px;
      padding: 15px 18px;
      font-size: 13.5px;
      color: #1D1D1F;
      line-height: 1.6;
    }
    @media print {
      body { background: #FFFFFF; }
      .no-print { display: none !important; }
      .sheet { margin: 0; padding: 10px; box-shadow: none; border-radius: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  ${toolbarHtml}
  <div class="sheet">
    <div class="header">
      <div>
        <div class="biz-name">${escapeHtml(business.businessName || "BookKeeping")}</div>
        <div class="biz-meta">
          ${formattedSellerAbn ? `<div class="abn-badge">ABN: ${escapeHtml(formattedSellerAbn)}</div>` : ""}
          ${business.businessAddress ? `<div>${escapeHtml(business.businessAddress)}</div>` : ""}
          ${business.businessPhone ? `<div>Phone: ${escapeHtml(business.businessPhone)}</div>` : ""}
          ${business.businessEmail ? `<div>Email: ${escapeHtml(business.businessEmail)}</div>` : ""}
        </div>
      </div>
      <div class="inv-badge-col">
        <div class="inv-title">${docTitle}</div>
        <div class="inv-num">Invoice # ${escapeHtml(invoice.invoiceNumber)}</div>
        <div class="status-pill">${isPaid ? "PAID" : "PAYMENT DUE"}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="bill-to">
        <div class="section-label">Bill To (Customer)</div>
        <div class="client-name">${escapeHtml(invoice.clientName || invoice.serviceAddress || "Customer")}</div>
        ${formattedBuyerAbn ? `<div class="client-meta"><strong>ABN:</strong> ${escapeHtml(formattedBuyerAbn)}</div>` : ""}
        ${invoice.clientDetails ? `<div class="client-meta">${escapeHtml(invoice.clientDetails)}</div>` : ""}
        ${
          invoice.serviceAddress
            ? `<div class="service-addr-block">
                <div class="section-label">Job / Service Address</div>
                <div class="service-addr-val">${escapeHtml(invoice.serviceAddress)}</div>
              </div>`
            : ""
        }
      </div>
      <div class="dates-box">
        <div class="date-row">
          <span class="date-label">Invoice Number</span>
          <span class="date-val">${escapeHtml(invoice.invoiceNumber)}</span>
        </div>
        <div class="date-row">
          <span class="date-label">Issue Date</span>
          <span class="date-val">${escapeHtml(formatAuDate(invoice.issueDate))}</span>
        </div>
        <div class="date-row">
          <span class="date-label">Due Date</span>
          <span class="date-val">${escapeHtml(formatAuDate(invoice.dueDate))}</span>
        </div>
        <div class="date-row">
          <span class="date-label">Currency</span>
          <span class="date-val">AUD ($)</span>
        </div>
        ${
          isPaid && invoice.paidDate
            ? `<div class="date-row">
                <span class="date-label">Paid Date</span>
                <span class="date-val" style="color:#1E9E49;">${escapeHtml(formatAuDate(invoice.paidDate))}</span>
              </div>`
            : ""
        }
        ${
          isPaid && invoice.paymentMethod
            ? `<div class="date-row">
                <span class="date-label">Payment Method</span>
                <span class="date-val">${escapeHtml(invoice.paymentMethod)}</span>
              </div>`
            : ""
        }
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:102px;">Date</th>
          <th>Description of Supply</th>
          <th class="num" style="width:58px;">Qty</th>
          <th class="num" style="width:118px;">Unit (Excl. GST)</th>
          <th class="num" style="width:98px;">${isTaxInvoice ? "GST (10%)" : "GST"}</th>
          <th class="num" style="width:125px;">Amount (AUD)</th>
        </tr>
      </thead>
      <tbody>
        ${invoice.items
          .map((item) => {
            const qty = Math.max(1, Number(item.quantity) || 1);
            const lineExGst = Math.max(0, (item.total || 0) - (item.gst || 0));
            const unitExGst = lineExGst / qty;
            return `
          <tr>
            <td style="color:#515154;font-variant-numeric:tabular-nums;">${escapeHtml(formatAuDate(item.date || invoice.issueDate))}</td>
            <td>
              <div style="font-weight:600;">${escapeHtml(item.description || "Service")}</div>
              ${
                (item.parts || 0) > 0
                  ? `<div class="sub-parts">Includes materials / parts: $${(item.parts || 0).toFixed(2)}</div>`
                  : ""
              }
            </td>
            <td class="num">${qty}</td>
            <td class="num">$${unitExGst.toFixed(2)}</td>
            <td class="num">$${(item.gst || 0).toFixed(2)}</td>
            <td class="num" style="font-weight:700;">$${(item.total || 0).toFixed(2)}</td>
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>

    <div class="totals-wrap">
      <div class="totals-box">
        <div class="tot-row">
          <span>Subtotal (Excl. GST)</span>
          <span>$${subtotalExGst.toFixed(2)}</span>
        </div>
        ${
          invoice.partsTotal > 0
            ? `<div class="tot-row" style="font-size:12.5px;color:#86868B;">
                <span>Materials / Parts Included</span>
                <span>$${invoice.partsTotal.toFixed(2)}</span>
              </div>`
            : ""
        }
        <div class="tot-row">
          <span>${isTaxInvoice ? "Total GST (10%)" : "GST"}</span>
          <span>$${invoice.gstTotal.toFixed(2)}</span>
        </div>
        <div class="tot-grand">
          <span>Total (AUD)</span>
          <span>$${invoice.total.toFixed(2)}</span>
        </div>
        ${
          isPaid
            ? `<div class="tot-row" style="margin-top:8px;margin-bottom:0;color:#1E9E49;font-weight:600;">
                <span>Amount Paid</span>
                <span>-$${invoice.total.toFixed(2)}</span>
              </div>`
            : ""
        }
        <div class="tot-balance">
          <span>Balance Due (AUD)</span>
          <span>$${balanceDue.toFixed(2)}</span>
        </div>
      </div>
    </div>

    <div class="ato-note">${escapeHtml(atoComplianceLine)}</div>

    ${
      hasBankInfo || invoice.notes
        ? `<div class="footer-grid">
            ${
              hasBankInfo
                ? `<div class="info-card">
                    <div class="section-label">How to Pay (Australian EFT / PayID)</div>
                    ${business.bankAccountName ? `<div><strong>Account Name:</strong> ${escapeHtml(business.bankAccountName)}</div>` : ""}
                    ${formattedBsb ? `<div><strong>BSB:</strong> ${escapeHtml(formattedBsb)}</div>` : ""}
                    ${business.bankAccountNumber ? `<div><strong>Account Number:</strong> ${escapeHtml(business.bankAccountNumber)}</div>` : ""}
                    ${business.payId ? `<div><strong>PayID:</strong> ${escapeHtml(business.payId)}</div>` : ""}
                    <div style="margin-top:4px;color:#515154;font-size:13px;">Payment Reference: <strong>${escapeHtml(invoice.invoiceNumber)}</strong></div>
                  </div>`
                : ""
            }
            ${
              invoice.notes
                ? `<div class="info-card">
                    <div class="section-label">Notes &amp; Payment Terms</div>
                    <div style="white-space:pre-line;">${escapeHtml(invoice.notes)}</div>
                  </div>`
                : ""
            }
          </div>`
        : ""
    }
  </div>
  ${autoPrintScript}
</body>
</html>`;
}
