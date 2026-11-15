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
    description: line.description,
    quantity: scaledText(line.quantityMilli, 3),
    headcount: String(line.headcount),
    unitCost: scaledText(line.unitCostCents, 2),
    unitSell: scaledText(line.unitSellCents, 2),
    discount: scaledText(line.discountBasisPoints, 2),
    materialId: line.materialId,
    costOverrideReason: line.costOverrideReason,
    travelGroup: line.travelGroup,
    includesFuel: line.includesFuel,
  };
}
export function lineInput(line) {
  return {
    id: line.id,
    kind: line.kind,
    description: line.description,
    quantityMilli: quantityInput(line.quantity),
    headcount: headcountInput(line.headcount),
    unitCostCents: scaledInput(line.unitCost, 2, "Unit cost", 1_000_000_000),
    unitSellCents: scaledInput(
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
  };
}
