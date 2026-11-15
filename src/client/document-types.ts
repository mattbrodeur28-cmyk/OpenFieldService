export interface DocumentTarget {
  jobId?: string;
  orderId?: string;
  receiptId?: string;
}
export interface TicketDocument {
  id: string;
  title: string;
  original_name: string;
  tags: string[];
  archived: number;
  version: number;
  size_bytes: number;
  media_type: string;
  sha256: string;
  created_at: string;
  canManage: boolean;
  scanStatus: string;
  links: {
    job_id: string | null;
    order_id: string | null;
    receipt_id: string | null;
  }[];
}
export interface DocumentList {
  documents: TicketDocument[];
  page: number;
  hasMore: boolean;
  canManage: boolean;
}
export const documentQuery = (target: DocumentTarget) =>
  new URLSearchParams(
    Object.entries(target).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  ).toString();
