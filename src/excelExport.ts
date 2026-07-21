import ExcelJS, { type Worksheet } from "exceljs";
import { businessDateValue, businessWallClockDate, dateOnlyDate } from "./dateTime";
import type { Movement, ProductCondition, StockData, WarrantyJob } from "./types";

const MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const colours = {
  header: "FF1F7A44",
  headerText: "FFFFFFFF",
  stripe: "FFF1F3EF",
  border: "FFE4E7E0",
  title: "FF16211A",
  muted: "FF5F6A60",
};

type ExportRow = Record<string, string | number | boolean | Date | null>;
type ExportColumn = { header: string; key: string; width: number; numberFormat?: string };

function movementCondition(movement: Movement): ProductCondition {
  return movement.product_condition ?? "good";
}

function dateValue(value: string | null | undefined): Date | string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return dateOnlyDate(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : businessWallClockDate(date);
}

function calculateBalanceMap(data: StockData, condition: ProductCondition) {
  const balances = new Map<string, number>();
  const add = (holderId: string, productId: string, quantity: number) => {
    const key = `${holderId}:${productId}`;
    balances.set(key, (balances.get(key) ?? 0) + quantity);
  };

  data.movements.forEach((movement) => {
    if (movementCondition(movement) !== condition) return;
    if (movement.to_holder_id) add(movement.to_holder_id, movement.product_id, movement.quantity);
    if (movement.from_holder_id) add(movement.from_holder_id, movement.product_id, -movement.quantity);
  });

  return balances;
}

function jobMovements(job: WarrantyJob, movements: Movement[]) {
  return movements.filter(
    (movement) => movement.warranty_job_id === job.id || (!movement.warranty_job_id && movement.job_number === job.job_number),
  );
}

function sumJobMovements(job: WarrantyJob, movements: Movement[], movementType: Movement["movement_type"]) {
  return jobMovements(job, movements)
    .filter((movement) => movement.movement_type === movementType)
    .reduce((total, movement) => total + movement.quantity, 0);
}

function styleSheet(worksheet: Worksheet, columns: ExportColumn[]) {
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.properties.defaultRowHeight = 20;
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  const header = worksheet.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: colours.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colours.header } };
    cell.alignment = { vertical: "middle" };
  });

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colours.stripe } };
      }
      cell.border = { bottom: { style: "thin", color: { argb: colours.border } } };
      cell.alignment = { ...cell.alignment, vertical: "top" };
    });
  });

  columns.forEach((column) => {
    if (column.numberFormat) worksheet.getColumn(column.key).numFmt = column.numberFormat;
  });
}

function addDataSheet(workbook: ExcelJS.Workbook, name: string, columns: ExportColumn[], rows: ExportRow[]) {
  const worksheet = workbook.addWorksheet(name, { views: [{ showGridLines: false }] });
  worksheet.columns = columns;
  worksheet.addRows(rows);
  styleSheet(worksheet, columns);
  return worksheet;
}

