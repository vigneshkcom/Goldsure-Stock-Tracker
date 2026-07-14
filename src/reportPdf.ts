import { jsPDF } from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";
import type { StockReportInput } from "./pickupSlip";

const MARGIN = 40;

function lastY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function section(doc: jsPDF, title: string, head: string[], rows: string[][], startY: number): number {
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(title, MARGIN, startY);
  const body: RowInput[] = rows.length ? rows : [[{ content: "None", colSpan: head.length }]];
  autoTable(doc, {
    startY: startY + 6,
    head: [head],
    body,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4, lineColor: [150, 150, 150], lineWidth: 0.5, textColor: 20 },
    headStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold" },
    margin: { left: MARGIN, right: MARGIN },
  });
  return lastY(doc);
}

// Build the full stock report as a PDF and return it as a base64 string
// (no data-URI prefix) suitable for a Resend attachment.
export function buildReportPdfBase64(input: StockReportInput): string {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(`Stock Report - ${input.electricianName}`, MARGIN, MARGIN + 6);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 90);
  doc.text(`As of ${input.asOfDate}`, MARGIN, MARGIN + 24);

  let y = MARGIN + 50;
  y = section(
    doc,
    "Stock On Hand Now",
    ["Product", "On hand (good)", "Faulty held"],
    input.remaining.map((row) => [row.product, String(row.good), String(row.faulty)]),
    y,
  );

  y = section(
    doc,
    "Received This Month",
    ["Date", "Type", "Product", "From", "Qty"],
    input.received.map((row) => [row.date, row.type, row.product, row.from || "-", String(row.qty)]),
    y + 26,
  );

  const installRows: string[][] = [];
  input.installsByWeek.forEach((week) =>
    week.items.forEach((item, index) => installRows.push([index === 0 ? week.week : "", item.product, String(item.qty)])),
  );
  y = section(doc, "Installed This Month", ["Week ending", "Product", "Installed"], installRows, y + 26);

  if (input.lost.length) {
    section(
      doc,
      "Stock Lost This Month",
      ["Date", "Product", "Qty", "Charged"],
      input.lost.map((row) => [row.date, row.product, String(row.qty), row.charged]),
      y + 26,
    );
  }

  const dataUri = doc.output("datauristring");
  return dataUri.slice(dataUri.indexOf(",") + 1);
}
