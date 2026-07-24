import type { WarrantyJobStatus } from "./types";
import { BUSINESS_TIME_ZONE } from "./dateTime";

// Human labels for warranty job statuses. "completed" reads as Replaced,
// "cancelled" reads as Closed.
export const statusLabels: Record<WarrantyJobStatus, string> = {
  open: "Open",
  posted: "Posted",
  completed: "Replaced",
  cancelled: "Closed",
};

// Class suffix used to colour a status chip / select.
export const statusChipClass: Record<WarrantyJobStatus, string> = {
  open: "status-open",
  posted: "status-posted",
  completed: "status-replaced",
  cancelled: "status-closed",
};

// Class suffix used to tint a whole job card by status.
export const statusCardClass: Record<WarrantyJobStatus, string> = {
  open: "card-open",
  posted: "card-posted",
  completed: "card-replaced",
  cancelled: "card-closed",
};

export const statusOrder: WarrantyJobStatus[] = ["open", "posted", "completed", "cancelled"];

// Format an ISO timestamp as a readable Sydney date + time.
export function formatJobDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-AU", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
