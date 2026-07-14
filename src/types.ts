export type HolderType = "warehouse" | "technician" | "other";

export type ProductCondition = "good" | "faulty";

export type WarrantyJobStatus = "open" | "posted" | "completed" | "cancelled";

export type MovementType =
  | "opening"
  | "receive"
  | "issue"
  | "return"
  | "install"
  | "customer_post"
  | "faulty_collect"
  | "adjustment";

export type Product = {
  id: string;
  user_id?: string;
  name: string;
  sku: string | null;
  active: boolean;
  created_at?: string;
};

export type Holder = {
  id: string;
  user_id?: string;
  name: string;
  holder_type: HolderType;
  active: boolean;
  phone?: string | null;
  address?: string | null;
  email?: string | null;
  created_at?: string;
};

export type Movement = {
  id: string;
  user_id?: string;
  movement_date: string;
  movement_type: MovementType;
  product_condition?: ProductCondition | null;
  product_id: string;
  quantity: number;
  from_holder_id: string | null;
  to_holder_id: string | null;
  warranty_job_id?: string | null;
  job_number?: string | null;
  customer_name?: string | null;
  reference: string | null;
  tracking: string | null;
  notes: string | null;
  is_loss?: boolean;
  charged?: boolean | null;
  charge_amount?: number | null;
  created_at?: string;
};

export type WarrantyJob = {
  id: string;
  user_id?: string;
  job_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  status: WarrantyJobStatus;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type StockData = {
  products: Product[];
  holders: Holder[];
  movements: Movement[];
  warrantyJobs: WarrantyJob[];
};

export type BalanceRow = {
  holderId: string;
  productId: string;
  quantity: number;
};
