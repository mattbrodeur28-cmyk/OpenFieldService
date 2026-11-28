import { renderQuoteMarkdown } from "../../shared/quote-markdown.mjs";

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
      unitSellCents: line.effectiveUnitSellCents ?? line.unitSellCents,
      ...(line.materialPricing?{miscCents:line.materialPricing.miscCents}:{}),
      ...(line.laborRate?{laborRate:line.laborRate}:{}),
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
<td><strong>${e(line.description)}</strong><small>${e(line.kind.replaceAll("_", " "))}${line.laborRate?` · ${e(line.laborRate.toUpperCase())}`:""}${line.miscCents?` · Includes ${e(money(line.miscCents))} miscellaneous charge before discount`:""}</small></td>
<td>${e(quantity(line))}</td><td>${e(money(line.unitSellCents))}<small>${e(line.taxTreatment.replaceAll("_", " "))}</small></td>
<td>${e(money(line.discountCents))}</td><td>${e(money(line.netCents))}</td>
<td>${e(money(line.taxCents))}<small>${e((line.taxRateBasisPoints / 100).toFixed(2))}%</small></td><td>${e(money(line.totalCents))}</td></tr>`).join("");
  const address = [doc.customer.address, [doc.customer.city, doc.customer.state, doc.customer.zip].filter(Boolean).join(" ")].filter(Boolean).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(doc.identifier)} revision ${e(doc.revision)} — ${offered?"Offered quote":"Draft review"}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f6f7f9;color:#20242a;font:14px/1.5 system-ui,sans-serif}main{max-width:1100px;margin:24px auto;background:white;padding:32px;border:1px solid #dce0e5;border-radius:12px}header{border-bottom:2px solid #20242a;padding-bottom:20px}h1{font-size:26px;margin:10px 0}h2{font-size:16px;margin:24px 0 8px}p{margin:8px 0}.draft{font-size:12px;font-weight:700;letter-spacing:.1em;color:#6a5100}.muted,small{color:#59616c}small{display:block;font-size:11px}.identity{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.text{white-space:pre-wrap;overflow-wrap:anywhere}.qmd{overflow-wrap:anywhere}.qmd h3,.qmd .qmd-h1{font-size:17px;margin:14px 0 6px;border-bottom:1px solid #e6e9ee;padding-bottom:3px}.qmd h4,.qmd .qmd-h2{font-size:15px;margin:12px 0 5px}.qmd h5,.qmd .qmd-h3{font-size:14px;margin:10px 0 4px;color:#3d4652}.qmd ul,.qmd ol{margin:8px 0;padding-left:22px}.qmd ul.qmd-dots{list-style-type:circle}.qmd ul.qmd-checklist{list-style:none;padding-left:4px}.qmd li.qmd-check{display:flex;align-items:flex-start;gap:8px;margin:4px 0}.qmd .qmd-box-mark{font-size:15px;line-height:1.3}.qmd .qmd-box{margin:10px 0;padding:10px 14px;border:1px solid #cfd6e0;border-left:4px solid #0176d3;border-radius:6px;background:#f7f9fc}.qmd .qmd-box p{margin:4px 0}.qmd hr{border:0;border-top:1px solid #dce0e5;margin:14px 0}.qmd code{background:#f0f2f5;padding:1px 5px;border-radius:4px;font-size:12px}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:right;vertical-align:top;padding:12px 8px;border-bottom:1px solid #dce0e5;font-variant-numeric:tabular-nums}th:first-child,td:first-child{text-align:left;min-width:170px;overflow-wrap:anywhere}td:first-child{max-width:320px}dl{max-width:350px;margin:24px 0 24px auto}dl div{display:flex;justify-content:space-between;gap:20px;padding:8px 0}dd{margin:0}.total{font-size:20px;font-weight:700;border-top:2px solid #20242a}footer{margin-top:24px;border-top:1px solid #dce0e5;padding-top:16px;font-size:12px}@media(max-width:640px){main{margin:0;padding:20px;border:0;border-radius:0}.identity{grid-template-columns:1fr}h1{font-size:22px}}@media print{body{background:white}main{margin:0;padding:0;border:0;max-width:none}.scroll{overflow:visible}thead{display:table-header-group}tr{break-inside:avoid}th,td{padding:8px 4px;font-size:10px}h2{break-after:avoid}footer{break-inside:avoid}}@page{margin:14mm}
</style></head><body><main>
<header><div class="draft">${offered?"OFFERED QUOTE":"DRAFT · INTERNAL REVIEW COPY"}</div><h1>${e(doc.title)}</h1><p>${e(doc.identifier)} · Revision ${e(doc.revision)}</p><p class="muted">Pricing date ${e(doc.pricingDate)} · Valid until ${e(doc.validUntil)} · USD</p></header>
${offered?`<section><h2>Issued by</h2><strong>${e(doc.issuer.legalName)}</strong><p class="text">${e(doc.issuer.address)}</p><p>${e(doc.issuer.email)} · ${e(doc.issuer.phone)}</p><h2>Recipient</h2><p>${e(doc.recipient.name)} · ${e(doc.recipient.email)}</p><p>Offered ${e(doc.offeredAt)}</p></section>`:""}
<section class="identity"><div><h2>${doc.customer.kind === "customer" ? "Customer" : "Prospect"}</h2><strong>${e(doc.customer.name || "Not linked")}</strong><p class="text">${e(address)}</p></div>
<div>${doc.site ? `<h2>Location</h2><strong>${e(doc.site.name)}</strong><p class="text">${e(doc.site.address)}</p>` : "<h2>Location</h2><p>Not linked</p>"}${doc.equipment ? `<h2>Equipment</h2><p>${e(doc.equipment.name)}</p><p>${e([doc.equipment.manufacturer,doc.equipment.model].filter(Boolean).join(" "))}</p><p>Serial: ${e(doc.equipment.serialNumber)}</p>` : ""}</div></section>
<p class="muted">${offered?"Issuer, recipient, customer, location and equipment were frozen when this revision was offered.":"Customer, location and equipment details reflect current linked records, not a frozen offered identity."}</p>
<h2>Scope</h2>${renderQuoteMarkdown(doc.scope)}
${doc.exclusions ? `<h2>Exclusions</h2>${renderQuoteMarkdown(doc.exclusions)}` : ""}
<h2>Pricing</h2><p class="muted">Quantities are per person for labor. The unit rate follows the tax treatment shown; net excludes tax. Inclusive rates already contain tax.</p>
<div class="scroll"><table><thead><tr><th>Description</th><th>Quantity</th><th>Unit rate</th><th>Discount</th><th>Net</th><th>Tax</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>
<dl><div><dt>Gross selling value</dt><dd>${e(money(doc.grossCents))}</dd></div><div><dt>Discounts</dt><dd>−${e(money(doc.discountCents))}</dd></div><div><dt>Net before tax</dt><dd>${e(money(doc.netCents))}</dd></div><div><dt>Tax</dt><dd>${e(money(doc.taxCents))}</dd></div><div class="total"><dt>Total</dt><dd>${e(money(doc.totalCents))}</dd></div></dl>
${offered?`<h2>Terms</h2><p class="text">${e(doc.issuer.terms)}</p><footer>This is the immutable document for offered revision ${e(doc.revision)}. Viewing or downloading it does not record delivery, acceptance, signature, payment or an order. Responses are retained separately against this exact offer.</footer>`:`<footer>This saved draft has not been offered or accepted. No customer delivery, signature, order or payment is recorded by viewing or downloading this copy. Prices and terms come from saved revision ${e(doc.revision)}; changes require another saved revision.</footer>`}
</main></body></html>`;
}

