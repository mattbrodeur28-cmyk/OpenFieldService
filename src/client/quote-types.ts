import type {
  BillingProfileConfig,
  EstimateKind,
  TaxRule,
} from "./estimating-types";
export interface EstimateLine {
  id: string;
  kind: EstimateKind;
  description: string;
  quantityMilli: number;
  headcount: number;
  unitCostCents: number;
  unitSellCents: number;
  discountBasisPoints: number;
  materialId: string | null;
  costOverrideReason: string;
  travelGroup: string;
  includesFuel: boolean;
}
export interface PricedLine extends EstimateLine {
  costCents: number;
  grossCents: number;
  discountCents: number;
  netCents: number;
  taxCents: number;
  totalCents: number;
  taxCategory: "labor" | "material" | null;
  taxRule: Omit<TaxRule, "kind"> & {
    kind: TaxRule["kind"] | "non_taxable_fee";
  };
}
export interface MaterialCost {
  id: string;
  name: string;
  unit: string;
  unitCostCents: number | null;
  source: string;
  sourceVersion: string;
  quantityMilli: number;
  valueMillicents: string;
}
export interface EstimateInput {
  opportunityId: string;
  expectedOpportunityVersion: number;
  profileId: string;
  expectedProfileVersion: number;
  pricingDate: string;
  lines: EstimateLine[];
}
export interface EstimateResult {
  calculationVersion: number;
  currency: "USD";
  profile: BillingProfileConfig;
  profileId: string;
  profileVersion: number;
  pricingDate: string;
  opportunityId: string;
  opportunityVersion: number;
  materialSnapshots: MaterialCost[];
  persisted: boolean;
  lines: PricedLine[];
  costCents: number;
  grossCents: number;
  discountCents: number;
  netCents: number;
  taxCents: number;
  totalCents: number;
  profitCents: number;
  marginBasisPoints: number | null;
  markupBasisPoints: number | null;
}
export interface QuoteDocument {
  title: string;
  scope: string;
  exclusions: string;
  validUntil: string;
}
export interface Quote {
  id: string;
  identifier: string;
  number: number;
  opportunityId: string;
  version: number;
  status: string;
  revision: number;
  actorId: string;
  savedAt: string;
  createdAt: string;
  updatedAt: string;
  document: QuoteDocument;
  estimate: EstimateResult;
}
export interface QuoteCommand {
  id: string;
  requestKey: string;
  expectedVersion: number;
  document: QuoteDocument;
  estimate: EstimateInput;
}
export interface QuoteDetail {
  quote: Quote;
  history: { version: number; actorId: string; savedAt: string }[];
  historyPage: number;
  hasMoreHistory: boolean;
}
export interface QuoteSummary {
  id: string;
  identifier: string;
  version: number;
  status: string;
  opportunityId: string;
  opportunityTitle: string;
  title: string;
  validUntil: string;
  totalCents: number;
  updatedAt: string;
  currency: string;
}
export interface QuoteList {
  quotes: QuoteSummary[];
  total: number;
  page: number;
  pageSize: number;
}
export interface QuoteOpportunity {
  id: string;
  title: string;
  version: number;
  segment: "commercial" | "residential";
  customerName: string;
}
export interface LookupPage<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface DraftLine {
  id: string;
  kind: EstimateKind;
  description: string;
  quantity: string;
  headcount: string;
  unitCost: string;
  unitSell: string;
  discount: string;
  materialId: string | null;
  costOverrideReason: string;
  travelGroup: string;
  includesFuel: boolean;
}
