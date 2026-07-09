export const stockAttachmentTypes = ["PDI Form", "V5", "MOT Certificate", "Service History", "Invoice", "Other"] as const;
export type StockAttachmentType = typeof stockAttachmentTypes[number];

export interface StockAttachment {
  id: string;
  stock_bike_id: string;
  attachment_type: StockAttachmentType;
  file_name: string;
  file_path: string;
  content_type: string | null;
  file_size: number | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export function isStockAttachmentType(value: unknown): value is StockAttachmentType {
  return stockAttachmentTypes.includes(value as StockAttachmentType);
}
