// Exact user-input conversion. The server remains the pricing authority.
export function scaledInput(raw, decimals, label, max) {
  const value = String(raw).trim();
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(value))
    throw new Error(
      `${label}: enter a nonnegative number with at most ${decimals} decimal places.`,
    );
  const [whole, fraction = ""] = value.split(".");
  const scaled =
    Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, "0"));
  if (!Number.isSafeInteger(scaled) || scaled > max)
    throw new Error(`${label} is too large.`);
  return scaled;
}
export function scaledText(value, decimals) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid scaled value.");
  const digits = String(value).padStart(decimals + 1, "0");
  return digits.slice(0, -decimals) + "." + digits.slice(-decimals);
}
export function quantityInput(raw) {
  const result = scaledInput(raw, 3, "Quantity", 1000000000);
  if (!result) throw new Error("Quantity must be greater than zero.");
  return result;
}
export function headcountInput(raw) {
  if (!/^\d+$/.test(String(raw)) || Number(raw) < 1 || Number(raw) > 100)
    throw new Error("Headcount must be a whole number between 1 and 100.");
  return Number(raw);
}

export function editLine(line) {
  return {
    id: line.id,
    kind: line.kind,
    ...(line.materialPricing ? {materialMultiplier:scaledText(line.materialPricing.multiplierBasisPoints,2),materialMisc:scaledText(line.materialPricing.miscCents,2)} : {}),
    ...(line.laborRate ? {laborRate:line.laborRate} : {}),
    description: line.description,
    quantity: scaledText(line.quantityMilli, 3),
    headcount: String(line.headcount),
    unitCost: line.unitCostCents === null ? "" : scaledText(line.unitCostCents, 2),
    unitSell: line.unitSellCents === null ? "" : scaledText(line.unitSellCents, 2),
    discount: scaledText(line.discountBasisPoints, 2),
    materialId: line.materialId,
    costOverrideReason: line.costOverrideReason,
    travelGroup: line.travelGroup,
    includesFuel: line.includesFuel,
    ...(line.pricingPending ? {pricingPending:true,pendingPricingNote:line.pendingPricingNote ?? ""} : {}),
  };
}
export function lineInput(line) {
  return {
    id: line.id,
    kind: line.kind,
    ...(line.kind==="material"&&(line.materialMultiplier!==undefined||line.materialMisc!==undefined)?{materialPricing:{multiplierBasisPoints:scaledInput(line.materialMultiplier??"0",2,"Material multiplier",100000),miscCents:scaledInput(line.materialMisc??"0",2,"Miscellaneous material charge",1_000_000_000)}}:{}),
    ...(line.laborRate ? {laborRate:line.laborRate} : {}),
    description: line.description,
    quantityMilli: quantityInput(line.quantity),
    headcount: headcountInput(line.headcount),
    unitCostCents: line.pricingPending && !line.unitCost.trim() ? null : scaledInput(line.unitCost, 2, "Unit cost", 1_000_000_000),
    unitSellCents: line.pricingPending && !line.unitSell.trim() ? null : scaledInput(
      line.unitSell,
      2,
      "Selling price",
      1_000_000_000,
    ),
    discountBasisPoints: scaledInput(line.discount, 2, "Discount", 10000),
    materialId: line.materialId,
    costOverrideReason: line.costOverrideReason,
    travelGroup: line.travelGroup,
    includesFuel: line.includesFuel,
    ...(line.pricingPending ? {pricingPending:true,pendingPricingNote:line.pendingPricingNote ?? ""} : {}),
  };
}

/** Display names are server-owned metadata, not part of the strict save command. */
export function templateInput(reference) {
  return reference ? { id: reference.id, version: reference.version } : null;
}

/** Unknown money must never be formatted as a zero-dollar value. */
export const quoteMoney = value => value === null ? "Pending" : new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(value/100);
