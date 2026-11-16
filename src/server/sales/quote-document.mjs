/** Explicit customer-document allowlist. Never spread a quote, pricing line or CRM row. */
export function customerQuoteDocument(quote, identity) {
  const price = quote.estimate;
  return {
    schemaVersion: 1,
    kind: "draft_review",
    identifier: quote.identifier,
    revision: quote.revision,
    savedAt: quote.savedAt,
    title: quote.document.title,
    scope: quote.document.scope,
    exclusions: quote.document.exclusions,
    validUntil: quote.document.validUntil,
    pricingDate: price.pricingDate,
    currency: price.currency,
    identityBasis: "current_native_records",
    customer: {
      kind: identity.customer ? "customer" : "prospect",
      name: identity.customer?.name ?? identity.opportunity.prospect_name,
      address: identity.customer?.address ?? "",
      city: identity.customer?.city ?? "",
      state: identity.customer?.state ?? "",
      zip: identity.customer?.zip ?? "",
    },
    site: identity.site ? { name: identity.site.name, address: identity.site.address } : null,
    equipment: identity.equipment ? {
      name: identity.equipment.name,
      manufacturer: identity.equipment.manufacturer,
      model: identity.equipment.model,
      serialNumber: identity.equipment.serial_number,
    } : null,
    lines: price.lines.map(line => ({
      description: line.description,
      kind: line.kind,
      quantityMilli: line.quantityMilli,
      headcount: line.headcount,
      unitSellCents: line.unitSellCents,
      discountBasisPoints: line.discountBasisPoints,
      grossCents: line.grossCents,
      discountCents: line.discountCents,
      netCents: line.netCents,
      taxCents: line.taxCents,
      totalCents: line.totalCents,
      taxTreatment: line.taxRule.treatment,
      taxRateBasisPoints: line.taxRule.rateBasisPoints,
    })),
    grossCents: price.grossCents,
    discountCents: price.discountCents,
    netCents: price.netCents,
    taxCents: price.taxCents,
    totalCents: price.totalCents,
  };
}

const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const money = cents => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const quantity = line => `${(line.quantityMilli / 1000).toFixed(3)}${line.headcount > 1 ? ` × ${line.headcount} people` : ""}`;

/** Self-contained, script-free draft review copy. This is not an offer or acceptance. */
export function renderCustomerQuoteHtml(doc) {
  const e = escape;
  const offered=doc.kind==="offered";
  const rows = doc.lines.map(line => `<tr>
<td><strong>${e(line.description)}</strong><small>${e(line.kind.replaceAll("_", " "))}</small></td>
<td>${e(quantity(line))}</td><td>${e(money(line.unitSellCents))}<small>${e(line.taxTreatment.replaceAll("_", " "))}</small></td>
<td>${e(money(line.discountCents))}</td><td>${e(money(line.netCents))}</td>
<td>${e(money(line.taxCents))}<small>${e((line.taxRateBasisPoints / 100).toFixed(2))}%</small></td><td>${e(money(line.totalCents))}</td></tr>`).join("");
  const address = [doc.customer.address, [doc.customer.city, doc.customer.state, doc.customer.zip].filter(Boolean).join(" ")].filter(Boolean).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(doc.identifier)} revision ${e(doc.revision)} — ${offered?"Offered quote":"Draft review"}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f6f7f9;color:#20242a;font:14px/1.5 system-ui,sans-serif}main{max-width:1100px;margin:24px auto;background:white;padding:32px;border:1px solid #dce0e5;border-radius:12px}header{border-bottom:2px solid #20242a;padding-bottom:20px}h1{font-size:26px;margin:10px 0}h2{font-size:16px;margin:24px 0 8px}p{margin:8px 0}.draft{font-size:12px;font-weight:700;letter-spacing:.1em;color:#6a5100}.muted,small{color:#59616c}small{display:block;font-size:11px}.identity{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.text{white-space:pre-wrap;overflow-wrap:anywhere}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:right;vertical-align:top;padding:12px 8px;border-bottom:1px solid #dce0e5;font-variant-numeric:tabular-nums}th:first-child,td:first-child{text-align:left;min-width:170px;overflow-wrap:anywhere}td:first-child{max-width:320px}dl{max-width:350px;margin:24px 0 24px auto}dl div{display:flex;justify-content:space-between;gap:20px;padding:8px 0}dd{margin:0}.total{font-size:20px;font-weight:700;border-top:2px solid #20242a}footer{margin-top:24px;border-top:1px solid #dce0e5;padding-top:16px;font-size:12px}@media(max-width:640px){main{margin:0;padding:20px;border:0;border-radius:0}.identity{grid-template-columns:1fr}h1{font-size:22px}}@media print{body{background:white}main{margin:0;padding:0;border:0;max-width:none}.scroll{overflow:visible}thead{display:table-header-group}tr{break-inside:avoid}th,td{padding:8px 4px;font-size:10px}h2{break-after:avoid}footer{break-inside:avoid}}@page{margin:14mm}
