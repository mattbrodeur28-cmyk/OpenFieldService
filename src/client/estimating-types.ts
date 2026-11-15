export const estimateKinds = [
  "technician",
  "apprentice",
  "material",
  "service",
  "permit",
  "license",
  "distance",
  "fuel",
  "after_hours",
  "subcontractor",
] as const;
export type EstimateKind = (typeof estimateKinds)[number];
export const estimateLabels: Record<EstimateKind, string> = {
  technician: "Technician labor",
  apprentice: "Apprentice labor",
  material: "Materials",
  service: "Service",
  permit: "Permits",
  license: "Licensing",
  distance: "Travel distance",
  fuel: "Fuel",
  after_hours: "After hours",
  subcontractor: "Subcontractors",
};
export const taxCategories = ["labor", "material"] as const;
export type TaxCategory = (typeof taxCategories)[number];
export const taxLabels: Record<TaxCategory, string> = {
  labor: "Labor",
  material: "Materials",
};
export interface TaxRule {
  kind: TaxCategory;
  treatment: "exclusive" | "inclusive" | "exempt" | "outside_scope";
  rateBasisPoints: number;
  note: string;
}
export interface BillingProfileConfig {
  schemaVersion: 4;
  name: string;
  state: string;
  jurisdiction: string;
  segment: "residential" | "commercial";
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
  reviewNote: string;
  rules: TaxRule[];
}
export interface BillingProfile {
  id: string;
  version: number;
  config: BillingProfileConfig;
  updatedAt: string;
  requiresReview: boolean;
}
export interface BillingProfilePage {
  profiles: BillingProfile[];
  page: number;
  hasMore: boolean;
}
