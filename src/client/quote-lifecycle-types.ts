import type {CustomerQuoteDocument} from './quote-types';
export interface IssuerConfig {schemaVersion:1;legalName:string;address:string;email:string;phone:string;terms:string;reviewNote:string}
export interface Issuer {version:number;actorId:string;config:IssuerConfig;savedAt:string}
export interface IssuerPage {issuer:Issuer|null;history:Issuer[];page:number;hasMore:boolean}
export interface PublicIssuer {version:number;legalName:string;address:string;email:string;phone:string;terms:string}
export interface Recipient {name:string;email:string}
export type LifecycleAction='offer'|'delivered'|'accepted'|'declined'|'expire'|'withdraw'|'revise';
export interface QuoteLifecycle {
 quoteId:string;headVersion:number;quoteStatus:string;revision:number;eventSequence:number;state:string;companyDate:string;totalCents:number|null;validUntil:string;
 offer:{id:string;revision:number;issuerVersion:number;offeredAt:string;documentHash:string;htmlHash:string;document:CustomerQuoteDocument}|null;
 readiness:{canOffer:boolean;blockers:string[];opportunityVersion:number;issuer:PublicIssuer|null;policyVersion:number|null;reviewSequence:number;suggestedRecipient:Recipient};
 history:{id:string;sequence:number;revision:number;offerId:string;actorId:string;action:LifecycleAction;evidence:{evidenceReference?:string;occurredAt?:string;respondent?:Recipient;capacity?:string};note:string;recordedAt:string}[];
 page:number;hasMore:boolean;
}
