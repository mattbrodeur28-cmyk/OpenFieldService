import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../../auth";
import type { CustomerQuoteDocument } from "../../quote-types";
import { quoteMoney as salesMoney } from "../../quote-input.mjs";
import { estimateLabels } from "../../estimating-types";
import { Dialog, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge, LoadingState, Notice, Table } from "../ui/surfaces";

export function QuoteDocumentPreview({ id, revision, close, offered=false }: { id: string; revision: number; close(): void; offered?:boolean }) {
  const [data, setData] = useState<CustomerQuoteDocument | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    void accountRequest<{ document: CustomerQuoteDocument }>(
      `/api/sales/quotes/${id}/${offered?"offer-document":"document"}?revision=${revision}`,
    ).then(result => { if (active) setData(result.document); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id, revision, offered]);
  return <Dialog class="quote-document-dialog" close={close}>
    <header class="quote-header">
      <div><DialogTitle>Quote document preview</DialogTitle><p class="workspace-help">Saved revision {revision} · {offered?"Frozen offer":"Internal review"}</p></div>
      <div class="quote-actions">
        {data && <a class="btn" href={`/api/sales/quotes/${id}/${offered?"offer-document":"document"}.html?revision=${revision}`} download>Download {offered?"offer":"draft"} HTML</a>}
        <Button onClick={close}>Close</Button>
      </div>
    </header>
    {error && <Notice tone="danger">{error}</Notice>}
    {!data && !error && <LoadingState label="Loading saved quote document…"/>}
    {data && <article class="quote-document">
      <Badge tone={offered?"info":"warning"}>{offered?"Frozen offered document":"Draft · Not offered or accepted"}</Badge>
      {offered&&data.issuer&&<section><h3>Issued by</h3><strong>{data.issuer.legalName}</strong><p class="quote-document-text">{data.issuer.address}</p><p>{data.issuer.email} · {data.issuer.phone}</p><h3>Recipient</h3><p>{data.recipient?.name} · {data.recipient?.email}</p></section>}
      <h2>{data.title}</h2><p>{data.identifier} · Revision {data.revision}</p>
      <p class="workspace-help">Pricing date {data.pricingDate} · Valid until {data.validUntil} · USD</p>
      <div class="quote-document-identity">
        <section><h3>{data.customer.kind === "customer" ? "Customer" : "Prospect"}</h3><strong>{data.customer.name || "Not linked"}</strong>
          <p class="quote-document-text">{data.customer.address}</p><p>{[data.customer.city,data.customer.state,data.customer.zip].filter(Boolean).join(" ")}</p></section>
        <section><h3>Location</h3><strong>{data.site?.name || "Not linked"}</strong><p class="quote-document-text">{data.site?.address}</p>
          {data.equipment && <><h3>Equipment</h3><p>{data.equipment.name}</p><p>{[data.equipment.manufacturer,data.equipment.model].filter(Boolean).join(" ")}</p><p>Serial: {data.equipment.serialNumber}</p></>}</section>
      </div>
      <Notice>{offered?"Business identity, recipient, customer, location and equipment were frozen when this revision was offered.":"Customer, location and equipment details reflect current linked records. Prices and terms come from this saved revision; no offered identity has been frozen."}</Notice>
      <h3>Scope</h3><p class="quote-document-text">{data.scope}</p>
      {data.exclusions && <><h3>Exclusions</h3><p class="quote-document-text">{data.exclusions}</p></>}
      <h3>Pricing</h3><p class="workspace-help">Labor quantities are per person. Unit rates follow the shown tax treatment; net excludes tax. Inclusive rates already contain tax.</p>
      <Table label={offered?"Offered quote prices":"Customer quote draft prices"}><thead><tr><th>Description</th><th>Quantity</th><th>Unit rate</th><th>Discount</th><th>Net</th><th>Tax</th><th>Total</th></tr></thead>
        <tbody>{data.lines.map((line,index) => <tr key={index}>
          <td><strong>{line.description}</strong><small>{estimateLabels[line.kind]}{line.laborRate?` · ${line.laborRate.toUpperCase()}`:""}</small>{!!line.miscCents&&<small>Includes {salesMoney(line.miscCents)} miscellaneous charge before discount</small>}</td>
          <td>{(line.quantityMilli/1000).toFixed(3)}{line.headcount>1 ? ` × ${line.headcount} people` : ""}</td>
          <td>{salesMoney(line.unitSellCents)}<small>{line.taxTreatment.replaceAll("_", " ")}</small></td>
          <td>{salesMoney(line.discountCents)}</td><td>{salesMoney(line.netCents)}</td>
          <td>{salesMoney(line.taxCents)}<small>{(line.taxRateBasisPoints/100).toFixed(2)}%</small></td>
          <td>{salesMoney(line.totalCents)}</td>
        </tr>)}</tbody></Table>
      <dl class="quote-document-totals">
        <div><dt>Gross selling value</dt><dd>{salesMoney(data.grossCents)}</dd></div>
        <div><dt>Discounts</dt><dd>−{salesMoney(data.discountCents)}</dd></div>
        <div><dt>Net before tax</dt><dd>{salesMoney(data.netCents)}</dd></div>
        <div><dt>Tax</dt><dd>{salesMoney(data.taxCents)}</dd></div>
        <div class="quote-document-total"><dt>Total</dt><dd>{salesMoney(data.totalCents)}</dd></div>
      </dl>
      {offered&&data.issuer&&<><h3>Terms</h3><p class="quote-document-text">{data.issuer.terms}</p></>}
      <Notice>Viewing or downloading this {offered?"offer":"draft"} does not record customer delivery, acceptance, an order or a payment.</Notice>
    </article>}
  </Dialog>;
}