</style></head><body><main>
<header><div class="draft">${offered?"OFFERED QUOTE":"DRAFT · INTERNAL REVIEW COPY"}</div><h1>${e(doc.title)}</h1><p>${e(doc.identifier)} · Revision ${e(doc.revision)}</p><p class="muted">Pricing date ${e(doc.pricingDate)} · Valid until ${e(doc.validUntil)} · USD</p></header>
${offered?`<section><h2>Issued by</h2><strong>${e(doc.issuer.legalName)}</strong><p class="text">${e(doc.issuer.address)}</p><p>${e(doc.issuer.email)} · ${e(doc.issuer.phone)}</p><h2>Recipient</h2><p>${e(doc.recipient.name)} · ${e(doc.recipient.email)}</p><p>Offered ${e(doc.offeredAt)}</p></section>`:""}
<section class="identity"><div><h2>${doc.customer.kind === "customer" ? "Customer" : "Prospect"}</h2><strong>${e(doc.customer.name || "Not linked")}</strong><p class="text">${e(address)}</p></div>
<div>${doc.site ? `<h2>Location</h2><strong>${e(doc.site.name)}</strong><p class="text">${e(doc.site.address)}</p>` : "<h2>Location</h2><p>Not linked</p>"}${doc.equipment ? `<h2>Equipment</h2><p>${e(doc.equipment.name)}</p><p>${e([doc.equipment.manufacturer,doc.equipment.model].filter(Boolean).join(" "))}</p><p>Serial: ${e(doc.equipment.serialNumber)}</p>` : ""}</div></section>
<p class="muted">${offered?"Issuer, recipient, customer, location and equipment were frozen when this revision was offered.":"Customer, location and equipment details reflect current linked records, not a frozen offered identity."}</p>
<h2>Scope</h2><p class="text">${e(doc.scope)}</p>
${doc.exclusions ? `<h2>Exclusions</h2><p class="text">${e(doc.exclusions)}</p>` : ""}
<h2>Pricing</h2><p class="muted">Quantities are per person for labor. The unit rate follows the tax treatment shown; net excludes tax. Inclusive rates already contain tax.</p>
<div class="scroll"><table><thead><tr><th>Description</th><th>Quantity</th><th>Unit rate</th><th>Discount</th><th>Net</th><th>Tax</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>
<dl><div><dt>Gross selling value</dt><dd>${e(money(doc.grossCents))}</dd></div><div><dt>Discounts</dt><dd>−${e(money(doc.discountCents))}</dd></div><div><dt>Net before tax</dt><dd>${e(money(doc.netCents))}</dd></div><div><dt>Tax</dt><dd>${e(money(doc.taxCents))}</dd></div><div class="total"><dt>Total</dt><dd>${e(money(doc.totalCents))}</dd></div></dl>
${offered?`<h2>Terms</h2><p class="text">${e(doc.issuer.terms)}</p><footer>This is the immutable document for offered revision ${e(doc.revision)}. Viewing or downloading it does not record delivery, acceptance, signature, payment or an order. Responses are retained separately against this exact offer.</footer>`:`<footer>This saved draft has not been offered or accepted. No customer delivery, signature, order or payment is recorded by viewing or downloading this copy. Prices and terms come from saved revision ${e(doc.revision)}; changes require another saved revision.</footer>`}
</main></body></html>`;
}
