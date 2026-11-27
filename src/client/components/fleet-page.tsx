import { businessModules } from '../business-modules';
import { ModuleOverview } from './module-overview';
import { StockInventoryPage } from './inventory-page';
import { useAccount } from '../auth';
import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../auth";
import { useApp } from "../context";
import { useConnectivity } from "../hooks/use-connectivity";
import {
  scaledQuantity,
  type StockOptions,
  type StockLocation,
} from "../inventory-types";
import {
  distanceLabel,
  type Vehicle,
  type Maintenance,
  type FleetList,
  type FleetDetail,
} from "../fleet-types";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { DialogTitle } from "./ui/dialog";
import {
  Badge,
  Checkbox,
  EmptyState,
  Notice,
  Sheet,
  Table,
} from "./ui/surfaces";
const money = (cents: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
const tone = (state: string) =>
  state === "overdue" ? "danger" : state === "due" ? "warning" : "neutral";
export function FleetVehicles() {
  const { navigate } = useApp(),
    { readOnly } = useConnectivity();
  const [list, setList] = useState<FleetList | null>(null),
    [detail, setDetail] = useState<FleetDetail | null>(null);
  const [selected, setSelected] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [edit, setEdit] = useState<Vehicle | "new" | null>(null),
    [plan, setPlan] = useState<Maintenance | "new" | null>(null),
    [service, setService] = useState<Maintenance | null>(null);
  useEffect(() => {
    let live = true;
    setError("");
    void accountRequest<FleetList>("/api/service/fleet")
      .then((data) => {
        if (!live) return;
        setList(data);
        setSelected((current) =>
          data.vehicles.some((v) => v.id === current)
            ? current
            : data.vehicles[0]?.id || "",
        );
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [revision]);
  useEffect(() => {
    let live = true;
    setDetail(null);
    if (selected)
      void accountRequest<FleetDetail>(
        "/api/service/fleet/" + selected + "?page=" + page,
      )
        .then((data) => {
          if (live) setDetail(data);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [selected, page, revision]);
  const saved = () => {
    setEdit(null);
    setPlan(null);
    setService(null);
    setNotice("Fleet change saved.");
    setRevision((n) => n + 1);
  };
  return (
    <div class="page fleet-page">
      <header class="dispatch-title">
        <h1>Fleet</h1>
        <div class="inventory-toolbar">
          <Button onClick={() => setRevision((n) => n + 1)}>Refresh</Button>
          {list?.canManage && (
            <Button
              variant="primary"
              disabled={readOnly}
              onClick={() => setEdit("new")}
            >
              Add vehicle
            </Button>
          )}
        </div>
      </header>
      <p class="workspace-help">
        Vehicles, technician custody and maintenance. Truck inventory stays
        connected to the shared stock ledger.
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      {notice && (
        <Notice tone="success" close={() => setNotice("")}>
          {notice}
        </Notice>
      )}
      {list && !list.vehicles.length && (
        <EmptyState title="No vehicles available">
          {list.canManage
            ? "Create a truck stock location in Inventory, then link a vehicle here."
            : "Assigned vehicles will appear here."}
          {list.canManage && (
            <Button onClick={() => navigate("/inventory")}>
              Open inventory
            </Button>
          )}
        </EmptyState>
      )}
      {list && list.vehicles.length > 0 && (
        <Table label="Business vehicles">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Assigned technician</th>
              <th>Odometer</th>
              <th>Maintenance</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {list.vehicles.map((v) => {
              const due =
                v.maintenance?.filter((p) =>
                  ["due", "overdue"].includes(p.reminder_status),
                ) || [];
              return (
                <tr key={v.id}>
                  <td>
                    <strong>{v.fleet_number}</strong>
                    <small class="workspace-help">
                      {" "}
                      {v.make} {v.model} · {v.plate || "No plate recorded"}
                    </small>
                  </td>
                  <td>{v.technician_name || "Company custody"}</td>
                  <td>{distanceLabel(v.odometer_tenths, v.distance_unit)}</td>
                  <td>
                    {due.length ? (
                      <Badge
                        tone={
                          due.some((p) => p.reminder_status === "overdue")
                            ? "danger"
                            : "warning"
                        }
                      >
                        {due.length} due / overdue
                      </Badge>
                    ) : (
                      <span class="workspace-help">
                        {v.maintenance?.some((p) => p.active)
                          ? "Upcoming"
                          : "No active reminders"}
                      </span>
                    )}
                  </td>
                  <td>
                    <Badge>{v.status.replaceAll("_", " ")}</Badge>
                  </td>
                  <td>
                    <Button
                      aria-pressed={selected === v.id}
                      onClick={() => {
                        setSelected(v.id);
                        setPage(1);
                      }}
                    >
                      View {v.fleet_number}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {detail && (
        <section class="sales-details">
          <header class="dispatch-title">
            <div>
              <h2>{detail.vehicle.fleet_number} · Maintenance &amp; history</h2>
              <p class="workspace-help">
                {detail.vehicle.location_name} ·{" "}
                {detail.vehicle.technician_name || "Company custody"} ·{" "}
                {distanceLabel(
                  detail.vehicle.odometer_tenths,
                  detail.vehicle.distance_unit,
                )}
              </p>
            </div>
            <div class="inventory-toolbar">
              <Button
                onClick={() =>
                  navigate("/fleet/" + detail.vehicle.location_id)
                }
              >
                Vehicle inventory
              </Button>
              {detail.canManage && (
                <>
                  <Button
                    disabled={readOnly}
                    onClick={() => setEdit(detail.vehicle)}
                  >
                    Edit vehicle / assignment
                  </Button>
                  <Button
                    disabled={readOnly || detail.vehicle.status === "retired"}
                    onClick={() => setPlan("new")}
                  >
                    Add maintenance reminder
                  </Button>
                </>
              )}
            </div>
          </header>
          {!detail.maintenance.length ? (
            <EmptyState title="No maintenance reminders">
              Add a due date, odometer threshold, or both.
            </EmptyState>
          ) : (
            <Table label="Vehicle maintenance reminders">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Due</th>
                  <th>Reminder</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {detail.maintenance.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>
                      {p.due_date || "No date"}
                      {p.due_odometer_tenths !== null &&
                        " · " +
                          distanceLabel(
                            p.due_odometer_tenths,
                            detail.vehicle.distance_unit,
                          )}
                    </td>
                    <td>
                      <Badge tone={tone(p.reminder_status)}>
                        {p.reminder_status}
                      </Badge>
                    </td>
                    <td>
                      {detail.canManage && (
                        <div class="inventory-toolbar">
                          <Button
                            disabled={readOnly}
                            onClick={() => setPlan(p)}
                          >
                            Edit reminder
                          </Button>
                          <Button
                            disabled={
                              readOnly ||
                              !p.active ||
                              detail.vehicle.status === "retired"
                            }
                            onClick={() => setService(p)}
                          >
                            Record service
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p class="workspace-help">
            Reminders appear here using the company date and the latest recorded
            odometer. Email delivery and GPS mileage feeds are not configured in
            this pilot.
          </p>
          <h3>Service history</h3>
          {!detail.history.length ? (
            <p class="workspace-help">
              No completed vehicle services recorded.
            </p>
          ) : (
            <Table label="Completed vehicle service">
              <thead>
                <tr>
                  <th>Service date</th>
                  <th>Odometer</th>
                  <th>Cost</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {detail.history.map((row) => (
                  <tr key={row.id}>
                    <td>{row.service_date}</td>
                    <td>
                      {distanceLabel(
                        row.odometer_tenths,
                        detail.vehicle.distance_unit,
                      )}
                    </td>
                    <td>{money(row.cost_cents)}</td>
                    <td>{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div class="inventory-toolbar">
            <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous services
            </Button>
            <span>Page {page}</span>
            <Button
              disabled={!detail.hasMoreHistory}
              onClick={() => setPage(page + 1)}
            >
              Next services
            </Button>
          </div>
        </section>
      )}
      {edit && (
        <VehicleForm
          vehicle={edit === "new" ? null : edit}
          disabled={readOnly}
          close={() => setEdit(null)}
          saved={saved}
        />
      )}
      {plan && detail && (
        <MaintenanceForm
          vehicle={detail.vehicle}
          plan={plan === "new" ? null : plan}
          disabled={readOnly}
          close={() => setPlan(null)}
          saved={saved}
        />
      )}
      {service && detail && list && (
        <ServiceForm
          vehicle={detail.vehicle}
          plan={service}
          today={list.today}
          disabled={readOnly}
          close={() => setService(null)}
          saved={saved}
        />
      )}
    </div>
  );
}
interface FormProps {
  disabled: boolean;
  close(): void;
  saved(): void;
}
function VehicleForm({
  vehicle: v,
  disabled,
  close,
  saved,
}: FormProps & { vehicle: Vehicle | null }) {
  const { technicianLookup } = useApp();
  const [locations, setLocations] = useState<StockLocation[]>([]),
    [locationId, setLocation] = useState(v?.location_id || "");
  const [form, setForm] = useState({
    fleetNumber: v?.fleet_number || "",
    vin: v?.vin || "",
    plate: v?.plate || "",
    make: v?.make || "",
    model: v?.model || "",
    modelYear: v?.model_year ? String(v.model_year) : "",
    odometer: v ? String(v.odometer_tenths / 10) : "0",
    reason: "",
  });
  const [tech, setTech] = useState(v?.technician_id || "none"),
    [status, setStatus] = useState(v?.status || "active"),
    [unit, setUnit] = useState(v?.distance_unit || "mi");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void accountRequest<StockOptions>("/api/service/inventory")
      .then((o) => {
        if (live) setLocations(o.locations.filter((l) => l.kind === "truck"));
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  const location = locations.find((l) => l.id === locationId);
  const field = (name: keyof typeof form, label: string, required = false) => (
    <TextField
      label={label}
      value={form[name]}
      required={required}
      disabled={busy || disabled}
      minLength={name === "reason" ? 10 : undefined}
      maxLength={name === "reason" ? 1000 : 120}
      onInput={(e) => setForm({ ...form, [name]: e.currentTarget.value })}
    />
  );
  return (
    <Sheet close={close}>
      <DialogTitle>
        {v ? "Edit vehicle / assignment" : "Add vehicle"}
      </DialogTitle>
      {error && <Notice tone="danger">{error}</Notice>}
      <form
        class="sales-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || disabled || !location) return;
          setBusy(true);
          setError("");
          try {
            await accountRequest("/api/service/fleet", "POST", {
              id: v?.id,
              expectedVersion: v?.version || 0,
              locationId,
              expectedLocationVersion: v?.location_version ?? location.version,
              technicianId: tech === "none" ? null : tech,
              fleetNumber: form.fleetNumber,
              vin: form.vin,
              plate: form.plate,
              make: form.make,
              model: form.model,
              modelYear: form.modelYear ? Number(form.modelYear) : null,
              status,
              distanceUnit: unit,
              odometerTenths: scaledQuantity(form.odometer, 1),
              reason: form.reason,
            });
            saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Select
          label="Truck stock location"
          value={locationId || "none"}
          disabled={!!v || busy || disabled}
          options={[
            { value: "none", label: "Choose a truck stock location" },
            ...locations.map((l) => ({
              value: l.id,
              label: l.name + " · " + l.code,
            })),
          ]}
          onValueChange={(id) => {
            setLocation(id === "none" ? "" : id);
            setTech(
              locations.find((l) => l.id === id)?.technician_id || "none",
            );
          }}
        />
        <p class="workspace-help">
          Create the truck in Inventory first. Linking preserves its existing
          stock. Changing technician assignment changes custody without moving
          material.
        </p>
        {field("fleetNumber", "Fleet number", true)}
        <Select
          label="Assigned technician"
          value={tech}
          disabled={busy || disabled}
          options={[
            { value: "none", label: "Company custody / unassigned" },
            ...technicianLookup.map((t) => ({ value: t.id, label: t.name })),
          ]}
          onValueChange={setTech}
        />
        {field("plate", "Plate")}
        {field("vin", "VIN (optional)")}
        {field("make", "Make")}
        {field("model", "Model")}
        {field("modelYear", "Model year")}
        <Select
          label="Vehicle status"
          value={status}
          disabled={busy || disabled}
          options={["active", "out_of_service", "retired"].map((value) => ({
            value,
            label: value.replaceAll("_", " "),
          }))}
          onValueChange={(value) => setStatus(value as Vehicle["status"])}
        />
        <Select
          label="Distance unit"
          value={unit}
          disabled={!!v || busy || disabled}
          options={[
            { value: "mi", label: "Miles" },
            { value: "km", label: "Kilometers" },
          ]}
          onValueChange={(value) => setUnit(value as "mi" | "km")}
        />
        {field("odometer", "Recorded odometer", true)}
        {field("reason", "Change / odometer reading reason", true)}
        <div class="inventory-toolbar">
          <Button
            type="submit"
            variant="primary"
            disabled={busy || disabled || !location}
          >
            Save vehicle
          </Button>
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
function MaintenanceForm({
  vehicle,
  plan: p,
  disabled,
  close,
  saved,
}: FormProps & { vehicle: Vehicle; plan: Maintenance | null }) {
  const [createId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({
    title: p?.title || "",
    date: p?.due_date || "",
    odometer:
      p?.due_odometer_tenths !== null && p?.due_odometer_tenths !== undefined
        ? String(p.due_odometer_tenths / 10)
        : "",
    days: p?.interval_days ? String(p.interval_days) : "",
    distance: p?.interval_distance_tenths
      ? String(p.interval_distance_tenths / 10)
      : "",
    warningDays: String(p?.warning_days ?? 14),
    warningDistance: String((p?.warning_distance_tenths ?? 5000) / 10),
    reason: "",
  });
  const [active, setActive] = useState(p ? !!p.active : true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const field = (
    name: keyof typeof form,
    label: string,
    required = false,
    type = "text",
  ) => (
    <TextField
      label={label}
      type={type}
      required={required}
      disabled={busy || disabled}
      value={form[name]}
      minLength={name === "reason" ? 10 : undefined}
      maxLength={name === "reason" ? 1000 : 120}
      onInput={(e) => setForm({ ...form, [name]: e.currentTarget.value })}
    />
  );
  return (
    <Sheet close={close}>
      <DialogTitle>
        {p ? "Edit maintenance reminder" : "Add maintenance reminder"}
      </DialogTitle>
      {error && <Notice tone="danger">{error}</Notice>}
      <form
        class="sales-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || disabled) return;
          setBusy(true);
          setError("");
          try {
            await accountRequest("/api/service/fleet/plans", "POST", {
              id: p?.id || createId,
              vehicleId: vehicle.id,
              expectedVersion: p?.version || 0,
              title: form.title,
              dueDate: form.date || null,
              dueOdometerTenths: form.odometer
                ? scaledQuantity(form.odometer, 1)
                : null,
              intervalDays: form.days ? Number(form.days) : null,
              intervalDistanceTenths: form.distance
                ? scaledQuantity(form.distance, 1)
                : null,
              warningDays: Number(form.warningDays),
              warningDistanceTenths: scaledQuantity(form.warningDistance, 1),
              active,
              reason: form.reason,
            });
            saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {field("title", "Service title", true)}
        {field("date", "Due date", false, "date")}
        {field("odometer", "Due odometer (" + vehicle.distance_unit + ")")}
        <p class="workspace-help">
          Date or odometer can trigger a reminder. Leave recurrence blank for a
          one-time service. Recurring services advance from their recorded
          completion date and odometer.
        </p>
        {field("days", "Repeat every (days)")}
        {field("distance", "Repeat every (" + vehicle.distance_unit + ")")}
        {field("warningDays", "Warn before (days)", true)}
        {field(
          "warningDistance",
          "Warn before (" + vehicle.distance_unit + ")",
          true,
        )}
        <Checkbox
          label="Active reminder"
          checked={active}
          disabled={busy || disabled}
          onChange={(e) => setActive(e.currentTarget.checked)}
        />
        {field("reason", "Reminder change reason", true)}
        <div class="inventory-toolbar">
          <Button type="submit" variant="primary" disabled={busy || disabled}>
            Save reminder
          </Button>
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
function ServiceForm({
  vehicle: v,
  plan,
  today,
  disabled,
  close,
  saved,
}: FormProps & { vehicle: Vehicle; plan: Maintenance; today: string }) {
  const [date, setDate] = useState(today),
    [odometer, setOdometer] = useState(String(v.odometer_tenths / 10)),
    [cost, setCost] = useState(""),
    [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState<unknown | null>(null),
    [key] = useState(() => crypto.randomUUID());
  const locked = disabled || busy || attempt !== null;
  return (
    <Sheet close={close}>
      <DialogTitle>Record service · {plan.title}</DialogTitle>
      {error && <Notice tone="danger">{error}</Notice>}
      <form
        class="sales-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || disabled) return;
          setBusy(true);
          setError("");
          try {
            const payload = attempt || {
              requestKey: key,
              vehicleId: v.id,
              planId: plan.id,
              expectedVehicleVersion: v.version,
              expectedPlanVersion: plan.version,
              serviceDate: date,
              odometerTenths: scaledQuantity(odometer, 1),
              costCents: scaledQuantity(cost, 2),
              notes,
            };
            setAttempt(payload);
            await accountRequest(
              "/api/service/fleet/services",
              "POST",
              payload,
            );
            saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label="Service date"
          type="date"
          required
          max={today}
          value={date}
          disabled={locked}
          onInput={(e) => setDate(e.currentTarget.value)}
        />
        <TextField
          label={"Recorded odometer (" + v.distance_unit + ")"}
          required
          value={odometer}
          disabled={locked}
          onInput={(e) => setOdometer(e.currentTarget.value)}
        />
        <TextField
          label="Service cost (USD)"
          required
          value={cost}
          disabled={locked}
          onInput={(e) => setCost(e.currentTarget.value)}
        />
        <TextField
          label="Service notes / work performed"
          required
          minLength={10}
          maxLength={1000}
          value={notes}
          disabled={locked}
          onInput={(e) => setNotes(e.currentTarget.value)}
        />
        <p class="workspace-help">
          Saves immutable service history and advances recurring maintenance.
          This records a cost; it does not pay a vendor or post to QuickBooks.
        </p>
        {attempt && (
          <Notice>
            Retry sends the same request safely. Before entering a new service
            after an uncertain response, close and inspect service history.
          </Notice>
        )}
        <div class="inventory-toolbar">
          <Button type="submit" variant="primary" disabled={busy || disabled}>
            {attempt ? "Retry same service" : "Save completed service"}
          </Button>
          <Button disabled={busy} onClick={close}>
            Close
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

export function FleetPage({section}:{section?:string|null}) {
  const {user}=useAccount();
  if(user.role==='viewer')return <div class="page"><h1>Fleet</h1><p>You do not have access to Fleet.</p></div>;
  if(!section)return <ModuleOverview module={businessModules.fleet}/>;
  if(section==='vehicles')return <FleetVehicles/>;
  if(section==='inventory')return <StockInventoryPage/>;
  if(section==='gps')return <div class="page"><div class="page-header"><h1>GPS</h1><span class="badge badge-muted">Planned</span></div><p>Live tracking is not connected. GPS ingestion, source configuration, and the dispatch map are planned.</p></div>;
  if(/^[0-9a-f-]{36}$/i.test(section))return <StockInventoryPage key={section} locationId={section}/>;
  return <ModuleOverview module={businessModules.fleet}/>;
}
