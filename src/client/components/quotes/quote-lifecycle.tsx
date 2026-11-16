import {useEffect,useState} from 'preact/hooks';
import {accountRequest,isAdministrator,useAccount} from '../../auth';
import {useConnectivity} from '../../hooks/use-connectivity';
import {useCompanyTimeZone} from '../../hooks/use-company-timezone';
import {useGuardedCommand} from '../../hooks/use-guarded-command';
import {formatTimestamp,localInput,resolveLocal} from '../../time-format';
import {quoteMoney} from '../../quote-input.mjs';
import type {QuoteLifecycle,LifecycleAction} from '../../quote-lifecycle-types';
import {Dialog,DialogTitle} from '../ui/dialog';
import {Button} from '../ui/button';
import {TextField} from '../ui/input';
import {Select} from '../ui/select';
import {Card,Notice,Checkbox,Textarea,Badge} from '../ui/surfaces';
import {QuoteDocumentPreview} from './document-preview';
const titles:Record<LifecycleAction,string>={offer:'Offer reviewed revision',delivered:'Record external delivery',accepted:'Record external acceptance',declined:'Record external decline',expire:'Record expired offer',withdraw:'Withdraw offer',revise:'Create a new draft revision'};
function LifecycleDialog({data,action,close,saved}:{data:QuoteLifecycle;action:LifecycleAction;close():void;saved():void}){
 const company=useCompanyTimeZone(),{readOnly}=useConnectivity();
 const [name,setName]=useState(action==='offer'?data.readiness.suggestedRecipient.name:data.offer?.document.recipient?.name??''),[email,setEmail]=useState(action==='offer'?data.readiness.suggestedRecipient.email:data.offer?.document.recipient?.email??'');
 const [note,setNote]=useState(''),[reference,setReference]=useState(''),[capacity,setCapacity]=useState(''),[attested,setAttested]=useState(false),[method,setMethod]=useState('email'),[now,setNow]=useState(true),[occurred,setOccurred]=useState('');
 const command=useGuardedCommand<Record<string,unknown>,{lifecycle:QuoteLifecycle}>(`/api/sales/quotes/${data.quoteId}/lifecycle`,saved);
 const disabled=command.busy||command.uncertain||readOnly,external=['delivered','accepted','declined'].includes(action),response=['accepted','declined'].includes(action);
 const attemptClose=()=>{if(command.canClose())close();};
 const change=(run:()=>void)=>{command.changed();run();};
 function submit(){
  if(note.trim().length<10){command.setError('Record a review note of at least 10 characters.');return;}
  if(external&&(!attested||reference.trim().length<10)){command.setError('Review the external evidence, enter its reference, and confirm the attestation.');return;}
  const value:Record<string,unknown>={id:crypto.randomUUID(),requestKey:crypto.randomUUID(),expectedQuoteVersion:data.headVersion,expectedEventSequence:data.eventSequence,action,note};
  if(action==='offer')Object.assign(value,{expectedOpportunityVersion:data.readiness.opportunityVersion,expectedIssuerVersion:data.readiness.issuer?.version,expectedPolicyVersion:data.readiness.policyVersion,expectedReviewSequence:data.readiness.reviewSequence,recipient:{name,email}});
  else value.offerId=data.offer?.id;
  if(external){
   try{Object.assign(value,{occurredAt:now?new Date().toISOString():resolveLocal(occurred,'',company.timeZone??'UTC'),evidenceReference:reference,attested});}catch(e){command.setError((e as Error).message);return;}
   if(action==='delivered')value.method=method;else Object.assign(value,{respondent:{name,email},capacity});
  }
  void command.run(value);
 }
 return <Dialog class="bid-review-dialog" close={attemptClose}>
  <DialogTitle>{titles[action]}</DialogTitle><p class="workspace-help">Revision {data.revision} · {quoteMoney(data.totalCents)} · Valid until {data.validUntil}</p>
  {command.error&&<Notice tone="danger">{command.error}</Notice>}{command.uncertain&&<Notice tone="warning">Outcome uncertain. Editing is locked; retry the exact command before closing.</Notice>}
  {action==='offer'&&<><Notice>Freeze the reviewed document for this recipient. This does not send email or record delivery or acceptance.</Notice><details><summary>Issuer and terms being frozen</summary><p>{data.readiness.issuer?.legalName}</p><p class="quote-document-text">{data.readiness.issuer?.address}</p><p class="quote-document-text">{data.readiness.issuer?.terms}</p></details></>}
  {(action==='offer'||response)&&<><TextField label={response?'Respondent name':'Recipient name'} value={name} maxLength={200} disabled={disabled} onInput={e=>change(()=>setName(e.currentTarget.value))}/><TextField label={response?'Respondent email':'Recipient email'} type="email" value={email} maxLength={254} disabled={disabled} onInput={e=>change(()=>setEmail(e.currentTarget.value))}/></>}
  {response&&<TextField label="Respondent authority / capacity" value={capacity} maxLength={200} disabled={disabled} onInput={e=>change(()=>setCapacity(e.currentTarget.value))}/>}
  {external&&<>
   <Notice>Record evidence you have already received outside the app. This is a staff attestation, not an electronically verified signature or an automated delivery receipt.</Notice>
   {action==='delivered'&&<Select label="Delivery method" value={method} disabled={disabled} options={[{value:'email',label:'Email'},{value:'hand_delivery',label:'Hand delivery'},{value:'portal',label:'External portal'},{value:'other',label:'Other'}]} onValueChange={v=>change(()=>setMethod(v))}/>}
   <TextField label="Evidence reference" hint="Reference the retained email, signed document or external archive. Nothing is fetched or sent." value={reference} maxLength={2000} disabled={disabled} onInput={e=>change(()=>setReference(e.currentTarget.value))}/>
   <Checkbox label="The event happened now" checked={now} disabled={disabled} onChange={e=>change(()=>{setNow(e.currentTarget.checked);if(company.timeZone)setOccurred(localInput(new Date().toISOString(),company.timeZone));})}/>
   {!now&&<TextField label="Event date and time" type="datetime-local" value={occurred} disabled={disabled||!company.timeZone} onInput={e=>change(()=>setOccurred(e.currentTarget.value))} hint="Uses Company Settings. For repeated daylight-saving times, use an unambiguous time."/>}
   <Checkbox label="I reviewed external evidence for this exact offered revision and the respondent’s authority where applicable." checked={attested} disabled={disabled} onChange={e=>change(()=>setAttested(e.currentTarget.checked))}/>
  </>}
  {action==='revise'&&<Notice>The existing offer is superseded. Its document and evidence stay retained. A copied draft needs its own current pricing review before it can be offered.</Notice>}
  {action==='withdraw'&&<Notice tone="warning">This closes the offer internally. Notify the customer through your normal channel; this action sends no message.</Notice>}
  <label class="ui-field">Review note<Textarea value={note} maxLength={2000} disabled={disabled} onInput={e=>change(()=>setNote(e.currentTarget.value))}/></label>
  <div class="quote-actions"><Button disabled={command.busy||command.uncertain} onClick={attemptClose}>Cancel</Button><Button variant="primary" disabled={command.busy||readOnly} onClick={submit}>{command.uncertain?'Retry exact command':titles[action]}</Button></div>
 </Dialog>;
}
export function QuoteLifecyclePanel({id,revision,disabled,reloaded,refreshKey=0}:{id:string;revision:number;disabled:boolean;reloaded():void;refreshKey?:number}){
 const {user}=useAccount(),{readOnly}=useConnectivity(),company=useCompanyTimeZone();
 const [data,setData]=useState<QuoteLifecycle|null>(null),[error,setError]=useState(''),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[action,setAction]=useState<LifecycleAction|null>(null),[document,setDocument]=useState(false);
 useEffect(()=>{let live=true;setData(null);setError('');void accountRequest<QuoteLifecycle>(`/api/sales/quotes/${id}/lifecycle?revision=${revision}&page=${page}`).then(data=>{if(live)setData(data);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[id,revision,page,refresh,refreshKey]);
 useEffect(()=>{const changed=()=>{if(!action)setRefresh(value=>value+1);};window.addEventListener("ofs:sales-config-changed",changed);return()=>window.removeEventListener("ofs:sales-config-changed",changed);},[action]);
 const editable=!!data&&data.revision===data.headVersion&&!disabled&&!readOnly,admin=isAdministrator(user);
 return <Card><header class="quote-header"><h2>Offer and customer response</h2><Button disabled={!!action} onClick={()=>setRefresh(v=>v+1)}>Refresh</Button></header>
  {error&&<Notice tone="danger">{error}</Notice>}{data&&<>
   <Badge tone={data.state==='accepted'?'success':'info'}>{data.state.replaceAll('_',' ')}</Badge>
   {data.offer?<><p class="workspace-help">Offered revision {data.offer.revision} · {formatTimestamp(data.offer.offeredAt,company.timeZone??undefined)}</p><p>{data.offer.document.recipient?.name} · {data.offer.document.recipient?.email}</p><Button disabled={disabled} onClick={()=>setDocument(true)}>View frozen offer document</Button></>:<><p class="workspace-help">Freeze the exact reviewed document before recording delivery or a response.</p>{data.readiness.blockers.map(reason=><p class="workspace-help" key={reason}>{reason}</p>)}</>}
   <div class="quote-actions">
    {!data.offer&&<Button disabled={!editable||!data.readiness.canOffer} onClick={()=>setAction('offer')}>Offer reviewed revision</Button>}
    {data.offer&&data.quoteStatus==='offered'&&data.state==='offered'&&<><Button disabled={!editable} onClick={()=>setAction('delivered')}>Record delivery</Button>{admin&&<><Button disabled={!editable} onClick={()=>setAction('accepted')}>Record acceptance</Button><Button disabled={!editable} onClick={()=>setAction('declined')}>Record decline</Button><Button disabled={!editable} onClick={()=>setAction('withdraw')}>Withdraw offer</Button></>}</>}
    {data.offer&&data.quoteStatus==='offered'&&data.state==='expired'&&<Button disabled={!editable} onClick={()=>setAction('expire')}>Record expiry</Button>}
    {data.offer&&['offered','declined','expired','void'].includes(data.quoteStatus)&&<Button disabled={!editable} onClick={()=>setAction('revise')}>New draft revision</Button>}
   </div>
   <details><summary>Lifecycle evidence for this revision</summary>{data.history.map(row=><div class="quote-summary-line" key={row.id}><strong>{titles[row.action]}</strong><small>{formatTimestamp(row.recordedAt,company.timeZone??undefined)} · Actor {row.actorId}</small><p>{row.note}</p>{row.evidence.evidenceReference&&<p>{row.evidence.evidenceReference}</p>}</div>)}<div class="quote-actions"><Button disabled={page===1} onClick={()=>setPage(page-1)}>Newer</Button><Button disabled={!data.hasMore} onClick={()=>setPage(page+1)}>Older</Button></div></details>
   <p class="workspace-help">External communication and signature verification are separate. Acceptance does not create a job or purchase order.</p>
  </>}
  {data&&action&&<LifecycleDialog data={data} action={action} close={()=>setAction(null)} saved={()=>{setAction(null);setRefresh(v=>v+1);reloaded();}}/>}
  {document&&data?.offer&&<QuoteDocumentPreview id={id} revision={revision} offered close={()=>setDocument(false)}/>}
 </Card>;
}