const DEFAULT_GENERAL_CONDITIONS = `THE FOLLOWING GENERAL CONDITIONS SHALL BE CONSIDERED A PART OF THIS CONTRACT:

1. Seller guarantees the equipment and workmanship of the apparatus furnished under this contact, and will replace or repair any defects not due to ordinary wear and tear, or to improper use of maintenance, which, may develop within one year from the date of completion. Seller further agrees to replace any refrigerant lost during that period, caused by defects in the installation and not due to improper use or maintenance.

2. Seller’s liability resulting from design, manufacture and erection of equipment, whether on warranties or otherwise, shall be limited to the cost of correcting defects in the installation, as further provided herein. In no event, shall Seller be liable for consequential damages.

3. Unless otherwise agreed, it is understood that work will be performed during regular working hours. If overtime work is mutually agreed upon and performed, the additional price, at Seller’s usual rates for such work shall be added to the contract price.

4. Buyer shall provide Seller’s workmen a safe place in which to work and Seller shall have the right to discontinue work when, in the Seller’s opinion this clause is being violated. Seller shall not be liable for any delay, loss or damage caused by such delay.

5. On delivery of equipment by the Seller, or any part thereof, to the premises of Buyer, Buyer shall assume risk of loss or damage to such equipment and shall cause same to be insured in all respects against loss or damage in an amount to protect interest of Seller. Cost of insurance is to be paid by Buyer.

6. In the event that the material incorporated in this contract is ready for delivery and installation, and Buyer is unable to receive same, Seller shall have the right to bill Buyer for the amount of the material in accordance with the terms of the contract and also to provide suitable storage and insurance at the Buyer’s risk and expense.

7. Seller shall not be held responsible or liable for any loss, damage, detention or delay caused by accidents, strikes lockouts or by any other cause which is unavoidable or beyond the Seller’s control.

8. Title to the equipment remains in Seller until payment of the entire purchase price and all sums due Seller under this contract are fully made. All equipment, whether affixed to the realty or not, shall remain personal property and be deemed severable without injury to the freehold. Buyer shall do whatever may be required to maintain Seller’s Title.

9. In the event of default of payment of any installment of failure to perform any terms or conditions of this contract, or in the event that a proceeding in bankruptcy or insolvency by instituted by or against Buyer, or if equipment is misused, illegally used, or imperiled, then at Seller’s option the entire unpaid balance shall become immediately due and payable without notice or demand and in such cases Seller may enter the premises and retake, remove and hold or resell the equipment or any part thereof at either private or public sale.
If the unpaid balance plus 1.5% * interest is not satisfied by the proceeds of such sale after deducting the expenses of retaking, repairs necessary to place the equipment in salable condition, storing, taxes, liens, attorney’s and collection agency’s fees and other expenses in connection therewith, Buyer shall pay any deficiency as liquidated damages for breach of this contract. Seller shall retain all lien rights upon premise on which the installation is made, to the extent of the unpaid balance, until final payment is made.

10. Should Seller be delayed by reason of any default on the part of the Buyer of the terms and conditions of this contract, the entire contract price, less payments therefore made, shall become due and shall bear interest from the date of bill as shown below.

11. Buyer shall be responsible for structural ability of the premises to contain the equipment in the manner and location specified in the contract or shown on drawings, and Seller shall not be liable for any failure, or damage resulting from such failure, of premises due to such structural deficiency.

12. Buyer shall keep equipment free from taxes and encumbrances, shall not remove said equipment from premises, without written permission of Seller and shall not transfer and interest in said equipment or in this contract without written consent of Seller until all payments due hereunder have been made.

13. Any price or prices herein set forth shall be increased in an amount or amounts equal to the tax or taxes which may be assessed on the equipment supplied hereunder, or which may be due or become due from seller or which Seller me be required to pay with respect to this contract as a result of any excise, sales use, occupation, or similar tax not now in effect but hereafter imposed or made effective by the United States Government or and state or local government.

14. Upon completion of the installation, Seller shall fully instruct the Buyer in regard to operation and maintenance. If for a period of ninety (90) days immediately after equipment supplied hereunder is installed, Buyer fails to notify Seller in writing of any claim that the said equipment as supplied does not fulfill the terms and conditions of this contract, specifying in what particulars if fails, this shall be an acknowledgment by Buyer that said equipment as supplied does fulfill said terms and conditions, and shall constitute a complete acceptance of the installation.

15. Buyer shall not assign this contract or any rights thereunder without Seller’s written consent.

16. This proposal when signed and accepted by the Buyer and approved by an authorized representative of Rays Heating and cooling. shall constitute exclusively the contract between the parties and all prior representations or agreements whether written or verbal, not incorporated herein are superseded.

17. This contract is not valid unless approved by duly authorized representative of Ray’s Heating and Cooling.

18. In case of default of any terms of this contract, the purchaser shall be liable for reasonable attorney’s fees and all costs of collection, including court costs.

19. * 1.5% interest per month.`;

