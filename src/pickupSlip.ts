import { cartonsForSku, pickupConfig } from "./pickupConfig";

export type PickupLine = {
  productName: string;
  sku: string | null;
  quantity: number;
  mode: string; // "Pickup" or "Delivery"
};

export type PickupSlipInput = {
  requestDate: string; // display string, e.g. 10.07.2026
  releaseDate: string; // display string
  recipientName: string;
  recipientAddress: string;
  recipientPhone: string;
  lines: PickupLine[];
  notes: string;
  logoUrl?: string; // absolute URL so it also works in email
  withFooter?: boolean; // Requested By / Company / Notes block (default true)
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Format an ISO date (yyyy-mm-dd) as dd.mm.yyyy to match the slip.
export function formatSlipDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

// Wrap inner HTML in a full document. A centered fixed-width table keeps the
// layout from stretching edge-to-edge in Outlook (which ignores max-width).
export function wrapDocument(innerHtml: string): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#ffffff;color:#111827;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="760" style="width:760px;max-width:760px;border-collapse:collapse;">
          <tr>
            <td style="font-family:Arial,Helvetica,sans-serif;color:#111827;">
              ${innerHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Turn a plain-text message into simple HTML paragraphs.
export function messageToHtml(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "";
  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;">${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<div style="margin-bottom:18px;">${paragraphs}</div>`;
}

// A plain-text email signature (no logo — data-URI images are blocked by Gmail).
export function buildSignatureHtml(): string {
  const { signature } = pickupConfig;
  return `
  <p style="margin:20px 0 0;font-size:14px;color:#111111;">Regards,</p>
  <div style="margin-top:6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#111111;">
    <span style="font-size:15px;font-weight:bold;">${escapeHtml(signature.name)}</span><br />
    <span style="color:#444444;">${escapeHtml(signature.title)}</span><br />
    <br />
    <strong>e:</strong> <a href="mailto:${escapeHtml(signature.email)}" style="color:#111111;">${escapeHtml(signature.email)}</a><br />
    <strong>p:</strong> ${escapeHtml(signature.phone)}<br />
    <strong>w:</strong> <a href="https://${escapeHtml(signature.web)}" style="color:#111111;">${escapeHtml(signature.web)}</a>
  </div>
  <p style="font-size:10px;color:#8a8a8a;line-height:1.45;max-width:840px;margin:18px 0 0;">CONFIDENTIAL EMAIL MESSAGE | This is a confidential message to be read only by the recipient named above. Information on this email, including any attachments, may contain information which is confidential. If you are not the named recipient you must not read, copy, use the email or any information on it, in any way. Any unauthorised use may be the subject of legal proceedings against you. Therefore, please contact the sender immediately by telephone, fax or email at the numbers above if you have received this message in error. It is requested that thereafter this email and any attachments thereto be destroyed.</p>
  <p style="font-size:11px;color:#2e7d32;margin:8px 0 0;">Please consider the environment before printing this email</p>`;
}

export function buildPickupSlipInner(input: PickupSlipInput): string {
  const { company, freight } = pickupConfig;
  const rows = input.lines.length;
  const logo = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" alt="Goldsure" height="48" style="height:48px;width:auto;margin-bottom:14px;" />`
    : "";

  const productRows = input.lines
    .map((line, index) => {
      const recipientCells =
        index === 0
          ? `
        <td rowspan="${rows}" style="${cell};text-align:center;vertical-align:middle;">${escapeHtml(input.recipientName)}</td>
        <td rowspan="${rows}" style="${cell};text-align:center;vertical-align:middle;">${escapeHtml(input.recipientAddress).replace(/\n/g, "<br/>")}</td>
        <td rowspan="${rows}" style="${cell};text-align:center;vertical-align:middle;">${escapeHtml(input.recipientPhone)}</td>`
          : "";
      return `
      <tr>
        <td style="${cell}"><strong>${escapeHtml(line.productName)}</strong>${line.sku ? `<br/>${escapeHtml(line.sku)}` : ""}</td>
        <td style="${cell};text-align:center;">${line.quantity.toLocaleString()}</td>
        <td style="${cell};text-align:center;">${cartonsForSku(line.sku, line.quantity) || "&mdash;"}</td>
        <td style="${cell};text-align:center;">${escapeHtml(line.mode)}</td>
        ${recipientCells}
      </tr>`;
    })
    .join("");

  const notesLines = input.notes
    ? input.notes
        .split("\n")
        .map((line) => escapeHtml(line))
        .join("<br/>")
    : "";

  return `
    ${logo}
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr>
        <td colspan="7" style="${cell};text-align:center;font-weight:bold;">${escapeHtml(company.name.toUpperCase())} &ndash; Stock Release Request</td>
      </tr>
      <tr>
        <td colspan="6" style="${cell}">Date of Request</td>
        <td style="${cell};background:#fff100;font-weight:bold;white-space:nowrap;">${escapeHtml(input.requestDate)}</td>
      </tr>
      <tr>
        <td colspan="6" style="${cell}">Requested Release Date:</td>
        <td style="${cell};background:#fff100;font-weight:bold;white-space:nowrap;">${escapeHtml(input.releaseDate)}</td>
      </tr>
      <tr>
        <td style="${cell}">Warehouse:</td>
        <td colspan="6" style="${cell}">${escapeHtml(freight.name)} - ${escapeHtml(freight.address)} Contact: Phone: ${escapeHtml(freight.phone)}</td>
      </tr>
      <tr>
        <th style="${head}">Product Description</th>
        <th style="${head}">Quantity</th>
        <th style="${head}">No. Of Cartons</th>
        <th style="${head}">Delivery or Pickup</th>
        <th style="${head}">Recipient Name</th>
        <th style="${head}">Delivery Address</th>
        <th style="${head}">Contact Number</th>
      </tr>
      ${productRows}
    </table>
    ${
      input.withFooter === false
        ? ""
        : `<div style="margin-top:22px;font-size:13px;line-height:1.6;">
      <div>Requested By: ${escapeHtml(company.requestedBy)}</div>
      <div>Company: ${escapeHtml(company.name)}</div>
      <div style="margin-top:14px;">Notes:</div>
      ${notesLines ? `<div>${notesLines}</div>` : ""}
      <div>Contact ${escapeHtml(company.requestedBy.split(" ")[0])} for any clarifications on ${escapeHtml(company.phone)} or ${escapeHtml(company.email)}</div>
    </div>`
    }`;
}

// Full standalone document (used for the print preview).
export function buildPickupSlipHtml(input: PickupSlipInput): string {
  return wrapDocument(buildPickupSlipInner(input));
}

export type StockReportInput = {
  electricianName: string;
  asOfDate: string;
  remaining: { product: string; good: number; faulty: number }[];
  received: { date: string; type: string; product: string; from: string; qty: number }[];
  installsByWeek: { week: string; items: { product: string; qty: number }[] }[];
  lost: { date: string; product: string; qty: number; charged: string }[];
  logoUrl?: string;
};

export type ReportEmailBodyInput = {
  asOfDate: string;
  weekEndingLabel: string;
  remaining: { product: string; good: number; faulty: number }[];
  installedThisWeek: { product: string; qty: number }[];
};

// The short email body: stock on hand and this week's installs. Full detail is
// in the attached PDF.
export function buildReportEmailBodyInner(input: ReportEmailBodyInput): string {
  const onHandRows = input.remaining
    .map(
      (row) =>
        `<tr><td style="${cell}">${escapeHtml(row.product)}</td><td style="${cell};text-align:center;">${row.good.toLocaleString()}</td></tr>`,
    )
    .join("");

  const installedRows = input.installedThisWeek.length
    ? input.installedThisWeek
        .map(
          (row) =>
            `<tr><td style="${cell}">${escapeHtml(row.product)}</td><td style="${cell};text-align:center;">${row.qty.toLocaleString()}</td></tr>`,
        )
        .join("")
    : "";

  return `
    <h2 style="font-size:1.05rem;margin:0 0 6px;">Stock on hand as of ${escapeHtml(input.asOfDate)}</h2>
    <table style="border-collapse:collapse;font-size:13px;min-width:320px;">
      <tr><th style="${head}">Product</th><th style="${head}">On hand</th></tr>
      ${onHandRows}
    </table>

    <h2 style="font-size:1.05rem;margin:20px 0 6px;">Installed &mdash; ${escapeHtml(input.weekEndingLabel)}</h2>
    ${
      input.installedThisWeek.length
        ? `<table style="border-collapse:collapse;font-size:13px;min-width:320px;">
      <tr><th style="${head}">Product</th><th style="${head}">Installed</th></tr>
      ${installedRows}
    </table>`
        : `<p style="font-size:13px;color:#555;margin:0;">Nothing installed this week.</p>`
    }

    <p style="font-size:13px;color:#555;margin:20px 0 0;">The full stock report is attached as a PDF.</p>`;
}

// Monthly stock statement emailed to an electrician.
export function buildStockReportInner(input: StockReportInput): string {
  const logo = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" alt="Goldsure" height="48" style="height:48px;width:auto;margin-bottom:14px;" />`
    : "";

  const remainingRows = input.remaining
    .map(
      (row) =>
        `<tr><td style="${cell}">${escapeHtml(row.product)}</td><td style="${cell};text-align:center;">${row.good.toLocaleString()}</td><td style="${cell};text-align:center;">${row.faulty.toLocaleString()}</td></tr>`,
    )
    .join("");

  const receivedRows = input.received.length
    ? input.received
        .map(
          (row) =>
            `<tr><td style="${cell}">${escapeHtml(row.date)}</td><td style="${cell}">${escapeHtml(row.type)}</td><td style="${cell}">${escapeHtml(row.product)}</td><td style="${cell}">${escapeHtml(row.from) || "&mdash;"}</td><td style="${cell};text-align:center;">${row.qty.toLocaleString()}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="5" style="${cell}">Nothing received this month.</td></tr>`;

  const installRows = input.installsByWeek.length
    ? input.installsByWeek
        .flatMap((week) =>
          week.items.map(
            (item, index) =>
              `<tr><td style="${cell}">${index === 0 ? escapeHtml(week.week) : ""}</td><td style="${cell}">${escapeHtml(item.product)}</td><td style="${cell};text-align:center;">${item.qty.toLocaleString()}</td></tr>`,
          ),
        )
        .join("")
    : `<tr><td colspan="3" style="${cell}">Nothing installed this month.</td></tr>`;

  const lostRows = input.lost.length
    ? input.lost
        .map(
          (row) =>
            `<tr><td style="${cell}">${escapeHtml(row.date)}</td><td style="${cell}">${escapeHtml(row.product)}</td><td style="${cell};text-align:center;">${row.qty.toLocaleString()}</td><td style="${cell}">${escapeHtml(row.charged)}</td></tr>`,
        )
        .join("")
    : "";

  return `
    ${logo}
    <h1 style="font-size:1.4rem;margin:0 0 4px;">Stock Report &mdash; ${escapeHtml(input.electricianName)}</h1>
    <p style="margin:0 0 18px;color:#444;">As of ${escapeHtml(input.asOfDate)}</p>

    <h2 style="font-size:1.05rem;margin:18px 0 6px;">Stock On Hand Now</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><th style="${head}">Product</th><th style="${head}">On hand (good)</th><th style="${head}">Faulty held</th></tr>
      ${remainingRows}
    </table>

    <h2 style="font-size:1.05rem;margin:18px 0 6px;">Received This Month</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><th style="${head}">Date</th><th style="${head}">Type</th><th style="${head}">Product</th><th style="${head}">From</th><th style="${head}">Qty</th></tr>
      ${receivedRows}
    </table>

    <h2 style="font-size:1.05rem;margin:18px 0 6px;">Installed This Month</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><th style="${head}">Week ending</th><th style="${head}">Product</th><th style="${head}">Installed</th></tr>
      ${installRows}
    </table>

    ${
      input.lost.length
        ? `<h2 style="font-size:1.05rem;margin:18px 0 6px;">Stock Lost This Month</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><th style="${head}">Date</th><th style="${head}">Product</th><th style="${head}">Qty</th><th style="${head}">Charged</th></tr>
      ${lostRows}
    </table>`
        : ""
    }`;
}

const cell = "border:1px solid #333;padding:6px 8px;";
const head = "border:1px solid #333;padding:6px 8px;text-align:center;font-weight:bold;background:#f3f4f6;";
