import { jsPDF } from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";
import { productDescription, type PackRequestInput, type PickupSlipInput, type StockReportInput } from "./pickupSlip";
import { cartonsForSku, pickupConfig } from "./pickupConfig";

const MARGIN = 40;

// Horizontal Goldsure logo aspect ratio (2401 x 921).
const LOGO_RATIO = 2401 / 921;

function lastY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

// Draw the horizontal logo (or a bold "Goldsure" fallback) at the top-left and
// return the y coordinate just below it.
function drawLogoHeader(doc: jsPDF, logo: string | undefined, width = 150): number {
  if (logo) {
    const height = width / LOGO_RATIO;
    doc.addImage(logo, "PNG", MARGIN, MARGIN - 8, width, height, undefined, "FAST");
    return MARGIN - 8 + height;
  }
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(31, 122, 68);
  doc.text("Goldsure", MARGIN, MARGIN + 8);
  doc.setTextColor(0, 0, 0);
  return MARGIN + 16;
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
export function buildReportPdfBase64(input: StockReportInput, logo?: string): string {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const headerBottom = drawLogoHeader(doc, logo);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(`Stock Report - ${input.electricianName}`, MARGIN, headerBottom + 24);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 90);
  doc.text(`As of ${input.asOfDate}`, MARGIN, headerBottom + 42);

  let y = headerBottom + 68;
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

// The pack request to Specific Freight as a PDF base64 string. Generic: shows
// the items to pack, the request type and reference, no customer details.
export function buildPackPdfBase64(input: PackRequestInput, logo?: string): string {
  const { company, freight } = pickupConfig;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const headerBottom = drawLogoHeader(doc, logo);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Stock Pickup Request", MARGIN, headerBottom + 24);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 90);
  doc.text(`Date of request ${input.requestDate}`, MARGIN, headerBottom + 40);

  autoTable(doc, {
    startY: headerBottom + 56,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4, lineColor: [120, 120, 120], lineWidth: 0.5, textColor: 20 },
    margin: { left: MARGIN, right: MARGIN },
    columnStyles: { 0: { cellWidth: 150, fontStyle: "bold" } },
    body: [
      ["Reference", input.reference || "Not provided"],
      ["Warehouse", `${freight.name} - ${freight.address}`],
      ["Requested by", `${company.requestedBy}, Goldsure`],
    ] as RowInput[],
  });

  autoTable(doc, {
    startY: lastY(doc) + 8,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4, lineColor: [120, 120, 120], lineWidth: 0.5, textColor: 20 },
    headStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold" },
    margin: { left: MARGIN, right: MARGIN },
    head: [["Product to pack", "Quantity"]],
    body: input.lines.map((line) => [
      productDescription(line.product, line.sku),
      { content: String(line.quantity), styles: { halign: "center" } },
    ]) as RowInput[],
  });

  let y = lastY(doc) + 24;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(
    `Contact ${company.requestedBy.split(" ")[0]} on ${company.phone} or ${company.email} for any clarifications.`,
    MARGIN,
    y,
  );

  const dataUri = doc.output("datauristring");
  return dataUri.slice(dataUri.indexOf(",") + 1);
}

// The full Stock Release Request (pickup slip) as a PDF base64 string.
export function buildPickupPdfBase64(input: PickupSlipInput, logo?: string): string {
  const { company, freight } = pickupConfig;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const yellow: [number, number, number] = [255, 241, 0];
  const grey: [number, number, number] = [243, 244, 246];
  const gridStyles = {
    fontSize: 9,
    cellPadding: 4,
    lineColor: [120, 120, 120] as [number, number, number],
    lineWidth: 0.5,
    textColor: 20,
    valign: "middle" as const,
  };

  const headerBottom = drawLogoHeader(doc, logo);

  // Header info block (title + dates + warehouse).
  autoTable(doc, {
    startY: headerBottom + 12,
    theme: "grid",
    styles: gridStyles,
    margin: { left: MARGIN, right: MARGIN },
    columnStyles: { 0: { cellWidth: 360, fontStyle: "bold" } },
    body: [
      [{ content: `${company.name.toUpperCase()} - Stock Release Request`, colSpan: 2, styles: { halign: "center", fontStyle: "bold" } }],
      ["Date of Request", { content: input.requestDate, styles: { fillColor: yellow, fontStyle: "bold" } }],
      ["Requested Release Date", { content: input.releaseDate, styles: { fillColor: yellow, fontStyle: "bold" } }],
      ["Warehouse", `${freight.name} - ${freight.address}  Phone: ${freight.phone}`],
    ] as RowInput[],
  });

  // Product table with merged recipient columns.
  const productBody: RowInput[] = input.lines.map((line, index) => {
    const row: RowInput = [
      productDescription(line.productName, line.sku),
      { content: String(line.quantity), styles: { halign: "center" } },
      { content: cartonsForSku(line.sku, line.quantity) || "-", styles: { halign: "center" } },
      { content: line.mode, styles: { halign: "center" } },
    ] as RowInput;
    if (index === 0) {
      const merged = { rowSpan: input.lines.length, styles: { valign: "middle" as const, halign: "center" as const } };
      (row as unknown[]).push(
        { content: input.recipientName, ...merged },
        { content: input.recipientAddress, ...merged },
        { content: input.recipientPhone, ...merged },
      );
    }
    return row;
  });

  autoTable(doc, {
    startY: lastY(doc),
    theme: "grid",
    styles: gridStyles,
    headStyles: { fillColor: grey, textColor: 20, fontStyle: "bold", halign: "center" },
    margin: { left: MARGIN, right: MARGIN },
    head: [["Product Description", "Quantity", "No. Of Cartons", "Delivery or Pickup", "Recipient Name", "Delivery Address", "Contact Number"]],
    body: productBody,
  });

  let y = lastY(doc) + 24;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  const firstName = company.requestedBy.split(" ")[0];
  const footerLines = [
    `Requested By: ${company.requestedBy}`,
    `Company: ${company.name}`,
    "",
    "Notes:",
    ...(input.notes ? input.notes.split("\n") : []),
    `Contact ${firstName} for any clarifications on ${company.phone} or ${company.email}`,
  ];
  footerLines.forEach((line) => {
    doc.text(line, MARGIN, y);
    y += 15;
  });

  const dataUri = doc.output("datauristring");
  return dataUri.slice(dataUri.indexOf(",") + 1);
}
