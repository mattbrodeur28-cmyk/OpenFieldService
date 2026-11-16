import {useEffect,useState} from "preact/hooks";
import {accountRequest} from "../auth";
import {useConnectivity} from "../hooks/use-connectivity";
import {useGuardedCommand} from "../hooks/use-guarded-command";
import {scaledInput,scaledText} from "../quote-input.mjs";
import type {ReviewPolicy,ReviewPolicyPage,ReviewPolicyCommand} from "../review-types";
import {Dialog,DialogTitle} from "./ui/dialog";
import {Button} from "./ui/button";
import {TextField} from "./ui/input";
import {Checkbox,Notice,Textarea} from "./ui/surfaces";

function PolicyDialog({policy,close,saved}:{policy:ReviewPolicy|null;close():void;saved(policy:ReviewPolicy):void}){
  const {readOnly}=useConnectivity();
  const [margin,setMargin]=useState(policy?scaledText(policy.config.minimumMarginBasisPoints,2):""),[discount,setDiscount]=useState(policy?scaledText(policy.config.maximumDiscountBasisPoints,2):""),[all,setAll]=useState(policy?.config.requireApprovalForAll??true),[note,setNote]=useState("");
  const command=useGuardedCommand<ReviewPolicyCommand,{policy:ReviewPolicy}>("/api/sales/review-policy",result=>saved(result.policy));
  const disabled=command.busy||command.uncertain||readOnly;
  function submit(){
    try{
      if(note.trim().length<10)throw new Error("Record a review note of at least 10 characters.");
      void command.run({requestKey:crypto.randomUUID(),expectedVersion:policy?.version??0,config:{schemaVersion:1,minimumMarginBasisPoints:scaledInput(margin,2,"Minimum margin",10000),maximumDiscountBasisPoints:scaledInput(discount,2,"Maximum line discount",10000),requireApprovalForAll:all,reviewNote:note}});
    }catch(error){command.setError((error as Error).message);}
  }
  const attemptClose=()=>{if(command.canClose())close();};
  return <Dialog class="bid-review-dialog" close={attemptClose}>
    <DialogTitle>Company bid review policy</DialogTitle>
    <p class="workspace-help">Choose reviewed company limits. No policy is assumed until saved. Changing policy invalidates earlier manual approvals for current-rule review.</p>
    {command.error&&<Notice tone="danger">{command.error}</Notice>}
    {command.uncertain&&<Notice tone="warning">Save outcome uncertain. Editing is locked; retry the exact command before closing.</Notice>}
    <TextField label="Minimum gross margin (%)" value={margin} inputMode="decimal" disabled={disabled} onInput={event=>{command.changed();setMargin(event.currentTarget.value);}}/>
    <TextField label="Maximum per-line discount (%)" value={discount} inputMode="decimal" disabled={disabled} onInput={event=>{command.changed();setDiscount(event.currentTarget.value);}}/>
    <Checkbox label="Require manual approval for every saved quote" checked={all} disabled={disabled} onChange={event=>{command.changed();setAll(event.currentTarget.checked);}}/>
    <label class="ui-field">Policy review note<Textarea value={note} maxLength={2000} disabled={disabled} onInput={event=>{command.changed();setNote(event.currentTarget.value);}}/></label>
    <Notice>Zero-cost/no-charge lines and pricing-limit exceptions always require explicit administrator review, even if all-quote approval is off.</Notice>
    <div class="integration-actions"><Button disabled={command.busy||command.uncertain} onClick={attemptClose}>Cancel</Button><Button variant="primary" disabled={command.busy||readOnly} onClick={submit}>{command.uncertain?"Retry exact save":"Save policy version"}</Button></div>
  </Dialog>;
}
export function ReviewPolicySettings(){
  const {readOnly}=useConnectivity();
  const [data,setData]=useState<ReviewPolicyPage|null>(null),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[editing,setEditing]=useState(false),[error,setError]=useState("");
  useEffect(()=>{let active=true;setError("");void accountRequest<ReviewPolicyPage>("/api/sales/review-policy?page="+page).then(result=>{if(active)setData(result);}).catch(error=>{if(active)setError(error.message);});return()=>{active=false;};},[page,refresh]);
  return <section class="settings-card">
    <h3>Bid review and pricing approvals</h3>
    <p class="workspace-help">Versioned company controls for saved quote margin, line discounts and deliberate exceptions.</p>
    {error&&<Notice tone="danger">{error}</Notice>}
    {data&&(data.policy?<p>Policy v{data.policy.version} · Minimum margin {scaledText(data.policy.config.minimumMarginBasisPoints,2)}% · Maximum line discount {scaledText(data.policy.config.maximumDiscountBasisPoints,2)}% · {data.policy.config.requireApprovalForAll?"Every quote requires approval":"Within-limit quotes may qualify without a manual event"}</p>:<Notice tone="warning">Unconfigured: quote pricing is not yet qualified for offering.</Notice>)}
    <div class="integration-actions"><Button disabled={!data||readOnly} onClick={()=>setEditing(true)}>Configure policy</Button><Button onClick={()=>setRefresh(refresh+1)}>Refresh</Button></div>
    {data&&<details><summary>Policy history</summary>{data.history.map(row=><div key={row.version}><p>v{row.version} · Margin {scaledText(row.config.minimumMarginBasisPoints,2)}% · Line discount {scaledText(row.config.maximumDiscountBasisPoints,2)}%</p><p>{row.config.reviewNote}</p></div>)}<div class="integration-actions"><Button disabled={page===1} onClick={()=>setPage(page-1)}>Newer</Button><Button disabled={!data.hasMore} onClick={()=>setPage(page+1)}>Older</Button></div></details>}
    {editing&&data&&<PolicyDialog policy={data.policy} close={()=>setEditing(false)} saved={policy=>{window.dispatchEvent(new Event("ofs:sales-config-changed"));setEditing(false);setData({...data,policy});setRefresh(refresh+1);}}/>}
  </section>;
}
