export type HolderType = "warehouse" | "technician" | "other";

export type MovementType =
  | "opening"
  | "receive"
  | "issue"
  | "return"
  | "install"
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
  created_at?: string;
};

export type Movement = {
  id: string;
  user_id?: string;
  movement_date: string;
  movement_type: MovementType;
  product_id: string;
  quantity: number;
  from_holder_id: string | null;
  to_holder_id: string | null;
  reference: string | null;
  tracking: string | null;
  notes: string | null;
  created_at?: string;
};

export type StockData = {
  products: Product[];
  holders: Holder[];
  movements: Movement[];
};

export type BalanceRow = {
  holderId: string;
  productId: string;
  quantity: number;
};

