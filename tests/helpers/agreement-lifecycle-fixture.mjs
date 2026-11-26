import { randomUUID } from 'node:crypto';
import { fixture, owner, member } from '../fixtures/service-execution.mjs';
import { createSales } from '../../src/server/sales/http.mjs';
import { createAgreementModule } from '../../src/server/agreements/http.mjs';
export const reason = 'Reviewed exact agreement source and external evidence';
export const config = { schemaVersion: 1, legalName: 'Fixture Mechanical', address: '1 Fixture Way', email: 'office@example.test', phone: '555-0101', terms: 'Reviewed fixture issuer terms.', reviewNote: 'Disposable issuer configuration for tests.' };
export function agreementLifecycleFixture(t) {
    const f = fixture(t), visit = f.visit(), job = f.db.prepare('SELECT customer_id,asset_id FROM jobs WHERE id=?').get(visit.id), asset = f.db.prepare('SELECT site_id FROM assets WHERE id=?').get(job.asset_id), sales = createSales({ storage: f.storage, owners: () => [owner, member], currentUser: () => owner });
    sales.quotes.lifecycle.issuer.save(owner, { requestKey: randomUUID(), expectedVersion: 0, config });
    let instant = new Date('2026-11-25T14:00:00Z'), actor = owner;
    const module = createAgreementModule({ storage: f.storage, currentUser: () => actor, issuer: () => sales.issuer(), timeZone: () => 'America/New_York', clock: () => new Date(instant) }), a = module.agreements, draft = { id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, customerId: job.customer_id, title: 'Proposed maintenance agreement', scope: 'Inspect selected native equipment', exclusions: 'Emergency calls excluded', terms: 'Reviewed proposed annual scope', documentReference: '', startsOn: '2027-01-01', endsOn: '2027-12-31', renewalPolicy: 'manual_review', priceCents: 10000, currency: 'USD', billingFrequency: 'annual', siteIds: [asset.site_id], assetIds: [job.asset_id], archived: false, reason };
    a.save(owner, draft);
    a.uploadDocument(owner, draft.id, { id: randomUUID(), requestKey: randomUUID(), expectedVersion: 1, title: 'Proposed source', reason, reviewAttested: true }, Buffer.from('%PDF-1.4\nProposed source\n%%EOF'), 'contract.pdf');
    for (const [action, sequence] of [['submit', 0], ['approve', 1]])
        a.review(owner, draft.id, { id: randomUUID(), requestKey: randomUUID(), expectedVersion: 1, expectedReviewSequence: sequence, action, reason, reviewAttested: true });
    const offer = () => { const state = a.lifecycle.summary(owner, draft.id); return { id: randomUUID(), requestKey: randomUUID(), expectedVersion: state.version, expectedReviewSequence: state.reviewSequence, expectedIssuerVersion: state.issuer.version, expectedSourceHash: state.sourceHash, validUntil: '2026-11-26', recipient: { name: 'Customer recipient', email: 'customer@example.test' }, reason, reviewAttested: true }; };
    const response = (action, patch = {}) => { const current = a.lifecycle.summary(owner, draft.id).offer; return { id: randomUUID(), requestKey: randomUUID(), offerId: current.id, expectedSequence: current.sequence, action, reason, ...(['delivered', 'accepted', 'declined'].includes(action) ? { occurredAt: instant.toISOString(), evidenceReference: 'Private external evidence archive reference', attested: true, ...(action === 'delivered' ? { method: 'email' } : { respondent: { name: 'Customer signatory', email: 'signatory@example.test' }, capacity: 'Authorized facilities representative', authorityReference: 'Reviewed written authority reference' }) } : {}), ...patch }; };
    return { ...f, a, app: module.app, setActor: user => { actor = user; }, sales, draft, offer, response, setTime: value => { instant = new Date(value); } };
}
