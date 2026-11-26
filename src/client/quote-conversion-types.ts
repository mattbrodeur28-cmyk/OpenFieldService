export interface NativeChoice {
    id: string;
    name: string;
}
export interface QuoteConversion {
    id: string;
    quoteId: string;
    revision: number;
    opportunityId: string;
    offerId: string;
    acceptanceEventId: string;
    createdAt: string;
    job: {
        id: string;
        identifier: string;
        status: string;
        technicianId: string | null;
        planningDate: string;
        scheduledTime: string;
        durationMinutes: number;
        scheduleVersion: number | null;
    };
}
export interface ConversionSummary {
    quoteId: string;
    conversion: QuoteConversion | null;
    opportunityConversion: QuoteConversion | null;
    canConvert: boolean;
    blockers: string[];
    cancellationBlocker: string | null;
    conversionHistory: {
        id: string;
        action: string;
        note: string;
        actorId: string;
        createdAt: string;
    }[];
    expectedQuoteVersion: number;
    expectedEventSequence: number;
    expectedOpportunityVersion: number;
    offerId: string | null;
    acceptanceEventId: string | null;
    nativeLinks: {
        customerId: string | null;
        siteId: string | null;
        assetId: string | null;
    };
    selected: {
        customer: NativeChoice | null;
        site: NativeChoice | null;
        asset: NativeChoice | null;
    };
    acceptedDocument: {
        title: string;
        scope: string;
        customerName: string;
        siteName: string | null;
        totalCents: number;
    } | null;
    jobHandoffAvailable: boolean;
}
