import {useEffect,useState} from 'preact/hooks';
import {accountRequest} from '../auth';
import {useConnectivity} from '../hooks/use-connectivity';
import {useGuardedCommand} from '../hooks/use-guarded-command';
import type {Issuer,IssuerConfig,IssuerPage} from '../quote-lifecycle-types';
import {Dialog,DialogTitle} from './ui/dialog';
import {Button} from './ui/button';
import {TextField} from './ui/input';
import {Textarea,Notice} from './ui/surfaces';
function IssuerDialog({issuer,close,saved}:{issuer:Issuer|null;close():void;saved():void}){
 const {readOnly}=useConnectivity();
 const [config,setConfig]=useState<IssuerConfig>(issuer?.config??{schemaVersion:1,legalName:'',address:'',email:'',phone:'',terms:'',reviewNote:''});
 const command=useGuardedCommand<{requestKey:string;expectedVersion:number;config:IssuerConfig},{issuer:Issuer}>('/api/sales/quote-issuer',saved);
 const disabled=command.busy||command.uncertain||readOnly;
 const patch=(value:Partial<IssuerConfig>)=>{command.changed();setConfig(current=>({...current,...value}));};
 const attemptClose=()=>{if(command.canClose())close();};
 return <Dialog class="bid-review-dialog" close={attemptClose}>
  <DialogTitle>Quote issuer and terms</DialogTitle><p class="workspace-help">Review the business identity and terms that will be frozen into future offers. Earlier offers retain their own version.</p>
  {command.error&&<Notice tone="danger">{command.error}</Notice>}{command.uncertain&&<Notice tone="warning">Save outcome uncertain. Retry the exact command before closing.</Notice>}
  <TextField label="Legal business name" value={config.legalName} maxLength={200} disabled={disabled} onInput={e=>patch({legalName:e.currentTarget.value})}/>
  <label class="ui-field">Business address<Textarea value={config.address} maxLength={1000} disabled={disabled} onInput={e=>patch({address:e.currentTarget.value})}/></label>
  <TextField label="Business email" type="email" value={config.email} maxLength={254} disabled={disabled} onInput={e=>patch({email:e.currentTarget.value})}/>
  <TextField label="Business phone" value={config.phone} maxLength={80} disabled={disabled} onInput={e=>patch({phone:e.currentTarget.value})}/>
  <label class="ui-field">Quote terms<Textarea value={config.terms} maxLength={6000} disabled={disabled} onInput={e=>patch({terms:e.currentTarget.value})}/></label>
  <label class="ui-field">Internal review note<Textarea value={config.reviewNote} maxLength={2000} disabled={disabled} onInput={e=>patch({reviewNote:e.currentTarget.value})}/></label>
  <div class="integration-actions"><Button disabled={command.busy||command.uncertain} onClick={attemptClose}>Cancel</Button><Button variant="primary" disabled={command.busy||readOnly} onClick={()=>void command.run({requestKey:crypto.randomUUID(),expectedVersion:issuer?.version??0,config})}>{command.uncertain?'Retry exact save':'Save issuer version'}</Button></div>
 </Dialog>;
}
export function QuoteIssuerSettings(){
 const {readOnly}=useConnectivity();const [data,setData]=useState<IssuerPage|null>(null),[editing,setEditing]=useState(false),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[error,setError]=useState('');
 useEffect(()=>{let live=true;setError('');void accountRequest<IssuerPage>('/api/sales/quote-issuer?page='+page).then(data=>{if(live)setData(data);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[page,refresh]);
 return <section class="settings-card"><h3>Quote issuer and business terms</h3><p>Versioned legal business details and quote wording for frozen customer offers. Website branding remains separate.</p>
  {error&&<Notice tone="danger">{error}</Notice>}{data&&(data.issuer?<p>{data.issuer.config.legalName} · Version {data.issuer.version}</p>:<Notice tone="warning">Configure and review the issuer before offering a quote.</Notice>)}
  <div class="integration-actions"><Button disabled={!data||readOnly} onClick={()=>setEditing(true)}>Configure quote issuer</Button><Button onClick={()=>setRefresh(v=>v+1)}>Refresh</Button></div>
  {data&&<details><summary>Issuer history</summary>{data.history.map(row=><div key={row.version}><p>Version {row.version} · {row.config.legalName}</p><p>{row.config.reviewNote}</p></div>)}<div class="integration-actions"><Button disabled={page===1} onClick={()=>setPage(page-1)}>Newer</Button><Button disabled={!data.hasMore} onClick={()=>setPage(page+1)}>Older</Button></div></details>}
  {editing&&data&&<IssuerDialog issuer={data.issuer} close={()=>setEditing(false)} saved={()=>{window.dispatchEvent(new Event("ofs:sales-config-changed"));setEditing(false);setRefresh(v=>v+1);}}/>}
 </section>;
}
