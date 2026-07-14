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

export function buildPickupSlipHtml(input: PickupSlipInput): string {
  const { company, freight } = pickupConfig;
  const rows = input.lines.length;
  const logo = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" alt="Goldsure" style="height:56px;width:auto;margin-bottom:14px;" />`
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

  return `<!doctype html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#111827;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:900px;margin:0 auto;">
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

    <div style="margin-top:22px;font-size:13px;line-height:1.6;">
      <div>Requested By: ${escapeHtml(company.requestedBy)}</div>
      <div>Company: ${escapeHtml(company.name)}</div>
      <div style="margin-top:14px;">Notes:</div>
      ${notesLines ? `<div>${notesLines}</div>` : ""}
      <div>Contact ${escapeHtml(company.requestedBy.split(" ")[0])} for any clarifications on ${escapeHtml(company.phone)} or ${escapeHtml(company.email)}</div>
    </div>
  </div>
</body>
</html>`;
}

const cell = "border:1px solid #333;padding:6px 8px;";
const head = "border:1px solid #333;padding:6px 8px;text-align:center;font-weight:bold;background:#f3f4f6;";
