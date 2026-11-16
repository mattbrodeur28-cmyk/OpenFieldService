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
  unitCostCents: number | null;
  unitSellCents: number | null;
  pricingPending?: true;
  pendingPricingNote?: string;
  discountBasisPoints: number;
  materialId: string | null;
  costOverrideReason: string;
  travelGroup: string;
  includesFuel: boolean;
}
export interface PricedLine extends EstimateLine {
  costCents: number | null;
  grossCents: number | null;
  discountCents: number | null;
  netCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
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
  pricingComplete?: false;
  pendingLineIds?: string[];
  knownTotals?: Record<string, number>;
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
  costCents: number | null;
  grossCents: number | null;
  discountCents: number | null;
  netCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  profitCents: number | null;
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
  template: TemplateReference | null;
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
  template?: TemplateReference | null;
}
export interface QuoteDetail {
  quote: Quote;
  history: { version: number; actorId: string; savedAt: string }[];
  historyPage: number;
  hasMoreHistory: boolean;
}
export interface QuoteSummary {
  pricingComplete: boolean;
  id: string;
  identifier: string;
  version: number;
  status: string;
  opportunityId: string;
  opportunityTitle: string;
  title: string;
  validUntil: string;
  totalCents: number | null;
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
  pricingPending?: true;
  pendingPricingNote?: string;
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

/** Public-field projection; internal costs, profile notes and stock evidence are absent. */
export interface CustomerQuoteDocument {
  schemaVersion: 1;
  kind: "draft_review";
  identifier: string;
  revision: number;
  savedAt: string;
  title: string;
  scope: string;
  exclusions: string;
  validUntil: string;
  pricingDate: string;
  currency: "USD";
  identityBasis: "current_native_records";
  customer: { kind: "customer" | "prospect"; name: string; address: string; city: string; state: string; zip: string };
  site: { name: string; address: string } | null;
  equipment: { name: string; manufacturer: string; model: string; serialNumber: string } | null;
  lines: {
    description: string;
    kind: EstimateLine["kind"];
    quantityMilli: number;
    headcount: number;
    unitSellCents: number;
    discountBasisPoints: number;
    grossCents: number | null;
    discountCents: number | null;
    netCents: number | null;
    taxCents: number | null;
    totalCents: number | null;
    taxTreatment: TaxRule["treatment"];
    taxRateBasisPoints: number;
  }[];
  grossCents: number | null;
  discountCents: number | null;
  netCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
}

export interface TemplateReference { id: string; version: number; name?: string }
export interface TemplateSummary { id: string; version: number; name: string; segment: string; active: boolean; updatedAt: string }
export interface QuoteTemplate {
  id: string; version: number; currentVersion: number; actorId: string; savedAt: string;
  source: { quoteId: string; revision: number };
  config: { name: string; title: string; segment: string; active: boolean; scope: string; exclusions: string; reviewNote: string;
    lines: (Omit<EstimateLine, "id" | "costOverrideReason" | "unitCostCents"> & {sourceLineId: string; unitCostCents: number | null})[] };
}
export interface TemplateDetail { template: QuoteTemplate; history: {version:number;actorId:string;savedAt:string}[]; historyPage:number;hasMoreHistory:boolean }
export interface TemplateCommand { id:string;requestKey:string;expectedVersion:number;name:string;title:string;active:boolean;reviewNote:string;source:{quoteId:string;revision:number} }
export interface InstantiatedTemplate {
  template: TemplateReference;
  document: Omit<QuoteDocument,"validUntil">;
  lines: (Omit<EstimateLine,"unitCostCents"> & {unitCostCents:number|null})[];
  materialSnapshots: MaterialCost[];
  warnings: string[];
}
