// Fixed business details for the Stock Release Request (pickup slip).
// Edit these here — they are not stored in the database.

export const pickupConfig = {
  company: {
    name: "Goldsure PTY LTD",
    requestedBy: "Vignesh Kirubakaran",
    phone: "0451 898 761",
    email: "vignesh@goldsure.com.au",
  },
  // The warehouse the pickup slip is sent to.
  freight: {
    name: "Specific Freight PTY LTD",
    address: "5/50 Parker Court, Pinkenba QLD 4008",
    phone: "+61 7 3260 2200",
    // Primary recipient(s) of the email.
    to: ["damiend@specificfreight.com.au"],
    // Always CC these.
    cc: ["mel3pl@specificfreight.com.au"],
  },
  // Units per carton, used to work out "No. Of Cartons" from the quantity.
  cartonSizeBySku: {
    "RH638-AC-RF": 48,
    "RH638-B-RF": 48,
    RHRC2: 50,
  } as Record<string, number>,
  logoPath: "/assets/goldsure-logo.png",
};

export function cartonsForSku(sku: string | null, quantity: number): string {
  const size = sku ? pickupConfig.cartonSizeBySku[sku] : undefined;
  if (!size || size <= 0) return "";
  const cartons = quantity / size;
  return Number.isInteger(cartons) ? String(cartons) : cartons.toFixed(2).replace(/\.?0+$/, "");
}
