import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Cloud,
  Database,
  DownloadCloud,
  Factory,
  PackageCheck,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { workbookSeed } from "./data/seed";
import { supabase, supabaseConfigured } from "./lib/supabase";
import type {
  BalanceRow,
  Holder,
  HolderType,
  Movement,
  MovementType,
  Product,
  ProductCondition,
  StockData,
  WarrantyJob,
  WarrantyJobStatus,
} from "./types";

const LOCAL_STORAGE_KEY = "stock-tracker-data-v1";

const generalMovementTypes: MovementType[] = ["opening", "receive", "issue", "return", "install", "adjustment"];

const movementLabels: Record<MovementType, string> = {
  opening: "Opening",
  receive: "Receive",
  issue: "Issue",
  return: "Return",
  install: "Install",
  customer_post: "Post to customer",
  faulty_collect: "Faulty collected",
  adjustment: "Adjustment",
};

// Plain-English action names and explanations for the movement picker,
// so it is obvious what each option does before you save it.
const movementActionLabels: Record<MovementType, string> = {
  opening: "Set opening count",
  receive: "Receive new stock",
  issue: "Send to electrician",
  return: "Return to warehouse",
  install: "Install / use on job",
  customer_post: "Post to customer",
  faulty_collect: "Faulty collected",
  adjustment: "Adjust count",
};

const movementDescriptions: Record<MovementType, string> = {
  opening: "Set a starting stock count for a holder. Nothing is taken from anywhere else.",
  receive: "New stock has arrived into a warehouse.",
  issue: "Move stock from a warehouse out to an electrician.",
  return: "An electrician sends stock back to a warehouse.",
  install: "Stock is installed on a job and permanently leaves the electrician.",
  customer_post: "Replacement stock posted to a customer (managed on the Warranty tab).",
  faulty_collect: "A faulty unit is collected and held by the electrician (Warranty tab).",
  adjustment: "Manually correct a count up or down (e.g. stocktake, loss, found stock).",
};

const movementTone: Record<MovementType, string> = {
  opening: "neutral",
  receive: "positive",
  issue: "info",
  return: "warning",
  install: "negative",
  customer_post: "info",
  faulty_collect: "warning",
  adjustment: "neutral",
};

const conditionLabels: Record<ProductCondition, string> = {
  good: "Good",
  faulty: "Faulty",
};

