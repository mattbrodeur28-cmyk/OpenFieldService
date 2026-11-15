export interface SalesStage {
  id: string;
  name: string;
  kind: "open" | "won" | "lost";
  probability: number;
  requiredFields: string[];
  allowedFrom: string[];
}
export interface SalesPipeline {
  id: string;
  name: string;
  version: number;
  stages: SalesStage[];
}
export interface Opportunity {
  id: string;
  title: string;
  pipeline_id: string;
  stage_id: string;
  owner_id: string;
  prospect_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  segment: "commercial" | "residential";
  source: string;
  expected_value: number;
  probability: number;
  expected_close_date: string;
  next_action: string;
  next_action_date: string;
  customer_id: string | null;
  site_id: string | null;
  asset_id: string | null;
  customer_name: string | null;
  stage_name: string;
  stage_kind: "open" | "won" | "lost";
  notes: string;
  version: number;
  created_at: string;
  updated_at: string;
}
export interface SalesOptions {
  owners: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  sites: { id: string; name: string }[];
  assets: { id: string; name: string; site_id: string | null }[];
}
export interface SalesBoard {
  pipelineId: string;
  opportunities: Opportunity[];
  total: number;
  page: number;
  pageSize: number;
  currency: string;
  totals: {
    stage_id: string;
    count: number;
    value: number;
    weightedHundredths: number;
  }[];
}
export interface SalesDetail {
  opportunity: Opportunity;
  activity: {
    id: number;
    actor_id: string;
    action: string;
    reason: string;
    created_at: string;
    before_json: string;
    after_json: string;
  }[];
  notes: {
    id: string;
    actor_id: string;
    content: string;
    created_at: string;
  }[];
}
export const salesMoney = (minor: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(minor / 100);
export function salesMinor(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error(
      "Enter a nonnegative amount with at most two decimal places.",
    );
  const [whole, fraction = ""] = value.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor > 1_000_000_000)
    throw new Error("Expected value must be at most $10,000,000.");
  return minor;
}

export interface SalesActivity {
  id: string;
  opportunity_id: string;
  opportunity_title: string;
  opportunity_owner_id: string;
  kind: "call" | "meeting" | "site_survey" | "task";
  title: string;
  details: string;
  assignee_id: string;
  due_at: string;
  reminder_at: string;
  status: "open" | "done" | "cancelled";
  outcome: string;
  message_id: string | null;
  team_id: string | null;
  version: number;
  created_by: string;
  completed_by: string | null;
  completed_at: string | null;
}
export interface SalesActivityList {
  activities: SalesActivity[];
  total: number;
  page: number;
  pageSize: number;
  now: string;
}
export type SalesMutation = (
  path: string,
  method: string,
  data: unknown,
  message: string,
) => Promise<boolean>;
