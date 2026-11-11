import type { BusinessProfile, InvoiceRecord } from "./src/types";

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
  const isTaxInvoice = Boolean(business.businessAbn?.trim()) || invoice.gstTotal > 0;
  const docTitle = isTaxInvoice ? "TAX INVOICE" : "INVOICE";
  const isPaid = invoice.status === "Paid";
  const showPartsCol = invoice.items.some((item) => (item.parts || 0) > 0);
  const subtotalExGst = Math.max(0, Math.round((invoice.total - invoice.gstTotal) * 100) / 100);
  const hasBankInfo = Boolean(
    business.bankAccountName?.trim() ||
      business.bankBsb?.trim() ||
      business.bankAccountNumber?.trim()
  );

  const toolbarHtml = options.forPdf
    ? ""
    : `
    <div class="no-print toolbar">
      <div class="toolbar-inner">
        <span style="font-weight:600;color:#1D1D1F;">${escapeHtml(invoice.invoiceNumber)}</span>
        <div style="display:flex;gap:10px;">
          <button onclick="window.print()" class="print-btn">Print / Save as PDF</button>
        </div>
      </div>
    </div>`;

  const autoPrintScript =
    !options.forPdf && options.autoPrint
      ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(invoice.invoiceNumber)} - ${escapeHtml(business.businessName || "Invoice")}</title>
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
      background: rgba(255,255,255,0.9);
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
    }
    .print-btn {
      background: #007AFF;
      color: #FFFFFF;
      border: none;
      border-radius: 12px;
      padding: 10px 20px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    .sheet {
      max-width: 820px;
      margin: ${options.forPdf ? "0 auto" : "28px auto 48px"};
      background: #FFFFFF;
      border-radius: ${options.forPdf ? "0" : "24px"};
      padding: ${options.forPdf ? "16px 20px" : "48px"};
      box-shadow: ${options.forPdf ? "none" : "0 4px 24px rgba(0,0,0,0.06)"};
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      padding-bottom: 28px;
      border-bottom: 2px solid #F2F2F7;
    }
    .biz-name {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #1D1D1F;
      margin-bottom: 6px;
    }
    .biz-meta {
      font-size: 14px;
      color: #515154;
      line-height: 1.6;
    }
    .inv-badge-col {
      text-align: right;
    }
    .inv-title {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: #1D1D1F;
    }
    .inv-num {
      font-size: 17px;
      font-weight: 700;
      color: #007AFF;
      margin-top: 2px;
    }
    .status-pill {
      display: inline-block;
      margin-top: 10px;
      padding: 5px 14px;
      border-radius: 999px;
      font-size: 13px;
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
      gap: 24px;
      margin: 28px 0;
    }
    .bill-to {
      flex: 1;
      background: #FAFAFC;
      border: 1px solid #ECECEF;
      border-radius: 16px;
      padding: 18px 20px;
    }
    .section-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #86868B;
      margin-bottom: 6px;
    }
    .client-name {
      font-size: 19px;
      font-weight: 700;
      color: #1D1D1F;
    }
    .client-details {
      font-size: 14px;
      color: #515154;
      margin-top: 4px;
      white-space: pre-line;
    }
    .dates-box {
      min-width: 230px;
      background: #FAFAFC;
      border: 1px solid #ECECEF;
      border-radius: 16px;
      padding: 18px 20px;
    }
    .date-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .date-row:last-child { margin-bottom: 0; }
    .date-label { color: #515154; font-weight: 500; }
    .date-val { color: #1D1D1F; font-weight: 700; font-variant-numeric: tabular-nums; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th {
      text-align: left;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #86868B;
      padding: 12px 14px;
      background: #F5F5F7;
      border-bottom: 1px solid #E5E5EA;
    }
    th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td {
      padding: 15px 14px;
      font-size: 15px;
      border-bottom: 1px solid #F2F2F7;
      color: #1D1D1F;
      vertical-align: top;
    }
    .totals-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: 24px;
    }
    .totals-box {
      width: 300px;
      background: #FAFAFC;
      border: 1px solid #ECECEF;
      border-radius: 16px;
      padding: 18px 20px;
    }
    .tot-row {
      display: flex;
      justify-content: space-between;
      font-size: 15px;
      color: #515154;
      margin-bottom: 8px;
      font-variant-numeric: tabular-nums;
    }
    .tot-grand {
      display: flex;
      justify-content: space-between;
      font-size: 21px;
      font-weight: 800;
      color: #1D1D1F;
      padding-top: 12px;
      margin-top: 10px;
      border-top: 2px solid #E5E5EA;
      font-variant-numeric: tabular-nums;
    }
    .footer-grid {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #ECECEF;
      display: grid;
      grid-template-columns: ${hasBankInfo && invoice.notes ? "1fr 1fr" : "1fr"};
      gap: 20px;
    }
    .info-card {
      background: #F5F5F7;
      border-radius: 14px;
      padding: 16px 18px;
      font-size: 14px;
      color: #1D1D1F;
    }
    @media print {
      body { background: #FFFFFF; }
      .no-print { display: none !important; }
      .sheet { margin: 0; padding: 12px; box-shadow: none; border-radius: 0; max-width: 100%; }
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
          ${business.businessAbn ? `<div><strong>ABN:</strong> ${escapeHtml(business.businessAbn)}</div>` : ""}
          ${business.businessAddress ? `<div>${escapeHtml(business.businessAddress)}</div>` : ""}
          ${business.businessPhone ? `<div><strong>Phone:</strong> ${escapeHtml(business.businessPhone)}</div>` : ""}
          ${business.businessEmail ? `<div><strong>Email:</strong> ${escapeHtml(business.businessEmail)}</div>` : ""}
        </div>
      </div>
      <div class="inv-badge-col">
        <div class="inv-title">${docTitle}</div>
        <div class="inv-num">${escapeHtml(invoice.invoiceNumber)}</div>
        <div class="status-pill">${isPaid ? "PAID" : "UNPAID"}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="bill-to">
        <div class="section-label">Bill To</div>
        <div class="client-name">${escapeHtml(invoice.clientName || "Customer")}</div>
        ${invoice.clientDetails ? `<div class="client-details">${escapeHtml(invoice.clientDetails)}</div>` : ""}
      </div>
      <div class="dates-box">
        <div class="date-row">
          <span class="date-label">Issue Date</span>
          <span class="date-val">${escapeHtml(invoice.issueDate)}</span>
        </div>
        <div class="date-row">
          <span class="date-label">Due Date</span>
          <span class="date-val">${escapeHtml(invoice.dueDate)}</span>
        </div>
        ${
          isPaid && invoice.paidDate
            ? `<div class="date-row">
                <span class="date-label">Paid Date</span>
                <span class="date-val" style="color:#1E9E49;">${escapeHtml(invoice.paidDate)}</span>
              </div>`
            : ""
        }
        ${
          isPaid && invoice.paymentMethod
            ? `<div class="date-row">
                <span class="date-label">Method</span>
                <span class="date-val">${escapeHtml(invoice.paymentMethod)}</span>
              </div>`
            : ""
        }
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:118px;">Date</th>
          <th>Description</th>
          ${showPartsCol ? `<th class="num" style="width:110px;">Parts</th>` : ""}
          <th class="num" style="width:100px;">GST</th>
          <th class="num" style="width:125px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${invoice.items
          .map(
            (item) => `
          <tr>
            <td style="color:#515154;font-variant-numeric:tabular-nums;">${escapeHtml(item.date || invoice.issueDate)}</td>
            <td style="font-weight:600;">${escapeHtml(item.description || "Service")}</td>
            ${showPartsCol ? `<td class="num">$${(item.parts || 0).toFixed(2)}</td>` : ""}
            <td class="num">$${(item.gst || 0).toFixed(2)}</td>
            <td class="num" style="font-weight:700;">$${(item.total || 0).toFixed(2)}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>

    <div class="totals-wrap">
      <div class="totals-box">
        <div class="tot-row">
          <span>Subtotal (excl. GST)</span>
          <span>$${subtotalExGst.toFixed(2)}</span>
        </div>
        ${
          invoice.partsTotal > 0
            ? `<div class="tot-row">
                <span>Parts Included</span>
                <span>$${invoice.partsTotal.toFixed(2)}</span>
              </div>`
            : ""
        }
        <div class="tot-row">
          <span>GST</span>
          <span>$${invoice.gstTotal.toFixed(2)}</span>
        </div>
        <div class="tot-grand">
          <span>Total AUD</span>
          <span>$${invoice.total.toFixed(2)}</span>
        </div>
      </div>
    </div>

    ${
      hasBankInfo || invoice.notes
        ? `<div class="footer-grid">
            ${
              hasBankInfo
                ? `<div class="info-card">
                    <div class="section-label">Payment Details (Bank Transfer)</div>
                    ${business.bankAccountName ? `<div><strong>Account Name:</strong> ${escapeHtml(business.bankAccountName)}</div>` : ""}
                    ${business.bankBsb ? `<div><strong>BSB:</strong> ${escapeHtml(business.bankBsb)}</div>` : ""}
                    ${business.bankAccountNumber ? `<div><strong>Account Number:</strong> ${escapeHtml(business.bankAccountNumber)}</div>` : ""}
                    <div style="margin-top:4px;color:#515154;font-size:13px;">Reference: <strong>${escapeHtml(invoice.invoiceNumber)}</strong></div>
                  </div>`
                : ""
            }
            ${
              invoice.notes
                ? `<div class="info-card">
                    <div class="section-label">Notes</div>
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
