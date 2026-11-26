import { useEffect, useRef, useState } from "preact/hooks";
import { Plus, TrendingUp, UserPlus } from "lucide-preact";
import { useApp } from "../context";
import { CreateCustomer } from "./create-customer";

// Salesforce Global Action: create a record from anywhere in the app.
export function QuickCreate() {
  const { navigate } = useApp();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div class="quick-create" ref={boxRef}>
      <button class="btn-icon" aria-label="Create record" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Plus size={18} />
      </button>
      {open && (
        <div class="quick-create-menu" role="menu">
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setCreating(true);
            }}
          >
            <UserPlus size={15} /> New Customer
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate("/sales?new=1");
            }}
          >
            <TrendingUp size={15} /> New Opportunity
          </button>
        </div>
      )}
      {creating && <CreateCustomer onClose={() => setCreating(false)} />}
    </div>
  );
}