/**
 * Customer-facing Proposal / Print-to-PDF HTML.
 * Includes Company Logo & info, Customer address & contact, full Markdown Scope & Exclusions,
 * and ONLY the customer Total Cost (hides all internal costs, labor/material breakdowns, and margins).
 */
export function renderCustomerProposalHtml(doc, { issuer = null, contact = null, autoPrint = false } = {}) {
  const e = escape;
  const address = [
    doc.customer.address,
    [doc.customer.city, doc.customer.state, doc.customer.zip].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join("\n");
  const companyName = issuer?.legalName || "Service Proposal";
  const logoHtml = issuer?.logoDataUrl
    ? `<img class="company-logo" src="${e(issuer.logoDataUrl)}" alt="${e(companyName)} logo">`
    : "";
  const hasTax = Number(doc.taxCents || 0) > 0;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(doc.identifier)} — ${e(doc.title)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#f3f5f8;color:#1b222c;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.no-print-bar{max-width:860px;margin:16px auto 0;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 16px;background:#1b222c;color:#fff;border-radius:10px;font-size:13px}
.no-print-btn{background:#0176d3;color:#fff;border:0;border-radius:6px;padding:8px 16px;font:600 13px/1 inherit;cursor:pointer}
.no-print-btn:hover{background:#015ba3}
main{max-width:860px;margin:16px auto 32px;background:#fff;padding:40px 44px;border:1px solid #dce1e8;border-radius:12px;box-shadow:0 6px 24px rgba(15,23,42,.06)}
.top-header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid #1b222c;padding-bottom:20px;margin-bottom:24px}
.brand{display:flex;flex-direction:column;gap:6px}
.company-logo{max-height:64px;max-width:240px;object-fit:contain;display:block;margin-bottom:4px}
.company-name{font-size:20px;font-weight:700;margin:0}
.company-meta{font-size:12px;color:#526071;white-space:pre-line;margin:0}
.quote-meta{text-align:right;font-size:13px}
.quote-badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#0176d3;background:#eef5fc;padding:4px 10px;border-radius:999px;margin-bottom:6px}
.quote-meta h1{font-size:22px;margin:2px 0 4px}
.quote-meta p{margin:2px 0;color:#526071}
.info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-bottom:26px;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px}
.info-grid h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 6px}
.info-grid strong{font-size:15px;display:block;margin-bottom:3px}
.info-grid p{margin:2px 0;font-size:13px;color:#334155;white-space:pre-line}
.section{margin:22px 0}
.section-title{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin:0 0 12px}
.qmd{overflow-wrap:anywhere;font-size:14px;line-height:1.6}
.qmd p{margin:6px 0}
.qmd .qmd-h1{font-size:16px;font-weight:700;margin:14px 0 6px;border-bottom:1px solid #e2e8f0;padding-bottom:3px}
.qmd .qmd-h2{font-size:15px;font-weight:600;margin:12px 0 5px}
.qmd .qmd-h3{font-size:14px;font-weight:600;margin:10px 0 4px;color:#475569}
.qmd ul,.qmd ol{margin:8px 0;padding-left:22px}
.qmd ul.qmd-dots{list-style-type:circle}
.qmd ul.qmd-checklist{list-style:none;padding-left:2px}
.qmd li.qmd-check{display:flex;align-items:flex-start;gap:8px;margin:4px 0}
.qmd .qmd-box-mark{font-size:15px;line-height:1.3}
.qmd .qmd-box{margin:10px 0;padding:10px 14px;border:1px solid #cbd5e1;border-left:4px solid #0176d3;border-radius:6px;background:#f8fafc}
.qmd .qmd-box p{margin:4px 0}
.qmd hr{border:0;border-top:1px solid #e2e8f0;margin:14px 0}
.qmd code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px}
.total-card{margin:28px 0;padding:20px 24px;border:2px solid #1b222c;border-radius:10px;background:#f8fafc;display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}
.total-label{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#475569;font-weight:700}
.total-sub{font-size:12px;color:#64748b;margin-top:4px}
.total-amount{font-size:30px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums}
.terms{font-size:12px;color:#475569;white-space:pre-wrap;margin:8px 0 0}
.general-conditions{margin-top:32px;padding-top:18px;border-top:2px solid #cbd5e1;break-before:page}
.general-conditions .terms{font-size:10.5px;line-height:1.45;color:#334155}
.sig-grid{display:grid;grid-template-columns:2fr 1.5fr 1fr;gap:24px;margin-top:36px;padding-top:12px}
.sig-line{border-top:1px solid #475569;padding-top:6px;font-size:12px;color:#475569}
@media print{
  body{background:#fff}
  .no-print-bar{display:none!important}
  main{margin:0;padding:0;border:0;box-shadow:none;max-width:none}
  .total-card,.sig-grid,.info-grid{break-inside:avoid}
}
@page{margin:14mm}
</style></head><body>
<div class="no-print-bar">
  <span>Customer Proposal · Internal costs &amp; line-item markups are hidden</span>
  <button type="button" class="no-print-btn" id="print-pdf-btn">Print / Save as PDF</button>
</div>
<main>
  <header class="top-header">
    <div class="brand">
      ${logoHtml}
      <h2 class="company-name">${e(companyName)}</h2>
      ${issuer ? `<p class="company-meta">${e([issuer.address, [issuer.phone, issuer.email].filter(Boolean).join(" · ")].filter(Boolean).join("\n"))}</p>` : ""}
    </div>
    <div class="quote-meta">
      <span class="quote-badge">Proposal / Quote</span>
      <h1>${e(doc.title)}</h1>
      <p><strong>Quote #:</strong> ${e(doc.identifier)} (Rev ${e(doc.revision)})</p>
      <p><strong>Date:</strong> ${e(doc.pricingDate)} · <strong>Valid Until:</strong> ${e(doc.validUntil)}</p>
    </div>
  </header>

  <section class="info-grid">
    <div>
      <h2>Prepared For</h2>
      <strong>${e(doc.customer.name || "Customer")}</strong>
      ${contact?.name ? `<p>Attn: ${e(contact.name)}</p>` : ""}
      ${address ? `<p>${e(address)}</p>` : ""}
      ${[contact?.phone, contact?.email].filter(Boolean).length ? `<p>${e([contact?.phone, contact?.email].filter(Boolean).join(" · "))}</p>` : ""}
    </div>
    <div>
      <h2>Service Location &amp; Equipment</h2>
      ${doc.site ? `<strong>${e(doc.site.name)}</strong><p>${e(doc.site.address)}</p>` : `<p>${address ? e(address) : "Same as billing address"}</p>`}
      ${doc.equipment ? `<p><strong>Equipment:</strong> ${e(doc.equipment.name)}${doc.equipment.manufacturer || doc.equipment.model ? ` (${e([doc.equipment.manufacturer, doc.equipment.model].filter(Boolean).join(" "))})` : ""}${doc.equipment.serialNumber ? ` · S/N: ${e(doc.equipment.serialNumber)}` : ""}</p>` : ""}
    </div>
  </section>

  <section class="section">
    <h2 class="section-title">Scope of Work</h2>
    ${renderQuoteMarkdown(doc.scope)}
  </section>

  ${doc.exclusions ? `<section class="section"><h2 class="section-title">Exclusions</h2>${renderQuoteMarkdown(doc.exclusions)}</section>` : ""}

  <section class="total-card">
    <div>
      <div class="total-label">Total Investment</div>
      ${hasTax ? `<div class="total-sub">Includes ${e(money(doc.taxCents))} applicable tax (Subtotal ${e(money(doc.netCents))})</div>` : `<div class="total-sub">Total price for the scope of work described above</div>`}
    </div>
    <div class="total-amount">${e(money(doc.totalCents))}</div>
  </section>

  ${issuer?.terms ? `<section class="section"><h2 class="section-title">Terms &amp; Conditions</h2><p class="terms">${e(issuer.terms)}</p></section>` : ""}

  <section class="sig-grid">
    <div class="sig-line">Authorized Customer Signature</div>
    <div class="sig-line">Printed Name</div>
    <div class="sig-line">Date</div>
  </section>

  <section class="section general-conditions">
    <h2 class="section-title">General Conditions</h2>
    <p class="terms">${e(DEFAULT_GENERAL_CONDITIONS)}</p>
  </section>
</main>
<script>
document.getElementById("print-pdf-btn")?.addEventListener("click", function(){ window.print(); });
${autoPrint ? 'window.addEventListener("load", function(){ setTimeout(function(){ window.print(); }, 250); });' : ""}
</script>
</body></html>`;
}