export function buildStockTrackerWorkbook(data: StockData, exportedAt = new Date()) {
  const workbook = new ExcelJS.Workbook();
  const displayedExportedAt = businessWallClockDate(exportedAt);
  workbook.creator = "Goldsure Stock Tracker";
  workbook.company = "Goldsure";
  workbook.created = exportedAt;
  workbook.modified = exportedAt;

  const productsById = new Map(data.products.map((product) => [product.id, product]));
  const holdersById = new Map(data.holders.map((holder) => [holder.id, holder]));
  const jobsById = new Map(data.warrantyJobs.map((job) => [job.id, job]));
  const goodBalances = calculateBalanceMap(data, "good");
  const faultyBalances = calculateBalanceMap(data, "faulty");
  const balance = (map: Map<string, number>, holderId: string, productId: string) => map.get(`${holderId}:${productId}`) ?? 0;

  const dashboardHolders = data.holders.filter(
    (holder) => holder.active && (holder.holder_type === "warehouse" || holder.holder_type === "technician"),
  );
  const dashboardProducts = data.products.filter((product) => product.active);
  const totalGood = dashboardProducts.reduce(
    (total, product) =>
      total + dashboardHolders.reduce((holderTotal, holder) => holderTotal + balance(goodBalances, holder.id, product.id), 0),
    0,
  );
  const specificFreight = data.holders.find(
    (holder) => holder.active && holder.holder_type === "warehouse" && holder.name.toLowerCase().includes("specific freight"),
  );
  const specificFreightTotals = ["RH638-AC-RF", "RH638-B-RF", "RHRC2"].map((sku) => {
    const product = dashboardProducts.find((item) => `${item.sku ?? ""} ${item.name}`.toUpperCase().includes(sku));
    return {
      sku,
      quantity: specificFreight && product ? balance(goodBalances, specificFreight.id, product.id) : 0,
    };
  });

  const overview = workbook.addWorksheet("Overview", { views: [{ showGridLines: false }] });
  overview.columns = [{ width: 30 }, { width: 24 }, { width: 18 }];
  overview.getCell("A1").value = "Goldsure Stock Tracker Export";
  overview.getCell("A1").font = { bold: true, size: 18, color: { argb: colours.title } };
  overview.mergeCells("A1:C1");
  overview.getCell("A2").value = "Exported at (Sydney time)";
  overview.getCell("B2").value = displayedExportedAt;
  overview.getCell("B2").numFmt = "dd mmm yyyy hh:mm";
  overview.getCell("A4").value = "Dashboard metric";
  overview.getCell("B4").value = "Location";
  overview.getCell("C4").value = "Quantity";
  overview.getRow(4).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: colours.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colours.header } };
  });
  overview.addRows([
    ["Good Stock", "All locations", totalGood],
    ...specificFreightTotals.map((item) => [item.sku, "Specific Freight", item.quantity]),
    [],
    ["Data included", "Records"],
    ["Products", data.products.length],
    ["Holders", data.holders.length],
    ["Movements", data.movements.length],
    ["Warranty jobs", data.warrantyJobs.length],
    [],
    ["This workbook is a point-in-time export of all data loaded in the Stock Tracker."],
  ]);
  overview.getRow(10).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: colours.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colours.header } };
  });
  overview.getColumn("C").numFmt = "#,##0";
  overview.getCell("A16").font = { italic: true, color: { argb: colours.muted } };
  overview.getCell("A16").alignment = { wrapText: true, vertical: "top" };
  overview.getRow(16).height = 32;
  overview.mergeCells("A16:C16");

  const currentStockRows = data.holders.flatMap((holder) =>
    data.products.map((product) => {
      const good = balance(goodBalances, holder.id, product.id);
      const faulty = balance(faultyBalances, holder.id, product.id);
      return {
        holder: holder.name,
        holderType: holder.holder_type,
        holderActive: holder.active ? "Yes" : "No",
        product: product.name,
        sku: product.sku,
        productActive: product.active ? "Yes" : "No",
        goodQuantity: good,
        faultyQuantity: faulty,
        totalQuantity: good + faulty,
      };
    }),
  );
  addDataSheet(
    workbook,
    "Current Stock",
    [
      { header: "Holder", key: "holder", width: 28 },
      { header: "Holder Type", key: "holderType", width: 16 },
      { header: "Holder Active", key: "holderActive", width: 14 },
      { header: "Product", key: "product", width: 34 },
      { header: "SKU", key: "sku", width: 18 },
      { header: "Product Active", key: "productActive", width: 14 },
      { header: "Good Quantity", key: "goodQuantity", width: 16, numberFormat: "#,##0" },
      { header: "Faulty Quantity", key: "faultyQuantity", width: 16, numberFormat: "#,##0" },
      { header: "Total Quantity", key: "totalQuantity", width: 16, numberFormat: "#,##0" },
    ],
    currentStockRows,
  );

  addDataSheet(
    workbook,
    "Movements",
    [
      { header: "Movement Date", key: "movementDate", width: 16, numberFormat: "dd mmm yyyy" },
      { header: "Movement Type", key: "movementType", width: 18 },
      { header: "Condition", key: "condition", width: 12 },
      { header: "Product", key: "product", width: 34 },
      { header: "SKU", key: "sku", width: 18 },
      { header: "Quantity", key: "quantity", width: 12, numberFormat: "#,##0" },
      { header: "From Holder", key: "fromHolder", width: 28 },
      { header: "To Holder", key: "toHolder", width: 28 },
      { header: "Warranty Job", key: "warrantyJob", width: 18 },
      { header: "Job Number", key: "jobNumber", width: 16 },
      { header: "Customer", key: "customer", width: 24 },
      { header: "Reference", key: "reference", width: 22 },
      { header: "Tracking", key: "tracking", width: 22 },
      { header: "Notes", key: "notes", width: 36 },
      { header: "Is Loss", key: "isLoss", width: 12 },
      { header: "Charged", key: "charged", width: 12 },
      { header: "Charge Amount", key: "chargeAmount", width: 16, numberFormat: "$#,##0.00" },
      { header: "Movement ID", key: "movementId", width: 38 },
      { header: "Created At", key: "createdAt", width: 22, numberFormat: "dd mmm yyyy hh:mm" },
    ],
    [...data.movements]
      .sort((a, b) => b.movement_date.localeCompare(a.movement_date) || (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .map((movement) => ({
        movementDate: dateValue(movement.movement_date),
        movementType: movement.movement_type,
        condition: movementCondition(movement),
        product: productsById.get(movement.product_id)?.name ?? "Unknown product",
        sku: productsById.get(movement.product_id)?.sku ?? null,
        quantity: movement.quantity,
        fromHolder: movement.from_holder_id ? holdersById.get(movement.from_holder_id)?.name ?? "Unknown holder" : null,
        toHolder: movement.to_holder_id ? holdersById.get(movement.to_holder_id)?.name ?? "Unknown holder" : null,
        warrantyJob: movement.warranty_job_id ? jobsById.get(movement.warranty_job_id)?.job_number ?? null : null,
        jobNumber: movement.job_number ?? null,
        customer: movement.customer_name ?? null,
        reference: movement.reference,
        tracking: movement.tracking,
        notes: movement.notes,
        isLoss: movement.is_loss ? "Yes" : "No",
        charged: movement.charged == null ? null : movement.charged ? "Yes" : "No",
        chargeAmount: movement.charge_amount ?? null,
        movementId: movement.id,
        createdAt: dateValue(movement.created_at),
      })),
  );

  addDataSheet(
    workbook,
    "Warranty Jobs",
    [
      { header: "Job Number", key: "jobNumber", width: 18 },
      { header: "Job Type", key: "jobType", width: 14 },
      { header: "Customer", key: "customer", width: 26 },
      { header: "Phone", key: "phone", width: 18 },
      { header: "Address", key: "address", width: 38 },
      { header: "Status", key: "status", width: 14 },
      { header: "Replacement Posted", key: "replacementPosted", width: 20, numberFormat: "#,##0" },
      { header: "Faulty Collected", key: "faultyCollected", width: 18, numberFormat: "#,##0" },
      { header: "Notes", key: "notes", width: 36 },
      { header: "Job ID", key: "jobId", width: 38 },
      { header: "Created At", key: "createdAt", width: 22, numberFormat: "dd mmm yyyy hh:mm" },
      { header: "Updated At", key: "updatedAt", width: 22, numberFormat: "dd mmm yyyy hh:mm" },
    ],
    [...data.warrantyJobs]
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .map((job) => ({
        jobNumber: job.job_number,
        jobType: job.job_type ?? "warranty",
        customer: job.customer_name,
        phone: job.customer_phone,
        address: job.customer_address,
        status: job.status,
        replacementPosted: sumJobMovements(job, data.movements, "customer_post"),
        faultyCollected: sumJobMovements(job, data.movements, "faulty_collect"),
        notes: job.notes,
        jobId: job.id,
        createdAt: dateValue(job.created_at),
        updatedAt: dateValue(job.updated_at),
      })),
  );

  addDataSheet(
    workbook,
    "Products",
    [
      { header: "Product", key: "product", width: 34 },
      { header: "SKU", key: "sku", width: 18 },
      { header: "Active", key: "active", width: 12 },
      { header: "Product ID", key: "productId", width: 38 },
      { header: "Created At", key: "createdAt", width: 22, numberFormat: "dd mmm yyyy hh:mm" },
    ],
    data.products.map((product) => ({
      product: product.name,
      sku: product.sku,
      active: product.active ? "Yes" : "No",
      productId: product.id,
      createdAt: dateValue(product.created_at),
    })),
  );

  addDataSheet(
    workbook,
    "Holders",
    [
      { header: "Holder", key: "holder", width: 28 },
      { header: "Type", key: "type", width: 16 },
      { header: "Active", key: "active", width: 12 },
      { header: "Phone", key: "phone", width: 18 },
      { header: "Email", key: "email", width: 28 },
      { header: "Address", key: "address", width: 38 },
      { header: "Holder ID", key: "holderId", width: 38 },
      { header: "Created At", key: "createdAt", width: 22, numberFormat: "dd mmm yyyy hh:mm" },
    ],
    data.holders.map((holder) => ({
      holder: holder.name,
      type: holder.holder_type,
      active: holder.active ? "Yes" : "No",
      phone: holder.phone ?? null,
      email: holder.email ?? null,
      address: holder.address ?? null,
      holderId: holder.id,
      createdAt: dateValue(holder.created_at),
    })),
  );

  return workbook;
}

export async function downloadStockTrackerExcel(data: StockData) {
  const workbook = buildStockTrackerWorkbook(data);
  const output = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(output)], { type: MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Goldsure-Stock-Tracker-${businessDateValue()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
