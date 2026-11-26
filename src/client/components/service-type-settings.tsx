import { useState } from "preact/hooks";
import { ServiceTypeList } from "./service-type-list";
import { Dialog, DialogTitle } from "./ui/dialog";

/** Service types live under Settings; the Field Service nav no longer shows them. */
export function ServiceTypesSettings() {
  const [open, setOpen] = useState(false);
  return (
    <section class="settings-card">
      <h3>Service types</h3>
      <p>Configure the services technicians deliver, with default duration, price and color.</p>
      <button class="btn" onClick={() => setOpen(true)}>Manage service types</button>
      {open && (
        <Dialog class="service-type-dialog" close={() => setOpen(false)}>
          <DialogTitle>Service types</DialogTitle>
          <ServiceTypeList />
        </Dialog>
      )}
    </section>
  );
}