const statusLabels: Record<WarrantyJobStatus, string> = {
  open: "Open",
  posted: "Posted",
  completed: "Completed",
  cancelled: "Cancelled",
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyData: StockData = {
  products: [],
  holders: [],
  movements: [],
  warrantyJobs: [],
};

function getMovementCondition(movement: Movement): ProductCondition {
  return movement.product_condition ?? "good";
}

function normalizeData(value: Partial<StockData> | null | undefined): StockData {
  return {
    products: value?.products ?? [],
    holders: value?.holders ?? [],
    movements: (value?.movements ?? []).map((movement) => ({
      ...movement,
      product_condition: movement.product_condition ?? "good",
      warranty_job_id: movement.warranty_job_id ?? null,
      job_number: movement.job_number ?? null,
      customer_name: movement.customer_name ?? null,
    })),
    warrantyJobs: value?.warrantyJobs ?? [],
  };
}

function cloneLocalSeed(): StockData {
  return normalizeData({
    products: workbookSeed.products.map((product) => ({ ...product })),
    holders: workbookSeed.holders.map((holder) => ({ ...holder })),
    movements: workbookSeed.movements.map((movement) => ({ ...movement, product_condition: "good" })),
    warrantyJobs: [],
  });
}

function createRemoteSeed(): StockData {
  const productMap = new Map<string, string>();
  const holderMap = new Map<string, string>();

  const products = workbookSeed.products.map((product) => {
    const id = crypto.randomUUID();
    productMap.set(product.id, id);
    return { ...product, id };
  });

  const holders = workbookSeed.holders.map((holder) => {
    const id = crypto.randomUUID();
    holderMap.set(holder.id, id);
    return { ...holder, id };
  });

  const movements = workbookSeed.movements.map((movement) => ({
    ...movement,
    id: crypto.randomUUID(),
    product_condition: "good" as ProductCondition,
    product_id: productMap.get(movement.product_id)!,
    from_holder_id: movement.from_holder_id ? holderMap.get(movement.from_holder_id)! : null,
    to_holder_id: movement.to_holder_id ? holderMap.get(movement.to_holder_id)! : null,
    warranty_job_id: null,
    job_number: null,
    customer_name: null,
  }));

  return { products, holders, movements, warrantyJobs: [] };
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function calculateBalances(movements: Movement[], condition: ProductCondition): BalanceRow[] {
  const balances = new Map<string, BalanceRow>();

  const add = (holderId: string, productId: string, quantity: number) => {
    const key = `${holderId}:${productId}`;
    const current = balances.get(key) ?? { holderId, productId, quantity: 0 };
    current.quantity += quantity;
    balances.set(key, current);
  };

  movements.forEach((movement) => {
    if (getMovementCondition(movement) !== condition) return;

    if (movement.to_holder_id) {
      add(movement.to_holder_id, movement.product_id, movement.quantity);
    }

    if (movement.from_holder_id) {
      add(movement.from_holder_id, movement.product_id, -movement.quantity);
    }
  });

  return Array.from(balances.values());
}

function getBalance(balanceMap: Map<string, number>, holderId: string | null, productId: string) {
  if (!holderId) return 0;
  return balanceMap.get(`${holderId}:${productId}`) ?? 0;
}

function sortHolders(holders: Holder[]) {
  const rank: Record<HolderType, number> = {
    warehouse: 0,
    technician: 1,
    other: 2,
  };

  return [...holders].sort((a, b) => rank[a.holder_type] - rank[b.holder_type] || a.name.localeCompare(b.name));
}

function loadLocalData(): StockData {
  const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!saved) {
    const seeded = cloneLocalSeed();
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  try {
    const parsed = normalizeData(JSON.parse(saved) as Partial<StockData>);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    const seeded = cloneLocalSeed();
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function saveLocalData(data: StockData) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalizeData(data)));
}

function getJobMovements(job: WarrantyJob, movements: Movement[]) {
  return movements.filter(
    (movement) => movement.warranty_job_id === job.id || (!movement.warranty_job_id && movement.job_number === job.job_number),
  );
}

function sumJobMovement(job: WarrantyJob, movements: Movement[], movementType: MovementType, condition?: ProductCondition) {
  return getJobMovements(job, movements)
    .filter((movement) => movement.movement_type === movementType)
    .filter((movement) => !condition || getMovementCondition(movement) === condition)
    .reduce((total, movement) => total + movement.quantity, 0);
}

function describeMovementProducts(job: WarrantyJob, movements: Movement[], products: Product[], movementType: MovementType) {
  const names = new Map(products.map((product) => [product.id, product.name]));
  const totals = new Map<string, number>();

  getJobMovements(job, movements)
    .filter((movement) => movement.movement_type === movementType)
    .forEach((movement) => {
      totals.set(movement.product_id, (totals.get(movement.product_id) ?? 0) + movement.quantity);
    });

  return Array.from(totals.entries())
    .map(([productId, quantity]) => `${quantity} ${names.get(productId) ?? "item"}`)
    .join(", ");
}

function sortWarrantyJobs(jobs: WarrantyJob[]) {
  return [...jobs].sort(
    (a, b) =>
      (b.created_at ?? "").localeCompare(a.created_at ?? "") ||
      b.job_number.localeCompare(a.job_number, undefined, { numeric: true }),
  );
}

type Tab = "dashboard" | "movements" | "warranty" | "setup";
type AdjustmentDirection = "in" | "out";

export default function App() {
  const [data, setData] = useState<StockData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localOnly, setLocalOnly] = useState(!supabaseConfigured);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [submitting, setSubmitting] = useState(false);

  const [movementDate, setMovementDate] = useState(today());
  const [movementType, setMovementType] = useState<MovementType>("issue");
  const [productId, setProductId] = useState("");
  const [fromHolderId, setFromHolderId] = useState("");
  const [toHolderId, setToHolderId] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<AdjustmentDirection>("in");
  const [quantity, setQuantity] = useState("1");
  const [reference, setReference] = useState("");
  const [tracking, setTracking] = useState("");
  const [notes, setNotes] = useState("");

  const [productName, setProductName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [holderName, setHolderName] = useState("");
  const [holderType, setHolderType] = useState<HolderType>("technician");
  const [searchTerm, setSearchTerm] = useState("");
  const [movementFilter, setMovementFilter] = useState<MovementType | "all">("all");

  const [selectedWarrantyJobId, setSelectedWarrantyJobId] = useState("");
  const [warrantySearch, setWarrantySearch] = useState("");
  const [warrantyJobNumber, setWarrantyJobNumber] = useState("");
  const [warrantyCustomerName, setWarrantyCustomerName] = useState("");
  const [warrantyCustomerPhone, setWarrantyCustomerPhone] = useState("");
  const [warrantyCustomerAddress, setWarrantyCustomerAddress] = useState("");
  const [warrantyJobNotes, setWarrantyJobNotes] = useState("");
  const [warrantyDate, setWarrantyDate] = useState(today());
  const [postProductId, setPostProductId] = useState("");
  const [postWarehouseId, setPostWarehouseId] = useState("");
  const [postQuantity, setPostQuantity] = useState("1");
  const [postReference, setPostReference] = useState("");
  const [postTracking, setPostTracking] = useState("");
  const [changeProductId, setChangeProductId] = useState("");
  const [changeTechnicianId, setChangeTechnicianId] = useState("");
  const [changeQuantity, setChangeQuantity] = useState("1");
  const [changeNotes, setChangeNotes] = useState("");

  const usingRemote = Boolean(supabase && !localOnly);

  const goodBalances = useMemo(() => calculateBalances(data.movements, "good"), [data.movements]);
  const faultyBalances = useMemo(() => calculateBalances(data.movements, "faulty"), [data.movements]);
  const goodBalanceMap = useMemo(() => {
    const map = new Map<string, number>();
    goodBalances.forEach((row) => map.set(`${row.holderId}:${row.productId}`, row.quantity));
    return map;
  }, [goodBalances]);
  const faultyBalanceMap = useMemo(() => {
    const map = new Map<string, number>();
    faultyBalances.forEach((row) => map.set(`${row.holderId}:${row.productId}`, row.quantity));
    return map;
  }, [faultyBalances]);

  const activeProducts = useMemo(() => data.products.filter((product) => product.active), [data.products]);
  const activeHolders = useMemo(() => sortHolders(data.holders.filter((holder) => holder.active)), [data.holders]);
  const warehouses = useMemo(
    () => activeHolders.filter((holder) => holder.holder_type === "warehouse"),
    [activeHolders],
  );
  const technicians = useMemo(
    () => activeHolders.filter((holder) => holder.holder_type === "technician"),
    [activeHolders],
  );
  const sortedWarrantyJobs = useMemo(() => sortWarrantyJobs(data.warrantyJobs), [data.warrantyJobs]);
  const selectedWarrantyJob = sortedWarrantyJobs.find((job) => job.id === selectedWarrantyJobId) ?? null;

  const visibleDashboardHolders = useMemo(
    () =>
      activeHolders.filter((holder) => {
        if (holder.holder_type !== "technician") return true;
        return activeProducts.some((product) => getBalance(goodBalanceMap, holder.id, product.id) !== 0);
      }),
    [activeHolders, activeProducts, goodBalanceMap],
  );

  const productTotals = useMemo(
    () =>
      activeProducts.map((product) => {
        const warehouseTotal = warehouses.reduce(
          (total, holder) => total + getBalance(goodBalanceMap, holder.id, product.id),
          0,
        );
        const fieldTotal = technicians.reduce(
          (total, holder) => total + getBalance(goodBalanceMap, holder.id, product.id),
          0,
        );
        return {
          product,
          warehouseTotal,
          fieldTotal,
          total: warehouseTotal + fieldTotal,
        };
      }),
    [activeProducts, goodBalanceMap, technicians, warehouses],
  );

  const totalStock = productTotals.reduce((total, row) => total + row.total, 0);
  const totalFaultyStock = faultyBalances.reduce((total, row) => total + row.quantity, 0);
  const latestMovement = useMemo(
    () =>
      [...data.movements].sort(
        (a, b) =>
          b.movement_date.localeCompare(a.movement_date) ||
          (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      )[0],
    [data.movements],
  );
  const negativeBalances = goodBalances.filter((row) => row.quantity < 0);

  const filteredMovements = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return [...data.movements]
      .sort(
        (a, b) =>
          b.movement_date.localeCompare(a.movement_date) ||
          (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      )
      .filter((movement) => movementFilter === "all" || movement.movement_type === movementFilter)
      .filter((movement) => {
        if (!term) return true;
        const product = data.products.find((item) => item.id === movement.product_id)?.name ?? "";
        const from = data.holders.find((item) => item.id === movement.from_holder_id)?.name ?? "";
        const to = data.holders.find((item) => item.id === movement.to_holder_id)?.name ?? "";
        const haystack = [
          product,
          from,
          to,
          movement.reference,
          movement.tracking,
          movement.notes,
          movement.job_number,
          movement.customer_name,
          conditionLabels[getMovementCondition(movement)],
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      });
  }, [data.holders, data.movements, data.products, movementFilter, searchTerm]);

  useEffect(() => {
    if (!supabase || localOnly) {
      setData(loadLocalData());
      setLoading(false);
      return;
    }

    void loadRemoteData();
  }, [localOnly]);

  useEffect(() => {
    if (!productId && activeProducts[0]) setProductId(activeProducts[0].id);
    if (!postProductId && activeProducts[0]) setPostProductId(activeProducts[0].id);
    if (!changeProductId && activeProducts[0]) setChangeProductId(activeProducts[0].id);
  }, [activeProducts, changeProductId, postProductId, productId]);

  useEffect(() => {
    if (!fromHolderId && warehouses[0]) setFromHolderId(warehouses[0].id);
    if (!toHolderId && technicians[0]) setToHolderId(technicians[0].id);
  }, [fromHolderId, technicians, toHolderId, warehouses]);

  useEffect(() => {
    const stockedWarehouse = warehouses.find((holder) => getBalance(goodBalanceMap, holder.id, postProductId) > 0);
    if (!postWarehouseId || getBalance(goodBalanceMap, postWarehouseId, postProductId) <= 0) {
      setPostWarehouseId(stockedWarehouse?.id ?? warehouses[0]?.id ?? "");
    }
  }, [goodBalanceMap, postProductId, postWarehouseId, warehouses]);

  useEffect(() => {
    const stockedTechnician = technicians.find((holder) => getBalance(goodBalanceMap, holder.id, changeProductId) > 0);
    if (!changeTechnicianId || getBalance(goodBalanceMap, changeTechnicianId, changeProductId) <= 0) {
      setChangeTechnicianId(stockedTechnician?.id ?? technicians[0]?.id ?? "");
    }
  }, [changeProductId, changeTechnicianId, goodBalanceMap, technicians]);

  useEffect(() => {
    if (!selectedWarrantyJobId && sortedWarrantyJobs[0]) {
      setSelectedWarrantyJobId(sortedWarrantyJobs[0].id);
    }
  }, [selectedWarrantyJobId, sortedWarrantyJobs]);

  async function loadRemoteData() {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const [productsResult, holdersResult, movementsResult, warrantyJobsResult] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("holders").select("*").order("holder_type").order("name"),
      supabase.from("stock_movements").select("*").order("movement_date", { ascending: false }),
      supabase.from("warranty_jobs").select("*").order("created_at", { ascending: false }),
    ]);

    const firstError = productsResult.error ?? holdersResult.error ?? movementsResult.error ?? warrantyJobsResult.error;
    if (firstError) {
      setError(`${firstError.message}. If this mentions warranty_jobs or product_condition, run the updated schema SQL in Supabase.`);
    } else {
      setData(
        normalizeData({
          products: (productsResult.data ?? []) as Product[],
          holders: (holdersResult.data ?? []) as Holder[],
          movements: (movementsResult.data ?? []) as Movement[],
          warrantyJobs: (warrantyJobsResult.data ?? []) as WarrantyJob[],
        }),
      );
    }

    setLoading(false);
  }

  function updateLocal(next: StockData | ((current: StockData) => StockData)) {
    setData((current) => {
      const normalized = normalizeData(typeof next === "function" ? next(current) : next);
      saveLocalData(normalized);
      return normalized;
    });
  }

  // Update in-memory state, persisting to browser storage only when not using the cloud.
  function updateLocalOrState(updater: (current: StockData) => StockData) {
    if (usingRemote) {
      setData((current) => normalizeData(updater(current)));
    } else {
      updateLocal(updater);
    }
  }

  async function saveProduct(product: Product) {
    if (usingRemote && supabase) {
      const { data: inserted, error: insertError } = await supabase
        .from("products")
        .insert({ ...product })
        .select("*")
        .single();
      if (insertError) throw insertError;
      setData((current) => normalizeData({ ...current, products: [...current.products, inserted as Product] }));
      return;
    }

    updateLocal((current) => ({ ...current, products: [...current.products, product] }));
  }

  async function saveHolder(holder: Holder) {
    if (usingRemote && supabase) {
      const { data: inserted, error: insertError } = await supabase
        .from("holders")
        .insert({ ...holder })
        .select("*")
        .single();
      if (insertError) throw insertError;
      setData((current) => normalizeData({ ...current, holders: [...current.holders, inserted as Holder] }));
      return;
    }

    updateLocal((current) => ({ ...current, holders: [...current.holders, holder] }));
  }

  async function saveWarrantyJob(job: WarrantyJob) {
    if (usingRemote && supabase) {
      const { data: inserted, error: insertError } = await supabase
        .from("warranty_jobs")
        .insert({ ...job })
        .select("*")
        .single();
      if (insertError) throw insertError;
      const saved = inserted as WarrantyJob;
      setData((current) => normalizeData({ ...current, warrantyJobs: [saved, ...current.warrantyJobs] }));
      return saved;
    }

    updateLocal((current) => ({ ...current, warrantyJobs: [job, ...current.warrantyJobs] }));
    return job;
  }

  async function updateWarrantyJob(jobId: string, updates: Partial<WarrantyJob>) {
    if (usingRemote && supabase) {
      const { data: updated, error: updateError } = await supabase
        .from("warranty_jobs")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", jobId)
        .select("*")
        .single();
      if (updateError) throw updateError;
      setData((current) =>
        normalizeData({
          ...current,
          warrantyJobs: current.warrantyJobs.map((job) => (job.id === jobId ? (updated as WarrantyJob) : job)),
        }),
      );
      return;
    }

    updateLocal((current) => ({
      ...current,
      warrantyJobs: current.warrantyJobs.map((job) =>
        job.id === jobId ? { ...job, ...updates, updated_at: new Date().toISOString() } : job,
      ),
    }));
  }

  async function saveMovements(movements: Movement[]) {
    const prepared = movements.map((movement) => ({
      ...movement,
      product_condition: movement.product_condition ?? "good",
    }));

    if (usingRemote && supabase) {
      const { data: inserted, error: insertError } = await supabase
        .from("stock_movements")
        .insert(prepared.map((movement) => ({ ...movement })))
        .select("*");
      if (insertError) throw insertError;
      setData((current) =>
        normalizeData({ ...current, movements: [...((inserted ?? []) as Movement[]), ...current.movements] }),
      );
      return;
    }

    updateLocal((current) => ({ ...current, movements: [...prepared, ...current.movements] }));
  }

  async function saveMovement(movement: Movement) {
    await saveMovements([movement]);
  }

  async function deleteMovement(movementId: string) {
    if (!window.confirm("Delete this movement?")) return;
    setSubmitting(true);
    setError(null);

    try {
      if (usingRemote && supabase) {
        const { error: deleteError } = await supabase.from("stock_movements").delete().eq("id", movementId);
        if (deleteError) throw deleteError;
        setData((current) =>
          normalizeData({
            ...current,
            movements: current.movements.filter((movement) => movement.id !== movementId),
          }),
        );
      } else {
        updateLocal((current) => ({
          ...current,
          movements: current.movements.filter((movement) => movement.id !== movementId),
        }));
      }

      setMessage("Movement deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete movement.");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeHolder(holderId: string) {
    const holder = data.holders.find((item) => item.id === holderId);
    if (!holder) return;

    const hasHistory = data.movements.some(
      (movement) => movement.from_holder_id === holderId || movement.to_holder_id === holderId,
    );

    const confirmMessage = hasHistory
      ? `${holder.name} has stock movements, so their history stays for the records. Hide them from the lists?`
      : `Remove ${holder.name}?`;
    if (!window.confirm(confirmMessage)) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      if (hasHistory) {
        if (usingRemote && supabase) {
          const { error: updateError } = await supabase
            .from("holders")
            .update({ active: false })
            .eq("id", holderId);
          if (updateError) throw updateError;
          setData((current) =>
            normalizeData({
              ...current,
              holders: current.holders.map((item) => (item.id === holderId ? { ...item, active: false } : item)),
            }),
          );
        } else {
          updateLocal((current) => ({
            ...current,
            holders: current.holders.map((item) => (item.id === holderId ? { ...item, active: false } : item)),
          }));
        }
        setMessage(`${holder.name} hidden. Their past movements are kept.`);
      } else {
        if (usingRemote && supabase) {
          const { error: deleteError } = await supabase.from("holders").delete().eq("id", holderId);
          if (deleteError) throw deleteError;
        }
        updateLocalOrState((current) => ({
          ...current,
          holders: current.holders.filter((item) => item.id !== holderId),
        }));
        setMessage(`${holder.name} removed.`);
      }
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove this holder.");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeProduct(productId: string) {
    const product = data.products.find((item) => item.id === productId);
    if (!product) return;

    const hasHistory = data.movements.some((movement) => movement.product_id === productId);

    const confirmMessage = hasHistory
      ? `${product.name} has stock movements, so its history stays for the records. Hide it from the lists?`
      : `Remove ${product.name}?`;
    if (!window.confirm(confirmMessage)) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      if (hasHistory) {
        if (usingRemote && supabase) {
          const { error: updateError } = await supabase
            .from("products")
            .update({ active: false })
            .eq("id", productId);
          if (updateError) throw updateError;
          setData((current) =>
            normalizeData({
              ...current,
              products: current.products.map((item) => (item.id === productId ? { ...item, active: false } : item)),
            }),
          );
        } else {
          updateLocal((current) => ({
            ...current,
            products: current.products.map((item) => (item.id === productId ? { ...item, active: false } : item)),
          }));
        }
        setMessage(`${product.name} hidden. Its past movements are kept.`);
      } else {
        if (usingRemote && supabase) {
          const { error: deleteError } = await supabase.from("products").delete().eq("id", productId);
          if (deleteError) throw deleteError;
        }
        updateLocalOrState((current) => ({
          ...current,
          products: current.products.filter((item) => item.id !== productId),
        }));
        setMessage(`${product.name} removed.`);
      }
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove this product.");
    } finally {
      setSubmitting(false);
    }
  }

  async function seedWorkbookSnapshot() {
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      if (usingRemote && supabase) {
        const seed = createRemoteSeed();
        const { error: productsError } = await supabase.from("products").insert(seed.products);
        if (productsError) throw productsError;
        const { error: holdersError } = await supabase.from("holders").insert(seed.holders);
        if (holdersError) throw holdersError;
        const { error: movementsError } = await supabase.from("stock_movements").insert(seed.movements);
        if (movementsError) throw movementsError;
        setData(seed);
      } else {
        const seed = cloneLocalSeed();
        updateLocal(seed);
      }

      setMessage("Workbook snapshot loaded.");
    } catch (seedError) {
      setError(seedError instanceof Error ? seedError.message : "Could not load workbook snapshot.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = productName.trim();
    if (!name) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await saveProduct({
        id: crypto.randomUUID(),
        name,
        sku: productSku.trim() || null,
        active: true,
      });
      setProductName("");
      setProductSku("");
      setMessage("Product added.");
    } catch (productError) {
      setError(productError instanceof Error ? productError.message : "Could not add product.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddHolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = holderName.trim();
    if (!name) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await saveHolder({
        id: crypto.randomUUID(),
        name,
        holder_type: holderType,
        active: true,
      });
      setHolderName("");
      setMessage("Holder added.");
    } catch (holderError) {
      setError(holderError instanceof Error ? holderError.message : "Could not add holder.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    setError(null);
    setMessage(null);

    if (!productId || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError("Choose a product and enter a whole quantity above zero.");
      return;
    }

    let fromId: string | null = null;
    let toId: string | null = null;

    if (movementType === "opening" || movementType === "receive") {
      toId = toHolderId || warehouses[0]?.id || activeHolders[0]?.id || null;
    }

    if (movementType === "issue") {
      fromId = fromHolderId || warehouses[0]?.id || null;
      toId = toHolderId || technicians[0]?.id || null;
    }

    if (movementType === "return") {
      fromId = fromHolderId || technicians[0]?.id || null;
      toId = toHolderId || warehouses[0]?.id || null;
    }

    if (movementType === "install") {
      fromId = fromHolderId || technicians[0]?.id || null;
    }

    if (movementType === "adjustment") {
      const selectedHolder = adjustmentDirection === "in" ? toHolderId || fromHolderId : fromHolderId || toHolderId;
      if (adjustmentDirection === "in") {
        toId = selectedHolder || activeHolders[0]?.id || null;
      } else {
        fromId = selectedHolder || activeHolders[0]?.id || null;
      }
    }

    if (!fromId && !toId) {
      setError("Choose a holder for this movement.");
      return;
    }

    if (fromId) {
      const available = getBalance(goodBalanceMap, fromId, productId);
      if (available < parsedQuantity) {
        const holder = data.holders.find((item) => item.id === fromId)?.name ?? "Selected holder";
        setError(`${holder} has ${available} available for this product.`);
        return;
      }
    }

    setSubmitting(true);

    try {
      await saveMovement({
        id: crypto.randomUUID(),
        movement_date: movementDate,
        movement_type: movementType,
        product_condition: "good",
        product_id: productId,
        quantity: parsedQuantity,
        from_holder_id: fromId,
        to_holder_id: toId,
        warranty_job_id: null,
        job_number: null,
        customer_name: null,
        reference: reference.trim() || null,
        tracking: tracking.trim() || null,
        notes: notes.trim() || null,
        created_at: new Date().toISOString(),
      });

      setQuantity("1");
      setReference("");
      setTracking("");
      setNotes("");
      setMessage("Movement saved.");
      setActiveTab("dashboard");
    } catch (movementError) {
      setError(movementError instanceof Error ? movementError.message : "Could not save movement.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateWarrantyJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const jobNumber = warrantyJobNumber.trim();
    const customerName = warrantyCustomerName.trim();

    if (!jobNumber || !customerName) {
      setError("Enter a job number and customer name.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const saved = await saveWarrantyJob({
        id: crypto.randomUUID(),
        job_number: jobNumber,
        customer_name: customerName,
        customer_phone: warrantyCustomerPhone.trim() || null,
        customer_address: warrantyCustomerAddress.trim() || null,
        status: "open",
        notes: warrantyJobNotes.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      setSelectedWarrantyJobId(saved.id);
      setWarrantyJobNumber("");
      setWarrantyCustomerName("");
      setWarrantyCustomerPhone("");
      setWarrantyCustomerAddress("");
      setWarrantyJobNotes("");
      setMessage("Warranty job created.");
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : "Could not create warranty job.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePostStockToCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWarrantyJob) {
      setError("Select a warranty job first.");
      return;
    }

    const parsedQuantity = Number(postQuantity);
    if (!postProductId || !postWarehouseId || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError("Choose a product, warehouse, and whole quantity above zero.");
      return;
    }

    const available = getBalance(goodBalanceMap, postWarehouseId, postProductId);
    if (available < parsedQuantity) {
      const holder = data.holders.find((item) => item.id === postWarehouseId)?.name ?? "Selected warehouse";
      setError(`${holder} has ${available} available for this product.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await saveMovement({
        id: crypto.randomUUID(),
        movement_date: warrantyDate,
        movement_type: "customer_post",
        product_condition: "good",
        product_id: postProductId,
        quantity: parsedQuantity,
        from_holder_id: postWarehouseId,
        to_holder_id: null,
        warranty_job_id: selectedWarrantyJob.id,
        job_number: selectedWarrantyJob.job_number,
        customer_name: selectedWarrantyJob.customer_name,
        reference: postReference.trim() || null,
        tracking: postTracking.trim() || null,
        notes: "Posted replacement stock to customer.",
        created_at: new Date().toISOString(),
      });

      if (selectedWarrantyJob.status === "open") {
        await updateWarrantyJob(selectedWarrantyJob.id, { status: "posted" });
      }

      setPostQuantity("1");
      setPostReference("");
      setPostTracking("");
      setMessage("Customer stock posting saved.");
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : "Could not post stock to customer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecordChangeover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWarrantyJob) {
      setError("Select a warranty job first.");
      return;
    }

    const parsedQuantity = Number(changeQuantity);
    if (!changeProductId || !changeTechnicianId || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError("Choose an electrician, product, and whole quantity above zero.");
      return;
    }

    const available = getBalance(goodBalanceMap, changeTechnicianId, changeProductId);
    if (available < parsedQuantity) {
      const holder = data.holders.find((item) => item.id === changeTechnicianId)?.name ?? "Selected electrician";
      setError(`${holder} has ${available} good stock available for this product.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    const createdAt = new Date().toISOString();
    const common = {
      movement_date: warrantyDate,
      product_id: changeProductId,
      quantity: parsedQuantity,
      warranty_job_id: selectedWarrantyJob.id,
      job_number: selectedWarrantyJob.job_number,
      customer_name: selectedWarrantyJob.customer_name,
      reference: selectedWarrantyJob.job_number,
      tracking: null,
      created_at: createdAt,
    };

    try {
      await saveMovements([
        {
          ...common,
          id: crypto.randomUUID(),
          movement_type: "install",
          product_condition: "good",
          from_holder_id: changeTechnicianId,
          to_holder_id: null,
          notes: changeNotes.trim() || "Warranty changeover: good stock installed.",
        },
        {
          ...common,
          id: crypto.randomUUID(),
          movement_type: "faulty_collect",
          product_condition: "faulty",
          from_holder_id: null,
          to_holder_id: changeTechnicianId,
          notes: changeNotes.trim() || "Faulty alarm collected and held by electrician.",
        },
      ]);

      const posted = sumJobMovement(selectedWarrantyJob, data.movements, "customer_post", "good");
      const installed = sumJobMovement(selectedWarrantyJob, data.movements, "install", "good") + parsedQuantity;
      if (selectedWarrantyJob.status !== "cancelled" && posted > 0 && installed >= posted) {
        await updateWarrantyJob(selectedWarrantyJob.id, { status: "completed" });
      }

      setChangeQuantity("1");
      setChangeNotes("");
      setMessage("Warranty changeover recorded.");
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Could not record changeover.");
    } finally {
      setSubmitting(false);
    }
  }

  const hasAnyData = data.products.length > 0 || data.holders.length > 0 || data.movements.length > 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">
            <ShieldCheck size={16} />
            Workbook-backed inventory
          </div>
          <h1>Stock Tracker</h1>
        </div>
        <div className="topbar-actions">
          <span className={`status-pill ${usingRemote ? "cloud" : "local"}`}>
            {usingRemote ? <Cloud size={16} /> : <Database size={16} />}
            {usingRemote ? "Shared cloud" : "This device only"}
          </span>
        </div>
      </header>

      <nav className="tabs" aria-label="Views">
        <button className={activeTab === "dashboard" ? "active" : ""} type="button" onClick={() => setActiveTab("dashboard")}>
          <Boxes size={18} />
          Dashboard
        </button>
        <button className={activeTab === "movements" ? "active" : ""} type="button" onClick={() => setActiveTab("movements")}>
          <RefreshCw size={18} />
          Movements
        </button>
        <button className={activeTab === "warranty" ? "active" : ""} type="button" onClick={() => setActiveTab("warranty")}>
          <ClipboardList size={18} />
          Warranty
        </button>
        <button className={activeTab === "setup" ? "active" : ""} type="button" onClick={() => setActiveTab("setup")}>
          <Wrench size={18} />
          Setup
        </button>
      </nav>

      {loading ? (
        <section className="loading-panel">
          <RefreshCw className="spin" size={24} />
          Loading stock data
        </section>
      ) : (
        <>
          {error ? <div className="notice error">{error}</div> : null}
          {message ? <div className="notice success">{message}</div> : null}

          {!hasAnyData ? (
            <section className="empty-state">
              <Boxes size={36} />
              <h2>No stock data yet</h2>
              <button className="primary-button" type="button" onClick={seedWorkbookSnapshot} disabled={submitting}>
                <DownloadCloud size={18} />
                Load workbook snapshot
              </button>
            </section>
          ) : null}

          {activeTab === "dashboard" ? (
            <DashboardView
              activeHolders={visibleDashboardHolders}
              activeProducts={activeProducts}
              balanceMap={goodBalanceMap}
              holderCount={activeHolders.length}
              latestMovement={latestMovement}
              movementCount={data.movements.length}
              negativeBalances={negativeBalances}
              productTotals={productTotals}
              totalStock={totalStock}
              totalFaultyStock={totalFaultyStock}
              seedWorkbookSnapshot={seedWorkbookSnapshot}
              canSeed={!hasAnyData}
              submitting={submitting}
            />
          ) : null}

          {activeTab === "movements" ? (
            <section className="workspace-grid">
              <MovementForm
                activeHolders={activeHolders}
                activeProducts={activeProducts}
                adjustmentDirection={adjustmentDirection}
                balanceMap={goodBalanceMap}
                fromHolderId={fromHolderId}
                movementDate={movementDate}
                movementType={movementType}
                notes={notes}
                productId={productId}
                quantity={quantity}
                reference={reference}
                submitting={submitting}
                technicians={technicians}
                toHolderId={toHolderId}
                tracking={tracking}
                warehouses={warehouses}
                setAdjustmentDirection={setAdjustmentDirection}
                setFromHolderId={setFromHolderId}
                setMovementDate={setMovementDate}
                setMovementType={setMovementType}
                setNotes={setNotes}
                setProductId={setProductId}
                setQuantity={setQuantity}
                setReference={setReference}
                setToHolderId={setToHolderId}
                setTracking={setTracking}
                onSubmit={handleAddMovement}
              />

              <LedgerView
                data={data}
                filteredMovements={filteredMovements}
                movementFilter={movementFilter}
                searchTerm={searchTerm}
                submitting={submitting}
                deleteMovement={deleteMovement}
                setMovementFilter={setMovementFilter}
                setSearchTerm={setSearchTerm}
              />
            </section>
          ) : null}

          {activeTab === "warranty" ? (
            <WarrantyView
              activeProducts={activeProducts}
              changeProductId={changeProductId}
              changeQuantity={changeQuantity}
              changeTechnicianId={changeTechnicianId}
              changeNotes={changeNotes}
              customerAddress={warrantyCustomerAddress}
              customerName={warrantyCustomerName}
              customerPhone={warrantyCustomerPhone}
              data={data}
              faultyBalanceMap={faultyBalanceMap}
              goodBalanceMap={goodBalanceMap}
              jobNotes={warrantyJobNotes}
              jobNumber={warrantyJobNumber}
              postProductId={postProductId}
              postQuantity={postQuantity}
              postReference={postReference}
              postTracking={postTracking}
              postWarehouseId={postWarehouseId}
              selectedJob={selectedWarrantyJob}
              selectedJobId={selectedWarrantyJobId}
              searchTerm={warrantySearch}
              submitting={submitting}
              technicians={technicians}
              warrantyDate={warrantyDate}
              warehouses={warehouses}
              jobs={sortedWarrantyJobs}
              onCreateJob={handleCreateWarrantyJob}
              onPostStock={handlePostStockToCustomer}
              onRecordChangeover={handleRecordChangeover}
              setChangeNotes={setChangeNotes}
              setChangeProductId={setChangeProductId}
              setChangeQuantity={setChangeQuantity}
              setChangeTechnicianId={setChangeTechnicianId}
              setCustomerAddress={setWarrantyCustomerAddress}
              setCustomerName={setWarrantyCustomerName}
              setCustomerPhone={setWarrantyCustomerPhone}
              setJobNotes={setWarrantyJobNotes}
              setJobNumber={setWarrantyJobNumber}
              setPostProductId={setPostProductId}
              setPostQuantity={setPostQuantity}
              setPostReference={setPostReference}
              setPostTracking={setPostTracking}
              setPostWarehouseId={setPostWarehouseId}
              setSearchTerm={setWarrantySearch}
              setSelectedJobId={setSelectedWarrantyJobId}
              setWarrantyDate={setWarrantyDate}
            />
          ) : null}

          {activeTab === "setup" ? (
            <SetupView
              activeHolders={activeHolders}
              activeProducts={activeProducts}
              holderName={holderName}
              holderType={holderType}
              productName={productName}
              productSku={productSku}
              submitting={submitting}
              onAddHolder={handleAddHolder}
              onAddProduct={handleAddProduct}
              onRemoveHolder={removeHolder}
              onRemoveProduct={removeProduct}
              setHolderName={setHolderName}
              setHolderType={setHolderType}
              setProductName={setProductName}
              setProductSku={setProductSku}
            />
          ) : null}
        </>
      )}
    </main>
  );
}

type ProductTotalRow = {
  product: Product;
  warehouseTotal: number;
  fieldTotal: number;
  total: number;
};

function DashboardView({
  activeHolders,
  activeProducts,
  balanceMap,
  holderCount,
  latestMovement,
  movementCount,
  negativeBalances,
  productTotals,
  totalStock,
  totalFaultyStock,
  seedWorkbookSnapshot,
  canSeed,
  submitting,
}: {
  activeHolders: Holder[];
  activeProducts: Product[];
  balanceMap: Map<string, number>;
  holderCount: number;
  latestMovement: Movement | undefined;
  movementCount: number;
  negativeBalances: BalanceRow[];
  productTotals: ProductTotalRow[];
  totalStock: number;
  totalFaultyStock: number;
  seedWorkbookSnapshot: () => void;
  canSeed: boolean;
  submitting: boolean;
}) {
  return (
    <section className="dashboard-stack">
      <div className="metric-grid">
        <div className="metric-card">
          <Boxes size={22} />
          <span>Good Stock</span>
          <strong>{totalStock.toLocaleString()}</strong>
        </div>
        <div className="metric-card">
          <AlertTriangle size={22} />
          <span>Faulty Held</span>
          <strong>{totalFaultyStock.toLocaleString()}</strong>
        </div>
        <div className="metric-card">
          <Users size={22} />
          <span>Holders</span>
          <strong>{holderCount}</strong>
        </div>
        <div className="metric-card">
          <RefreshCw size={22} />
          <span>Movements</span>
          <strong>{movementCount}</strong>
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Product Totals</h2>
            <p>{latestMovement ? `Last movement: ${formatDate(latestMovement.movement_date)}` : "No movements recorded"}</p>
          </div>
          {canSeed ? (
            <button className="secondary-button" type="button" onClick={seedWorkbookSnapshot} disabled={submitting}>
              <DownloadCloud size={18} />
              Load workbook snapshot
            </button>
          ) : null}
        </div>

        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Warehouses</th>
                <th>Field</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {productTotals.map((row) => (
                <tr key={row.product.id}>
                  <td>
                    <strong>{row.product.name}</strong>
                    <span>{row.product.sku}</span>
                  </td>
                  <td>{row.warehouseTotal.toLocaleString()}</td>
                  <td>{row.fieldTotal.toLocaleString()}</td>
                  <td>{row.total.toLocaleString()}</td>
                  <td>
                    <span className={row.total > 0 ? "status-chip ok" : "status-chip attention"}>
                      {row.total > 0 ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                      {row.total > 0 ? "In stock" : "Empty"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Stock On Hand</h2>
            <p>
              {negativeBalances.length
                ? `${negativeBalances.length} balance checks need review`
                : "Zero-stock electricians are hidden from this dashboard"}
            </p>
          </div>
        </div>

        <div className="responsive-table matrix-table">
          <table>
            <thead>
              <tr>
                <th>Holder</th>
                {activeProducts.map((product) => (
                  <th key={product.id}>{product.sku ?? product.name}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {activeHolders.map((holder) => {
                const rowTotal = activeProducts.reduce(
                  (total, product) => total + getBalance(balanceMap, holder.id, product.id),
                  0,
                );

                return (
                  <tr key={holder.id}>
                    <td>
                      <strong>{holder.name}</strong>
                      <span>{titleCase(holder.holder_type)}</span>
                    </td>
                    {activeProducts.map((product) => {
                      const value = getBalance(balanceMap, holder.id, product.id);
                      return (
                        <td className={value < 0 ? "negative-cell" : ""} key={product.id}>
                          {value ? value.toLocaleString() : ""}
                        </td>
                      );
                    })}
                    <td>{rowTotal ? rowTotal.toLocaleString() : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function MovementForm({
  activeHolders,
  activeProducts,
  adjustmentDirection,
  balanceMap,
  fromHolderId,
  movementDate,
  movementType,
  notes,
  productId,
  quantity,
  reference,
  submitting,
  technicians,
  toHolderId,
  tracking,
  warehouses,
  setAdjustmentDirection,
  setFromHolderId,
  setMovementDate,
  setMovementType,
  setNotes,
  setProductId,
  setQuantity,
  setReference,
  setToHolderId,
  setTracking,
  onSubmit,
}: {
  activeHolders: Holder[];
  activeProducts: Product[];
  adjustmentDirection: AdjustmentDirection;
  balanceMap: Map<string, number>;
  fromHolderId: string;
  movementDate: string;
  movementType: MovementType;
  notes: string;
  productId: string;
  quantity: string;
  reference: string;
  submitting: boolean;
  technicians: Holder[];
  toHolderId: string;
  tracking: string;
  warehouses: Holder[];
  setAdjustmentDirection: (value: AdjustmentDirection) => void;
  setFromHolderId: (value: string) => void;
  setMovementDate: (value: string) => void;
  setMovementType: (value: MovementType) => void;
  setNotes: (value: string) => void;
  setProductId: (value: string) => void;
  setQuantity: (value: string) => void;
  setReference: (value: string) => void;
  setToHolderId: (value: string) => void;
  setTracking: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const showFrom =
    movementType === "issue" ||
    movementType === "return" ||
    movementType === "install" ||
    (movementType === "adjustment" && adjustmentDirection === "out");
  const showTo =
    movementType === "opening" ||
    movementType === "receive" ||
    movementType === "issue" ||
    movementType === "return" ||
    (movementType === "adjustment" && adjustmentDirection === "in");
  const fromOptions =
    movementType === "issue" ? warehouses : movementType === "return" || movementType === "install" ? technicians : activeHolders;
  const toOptions =
    movementType === "issue" ? technicians : movementType === "return" || movementType === "receive" ? warehouses : activeHolders;
  const available = showFrom ? getBalance(balanceMap, fromHolderId, productId) : null;

  const holderName = (id: string) => activeHolders.find((holder) => holder.id === id)?.name ?? "";
  const productLabel = activeProducts.find((product) => product.id === productId)?.name ?? "stock";
  const parsedQuantity = Number(quantity);
  const quantityLabel = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity.toLocaleString() : "—";
  const fromLabel = showFrom ? holderName(fromHolderId) : "";
  const toLabel = showTo ? holderName(toHolderId) : "";
  // How much stock is available where it is being taken from, so an
  // over-issue is obvious before the form is submitted.
  const notEnoughStock =
    showFrom && available !== null && Number.isInteger(parsedQuantity) && parsedQuantity > 0 && available < parsedQuantity;

  // Render an option with its current stock for the chosen product, e.g.
  // "Melbourne Office — 263 in stock", so the counts are visible in the picker.
  const holderOption = (holder: Holder) => (
    <option value={holder.id} key={holder.id}>
      {holder.name} — {getBalance(balanceMap, holder.id, productId).toLocaleString()} in stock
    </option>
  );

  return (
    <section className="panel movement-panel">
      <div className="panel-header">
        <div>
          <h2>Move Stock</h2>
          <p>Pick what happened, then check the summary before you save.</p>
        </div>
      </div>

      <form className="movement-form" onSubmit={onSubmit}>
        <label>
          What happened?
          <select value={movementType} onChange={(event) => setMovementType(event.target.value as MovementType)}>
            {generalMovementTypes.map((type) => (
              <option value={type} key={type}>
                {movementActionLabels[type]}
              </option>
            ))}
          </select>
        </label>

        <p className="field-hint full-width">{movementDescriptions[movementType]}</p>

        {movementType === "adjustment" ? (
          <div className="segmented-control" role="group" aria-label="Adjustment direction">
            <button
              className={adjustmentDirection === "in" ? "active" : ""}
              type="button"
              onClick={() => setAdjustmentDirection("in")}
            >
              Add stock (in)
            </button>
            <button
              className={adjustmentDirection === "out" ? "active" : ""}
              type="button"
              onClick={() => setAdjustmentDirection("out")}
            >
              Remove stock (out)
            </button>
          </div>
        ) : null}

        <label>
          Date
          <input type="date" value={movementDate} onChange={(event) => setMovementDate(event.target.value)} required />
        </label>

        <label>
          Product
          <select value={productId} onChange={(event) => setProductId(event.target.value)} required>
            {activeProducts.map((product) => (
              <option value={product.id} key={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>

        {showFrom ? (
          <label>
            From (stock leaves here)
            <select value={fromHolderId} onChange={(event) => setFromHolderId(event.target.value)} required>
              {fromOptions.map(holderOption)}
            </select>
          </label>
        ) : null}

        {showTo ? (
          <label>
            To (stock arrives here)
            <select value={toHolderId} onChange={(event) => setToHolderId(event.target.value)} required>
              {toOptions.map(holderOption)}
            </select>
          </label>
        ) : null}

        <label>
          Quantity
          <input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
          />
        </label>

        {showFrom && available !== null ? (
          <p className={`field-hint full-width ${notEnoughStock ? "warn" : ""}`}>
            {fromLabel || "Selected holder"} currently has {available.toLocaleString()} of {productLabel}.
            {notEnoughStock ? " That is not enough for this movement." : ""}
          </p>
        ) : null}

        <div className="movement-preview full-width" role="status">
          <span className="preview-label">Summary</span>
          <span className="preview-body">
            {quantityLabel} × {productLabel}
            {fromLabel ? (
              <>
                {" "}
                <span className="preview-flow">
                  {fromLabel} <ArrowRight size={14} /> {toLabel || "installed / used"}
                </span>
              </>
            ) : toLabel ? (
              <>
                {" "}
                <span className="preview-flow">
                  added to {toLabel}
                </span>
              </>
            ) : null}
          </span>
        </div>

        <label>
          Reference
          <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Pickup slip" />
        </label>

        <label>
          Tracking
          <input value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder="Tracking" />
        </label>

        <label className="full-width">
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </label>

        <button className="primary-button full-width" type="submit" disabled={submitting || !activeProducts.length || !activeHolders.length}>
          <Plus size={18} />
          Save movement
        </button>
      </form>
    </section>
  );
}

function WarrantyView({
  activeProducts,
  changeProductId,
  changeQuantity,
  changeTechnicianId,
  changeNotes,
  customerAddress,
  customerName,
  customerPhone,
  data,
  faultyBalanceMap,
  goodBalanceMap,
  jobNotes,
  jobNumber,
  jobs,
  postProductId,
  postQuantity,
  postReference,
  postTracking,
  postWarehouseId,
  selectedJob,
  selectedJobId,
  searchTerm,
  submitting,
  technicians,
  warrantyDate,
  warehouses,
  onCreateJob,
  onPostStock,
  onRecordChangeover,
  setChangeNotes,
  setChangeProductId,
  setChangeQuantity,
  setChangeTechnicianId,
  setCustomerAddress,
  setCustomerName,
  setCustomerPhone,
  setJobNotes,
  setJobNumber,
  setPostProductId,
  setPostQuantity,
  setPostReference,
  setPostTracking,
  setPostWarehouseId,
  setSearchTerm,
  setSelectedJobId,
  setWarrantyDate,
}: {
  activeProducts: Product[];
  changeProductId: string;
  changeQuantity: string;
  changeTechnicianId: string;
  changeNotes: string;
  customerAddress: string;
  customerName: string;
  customerPhone: string;
  data: StockData;
  faultyBalanceMap: Map<string, number>;
  goodBalanceMap: Map<string, number>;
  jobNotes: string;
  jobNumber: string;
  jobs: WarrantyJob[];
  postProductId: string;
  postQuantity: string;
  postReference: string;
  postTracking: string;
  postWarehouseId: string;
  selectedJob: WarrantyJob | null;
  selectedJobId: string;
  searchTerm: string;
  submitting: boolean;
  technicians: Holder[];
  warrantyDate: string;
  warehouses: Holder[];
  onCreateJob: (event: FormEvent<HTMLFormElement>) => void;
  onPostStock: (event: FormEvent<HTMLFormElement>) => void;
  onRecordChangeover: (event: FormEvent<HTMLFormElement>) => void;
  setChangeNotes: (value: string) => void;
  setChangeProductId: (value: string) => void;
  setChangeQuantity: (value: string) => void;
  setChangeTechnicianId: (value: string) => void;
  setCustomerAddress: (value: string) => void;
  setCustomerName: (value: string) => void;
  setCustomerPhone: (value: string) => void;
  setJobNotes: (value: string) => void;
  setJobNumber: (value: string) => void;
  setPostProductId: (value: string) => void;
  setPostQuantity: (value: string) => void;
  setPostReference: (value: string) => void;
  setPostTracking: (value: string) => void;
  setPostWarehouseId: (value: string) => void;
  setSearchTerm: (value: string) => void;
  setSelectedJobId: (value: string) => void;
  setWarrantyDate: (value: string) => void;
}) {
  const term = searchTerm.trim().toLowerCase();
  const filteredJobs = jobs.filter((job) =>
    [job.job_number, job.customer_name, job.customer_phone, job.customer_address, job.status]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(term),
  );

  const openJobs = jobs.filter((job) => job.status !== "completed" && job.status !== "cancelled").length;
  const postedTotal = jobs.reduce((total, job) => total + sumJobMovement(job, data.movements, "customer_post", "good"), 0);
  const installedTotal = jobs.reduce((total, job) => total + sumJobMovement(job, data.movements, "install", "good"), 0);
  const faultyTotal = jobs.reduce((total, job) => total + sumJobMovement(job, data.movements, "faulty_collect", "faulty"), 0);
  const selectedPosted = selectedJob ? describeMovementProducts(selectedJob, data.movements, data.products, "customer_post") : "";
  const selectedInstalled = selectedJob ? describeMovementProducts(selectedJob, data.movements, data.products, "install") : "";
  const selectedFaulty = selectedJob ? describeMovementProducts(selectedJob, data.movements, data.products, "faulty_collect") : "";

  return (
    <section className="warranty-stack">
      <div className="metric-grid">
        <div className="metric-card">
          <ClipboardList size={22} />
          <span>Warranty Jobs</span>
          <strong>{jobs.length}</strong>
        </div>
        <div className="metric-card">
          <Truck size={22} />
          <span>Posted</span>
          <strong>{postedTotal.toLocaleString()}</strong>
        </div>
        <div className="metric-card">
          <PackageCheck size={22} />
          <span>Installed</span>
          <strong>{installedTotal.toLocaleString()}</strong>
        </div>
        <div className="metric-card">
          <AlertTriangle size={22} />
          <span>Faulty Held</span>
          <strong>{faultyTotal.toLocaleString()}</strong>
        </div>
      </div>

      <section className="warranty-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Create Warranty Job</h2>
              <p>{openJobs} open or posted jobs</p>
            </div>
          </div>

          <form className="warranty-form" onSubmit={onCreateJob}>
            <label>
              Job number
              <input value={jobNumber} onChange={(event) => setJobNumber(event.target.value)} required />
            </label>
            <label>
              Customer
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
            </label>
            <label>
              Phone
              <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
            </label>
            <label className="full-width">
              Address
              <input value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} />
            </label>
            <label className="full-width">
              Notes
              <textarea value={jobNotes} onChange={(event) => setJobNotes(event.target.value)} rows={3} />
            </label>
            <button className="primary-button full-width" type="submit" disabled={submitting}>
              <Plus size={18} />
              Create job
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-header ledger-header">
            <div>
              <h2>Job List</h2>
              <p>{filteredJobs.length} visible jobs</p>
            </div>
            <label className="search-box">
              <Search size={17} />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search jobs" />
            </label>
          </div>

          <div className="job-list">
            {filteredJobs.map((job) => {
              const posted = sumJobMovement(job, data.movements, "customer_post", "good");
              const installed = sumJobMovement(job, data.movements, "install", "good");
              const faulty = sumJobMovement(job, data.movements, "faulty_collect", "faulty");
              return (
                <button
                  className={selectedJobId === job.id ? "job-row active" : "job-row"}
                  type="button"
                  onClick={() => setSelectedJobId(job.id)}
                  key={job.id}
                >
                  <span>
                    <strong>{job.job_number}</strong>
                    {job.customer_name}
                  </span>
                  <span className={`status-chip ${job.status === "completed" ? "ok" : "attention"}`}>
                    {statusLabels[job.status]}
                  </span>
                  <span className="job-counts">
                    Posted {posted} | Installed {installed} | Faulty {faulty}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </section>

      {selectedJob ? (
        <section className="warranty-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>{selectedJob.job_number}</h2>
                <p>{selectedJob.customer_name}</p>
              </div>
              <span className={`status-chip ${selectedJob.status === "completed" ? "ok" : "attention"}`}>
                {statusLabels[selectedJob.status]}
              </span>
            </div>
            <div className="job-detail">
              <div>
                <span>Address</span>
                <strong>{selectedJob.customer_address || "Not entered"}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>{selectedJob.customer_phone || "Not entered"}</strong>
              </div>
              <div>
                <span>Posted to customer</span>
                <strong>{selectedPosted || "None"}</strong>
              </div>
              <div>
                <span>Installed by electrician</span>
                <strong>{selectedInstalled || "None"}</strong>
              </div>
              <div>
                <span>Faulty in electrician inventory</span>
                <strong>{selectedFaulty || "None"}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Post Stock To Customer</h2>
                <p>Moves good stock out of warehouse and links it to this job.</p>
              </div>
            </div>
            <form className="warranty-form" onSubmit={onPostStock}>
              <label>
                Date
                <input type="date" value={warrantyDate} onChange={(event) => setWarrantyDate(event.target.value)} required />
              </label>
              <label>
                Warehouse
                <select value={postWarehouseId} onChange={(event) => setPostWarehouseId(event.target.value)} required>
                  {warehouses.map((holder) => (
                    <option value={holder.id} key={holder.id}>
                      {holder.name} ({getBalance(goodBalanceMap, holder.id, postProductId)} good)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Product
                <select value={postProductId} onChange={(event) => setPostProductId(event.target.value)} required>
                  {activeProducts.map((product) => (
                    <option value={product.id} key={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={postQuantity}
                  onChange={(event) => setPostQuantity(event.target.value)}
                  required
                />
              </label>
              <label>
                Reference
                <input value={postReference} onChange={(event) => setPostReference(event.target.value)} placeholder="AusPost / slip" />
              </label>
              <label>
                Tracking
                <input value={postTracking} onChange={(event) => setPostTracking(event.target.value)} />
              </label>
              <button className="primary-button full-width" type="submit" disabled={submitting || !warehouses.length}>
                <Truck size={18} />
                Save customer posting
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Record Electrician Changeover</h2>
                <p>Good stock is installed; faulty stock is added to the electrician.</p>
              </div>
            </div>
            <form className="warranty-form" onSubmit={onRecordChangeover}>
              <label>
                Electrician
                <select value={changeTechnicianId} onChange={(event) => setChangeTechnicianId(event.target.value)} required>
                  {technicians.map((holder) => (
                    <option value={holder.id} key={holder.id}>
                      {holder.name} ({getBalance(goodBalanceMap, holder.id, changeProductId)} good)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Product
                <select value={changeProductId} onChange={(event) => setChangeProductId(event.target.value)} required>
                  {activeProducts.map((product) => (
                    <option value={product.id} key={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Faulty count
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={changeQuantity}
                  onChange={(event) => setChangeQuantity(event.target.value)}
                  required
                />
              </label>
              <div className="availability-note">
                Good stock available: {getBalance(goodBalanceMap, changeTechnicianId, changeProductId).toLocaleString()}
                <br />
                Faulty held now: {getBalance(faultyBalanceMap, changeTechnicianId, changeProductId).toLocaleString()}
              </div>
              <label className="full-width">
                Notes
                <textarea value={changeNotes} onChange={(event) => setChangeNotes(event.target.value)} rows={3} />
              </label>
              <button className="primary-button full-width" type="submit" disabled={submitting || !technicians.length}>
                <PackageCheck size={18} />
                Save changeover
              </button>
            </form>
          </section>
        </section>
      ) : (
        <section className="empty-state">
          <ClipboardList size={36} />
          <h2>Create or select a warranty job</h2>
        </section>
      )}
    </section>
  );
}

function LedgerView({
  data,
  filteredMovements,
  movementFilter,
  searchTerm,
  submitting,
  deleteMovement,
  setMovementFilter,
  setSearchTerm,
}: {
  data: StockData;
  filteredMovements: Movement[];
  movementFilter: MovementType | "all";
  searchTerm: string;
  submitting: boolean;
  deleteMovement: (movementId: string) => void;
  setMovementFilter: (value: MovementType | "all") => void;
  setSearchTerm: (value: string) => void;
}) {
  const holderName = (id: string | null) => data.holders.find((holder) => holder.id === id)?.name ?? "";
  const productName = (id: string) => data.products.find((product) => product.id === id)?.name ?? "Unknown product";

  return (
    <section className="panel ledger-panel">
      <div className="panel-header ledger-header">
        <div>
          <h2>Movement Ledger</h2>
          <p>{filteredMovements.length.toLocaleString()} visible movements</p>
        </div>
        <div className="ledger-tools">
          <label className="search-box">
            <Search size={17} />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search" />
          </label>
          <select value={movementFilter} onChange={(event) => setMovementFilter(event.target.value as MovementType | "all")}>
            <option value="all">All</option>
            {(Object.keys(movementLabels) as MovementType[]).map((type) => (
              <option value={type} key={type}>
                {movementLabels[type]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="responsive-table">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Product</th>
              <th>Route</th>
              <th>Qty</th>
              <th>Reference</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredMovements.map((movement) => (
              <tr key={movement.id}>
                <td>{formatDate(movement.movement_date)}</td>
                <td>
                  <span className={`type-chip ${movementTone[movement.movement_type]}`}>
                    {movementLabels[movement.movement_type]}
                  </span>
                  <span>{conditionLabels[getMovementCondition(movement)]}</span>
                </td>
                <td>{productName(movement.product_id)}</td>
                <td>
                  <RouteLabel from={holderName(movement.from_holder_id)} to={holderName(movement.to_holder_id)} />
                </td>
                <td>{movement.quantity.toLocaleString()}</td>
                <td>
                  {[movement.job_number, movement.customer_name, movement.reference, movement.tracking].filter(Boolean).join(" / ")}
                  {movement.notes ? <span>{movement.notes}</span> : null}
                </td>
                <td className="row-action">
                  <button
                    className="icon-button danger"
                    type="button"
                    title="Delete movement"
                    aria-label="Delete movement"
                    disabled={submitting}
                    onClick={() => deleteMovement(movement.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RouteLabel({ from, to }: { from: string; to: string }) {
  if (from && to) {
    return (
      <span className="route-label">
        {from}
        <span>to</span>
        {to}
      </span>
    );
  }

  return <span>{to || from || "Stock count"}</span>;
}

function SetupView({
  activeHolders,
  activeProducts,
  holderName,
  holderType,
  productName,
  productSku,
  submitting,
  onAddHolder,
  onAddProduct,
  onRemoveHolder,
  onRemoveProduct,
  setHolderName,
  setHolderType,
  setProductName,
  setProductSku,
}: {
  activeHolders: Holder[];
  activeProducts: Product[];
  holderName: string;
  holderType: HolderType;
  productName: string;
  productSku: string;
  submitting: boolean;
  onAddHolder: (event: FormEvent<HTMLFormElement>) => void;
  onAddProduct: (event: FormEvent<HTMLFormElement>) => void;
  onRemoveHolder: (holderId: string) => void;
  onRemoveProduct: (productId: string) => void;
  setHolderName: (value: string) => void;
  setHolderType: (value: HolderType) => void;
  setProductName: (value: string) => void;
  setProductSku: (value: string) => void;
}) {
  const electricians = activeHolders.filter((holder) => holder.holder_type === "technician");
  const otherHolders = activeHolders.filter((holder) => holder.holder_type !== "technician");

  return (
    <section className="setup-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Electricians &amp; Warehouses</h2>
            <p>{electricians.length} electricians, {otherHolders.length} warehouses / other</p>
          </div>
        </div>

        <form className="setup-form" onSubmit={onAddHolder}>
          <label>
            Name
            <input
              value={holderName}
              onChange={(event) => setHolderName(event.target.value)}
              placeholder="e.g. John Smith"
              required
            />
          </label>
          <label>
            Type
            <select value={holderType} onChange={(event) => setHolderType(event.target.value as HolderType)}>
              <option value="technician">Electrician</option>
              <option value="warehouse">Warehouse</option>
              <option value="other">Other</option>
            </select>
          </label>
          <button className="secondary-button" type="submit" disabled={submitting}>
            <UserPlus size={18} />
            Add
          </button>
        </form>

        {electricians.length ? (
          <>
            <p className="list-label">Electricians</p>
            <div className="entity-list">
              {electricians.map((holder) => (
                <div className="entity-row" key={holder.id}>
                  <Users size={17} />
                  <strong>{holder.name}</strong>
                  <span>Electrician</span>
                  <button
                    className="icon-button danger"
                    type="button"
                    title={`Remove ${holder.name}`}
                    aria-label={`Remove ${holder.name}`}
                    disabled={submitting}
                    onClick={() => onRemoveHolder(holder.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {otherHolders.length ? (
          <>
            <p className="list-label">Warehouses &amp; other</p>
            <div className="entity-list">
              {otherHolders.map((holder) => (
                <div className="entity-row" key={holder.id}>
                  {holder.holder_type === "warehouse" ? <Factory size={17} /> : <Boxes size={17} />}
                  <strong>{holder.name}</strong>
                  <span>{titleCase(holder.holder_type)}</span>
                  <button
                    className="icon-button danger"
                    type="button"
                    title={`Remove ${holder.name}`}
                    aria-label={`Remove ${holder.name}`}
                    disabled={submitting}
                    onClick={() => onRemoveHolder(holder.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Products</h2>
            <p>{activeProducts.length} active products</p>
          </div>
        </div>

        <form className="setup-form" onSubmit={onAddProduct}>
          <label>
            Name
            <input value={productName} onChange={(event) => setProductName(event.target.value)} required />
          </label>
          <label>
            SKU
            <input value={productSku} onChange={(event) => setProductSku(event.target.value)} />
          </label>
          <button className="secondary-button" type="submit" disabled={submitting}>
            <PackagePlus size={18} />
            Add product
          </button>
        </form>

        <div className="entity-list">
          {activeProducts.map((product) => (
            <div className="entity-row" key={product.id}>
              <PackagePlus size={17} />
              <strong>{product.name}</strong>
              <span>{product.sku}</span>
              <button
                className="icon-button danger"
                type="button"
                title={`Remove ${product.name}`}
                aria-label={`Remove ${product.name}`}
                disabled={submitting}
                onClick={() => onRemoveProduct(product.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
