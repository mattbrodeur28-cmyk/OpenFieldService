import type { DraftLine, EstimateLine, TemplateReference } from "./quote-types";
export function scaledInput(
  raw: string,
  decimals: number,
  label: string,
  max: number,
): number;
export function scaledText(value: number, decimals: number): string;
export function quantityInput(raw: string): number;
export function headcountInput(raw: string): number;

export function editLine(line: EstimateLine): DraftLine;
export function lineInput(line: DraftLine): EstimateLine;

export function templateInput(reference: TemplateReference | null): Pick<TemplateReference, "id" | "version"> | null;
