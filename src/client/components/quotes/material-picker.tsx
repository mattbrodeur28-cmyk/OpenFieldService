import { useEffect, useId, useRef, useState } from "preact/hooks";
import { accountRequest } from "../../auth";
import type { LookupPage, MaterialCost } from "../../quote-types";
import { TextField } from "../ui/input";
import { Button } from "../ui/button";

/** Search native Inventory directly; selection never creates another material record. */
export function MaterialPicker({ opportunityId, index, material, disabled, change }: {
  opportunityId:string; index:number; material?:{id:string;name:string;unit?:string};
  disabled:boolean; change(row:MaterialCost):void;
}) {
  const id=useId(), root=useRef<HTMLDivElement>(null);
  const [search,setSearch]=useState(""),[open,setOpen]=useState(false),[page,setPage]=useState(1);
  const [rows,setRows]=useState<MaterialCost[]>([]),[total,setTotal]=useState(0),[active,setActive]=useState(-1),[loading,setLoading]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    let live=true;
    setRows([]);setActive(-1);setError("");
    if(!open||disabled||!opportunityId){setLoading(false);return;}
    setLoading(true);
    const timer=setTimeout(()=>{void accountRequest<LookupPage<MaterialCost>>("/api/sales/quotes/options?"+new URLSearchParams({kind:"materials",opportunityId,search,page:String(page)}))
      .then(data=>{if(live){setRows(data.rows);setTotal(data.total);}})
      .catch(error=>{if(live)setError(error.message);})
      .finally(()=>{if(live)setLoading(false);});},180);
    return()=>{live=false;clearTimeout(timer);};
  },[open,disabled,opportunityId,search,page]);
  useEffect(()=>{if(open&&active>=0)document.getElementById(`${id}-${active}`)?.scrollIntoView({block:"nearest"});},[id,open,active]);
  function select(row:MaterialCost){if(disabled||loading)return;change(row);setOpen(false);setSearch("");setPage(1);setActive(-1);}
  return <div class="quote-material-picker" ref={root} onBlur={event=>{if(!root.current?.contains(event.relatedTarget as Node|null))setOpen(false);}}>
    <TextField label={`Search Inventory materials for line ${index+1}`} placeholder="Type a material name to search…" hint={material?`Selected: ${material.name}${material.unit?` · ${material.unit}`:""}`:"Choose an existing Inventory item or use the unlisted material option below."}
      type="search" value={search} disabled={disabled} role="combobox" aria-autocomplete="list" aria-expanded={open&&!disabled} aria-controls={id} aria-activedescendant={open&&active>=0&&rows[active]?`${id}-${active}`:undefined} autoComplete="off"
      onFocus={()=>setOpen(true)} onInput={event=>{setSearch(event.currentTarget.value);setRows([]);setLoading(true);setActive(-1);setPage(1);setOpen(true);}}
      onKeyDown={event=>{
        if(event.isComposing)return;
        if(event.key==="Escape"&&open){event.preventDefault();event.stopPropagation();setOpen(false);return;}
        if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();setOpen(true);setActive(current=>rows.length?(event.key==="ArrowDown"?Math.min(current+1,rows.length-1):Math.max(current-1,0)):-1);}
        if(event.key==="Enter"&&open){event.preventDefault();if(active>=0&&rows[active])select(rows[active]);}
      }}/>
    {open&&!disabled&&<div class="quote-material-results">
      {loading&&<p role="status">Searching Inventory…</p>}{error&&<p role="alert">{error}</p>}
      {!loading&&!error&&!rows.length&&<p role="status">No matching Inventory materials. Use an unlisted material while sourcing this item.</p>}
      <div role="listbox" id={id} aria-label={`Inventory results for line ${index+1}`}>
        {rows.map((row,i)=><button type="button" role="option" id={`${id}-${i}`} aria-selected={i===active} tabIndex={-1} onPointerDown={event=>event.preventDefault()} class={i===active?"active":""} key={row.id} onClick={()=>select(row)}>
          <strong>{row.name}</strong><small>{row.unit} · {row.unitCostCents===null?"Stock cost unavailable":"Company stock cost available"}</small>
        </button>)}
      </div>
      <div class="quote-picker-pages"><Button disabled={loading||page===1} onClick={()=>setPage(page-1)}>Previous materials</Button><span>Page {page}</span><Button disabled={loading||page*25>=total} onClick={()=>setPage(page+1)}>Next materials</Button></div>
    </div>}
  </div>;
}
