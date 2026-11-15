import { useEffect, useState } from "preact/hooks";
import { X } from "lucide-preact";
import { accountRequest } from "../auth";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { DialogTitle } from "./ui/dialog";
import { Checkbox, Notice, Sheet } from "./ui/surfaces";
interface Interval {
  open: boolean;
  start: number;
  end: number;
}
interface Weekly extends Interval {
  weekday: number;
}
interface Exception extends Interval {
  date: string;
  label: string;
}
interface Configuration {
  enabled: boolean;
  version: number;
  weekly: Weekly[];
  exceptions: Exception[];
  timeZone: string;
}
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const time = (minute: number) =>
  String(Math.floor(minute / 60)).padStart(2, "0") +
  ":" +
  String(minute % 60).padStart(2, "0");
const number = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};
export function DispatchHours({
  disabled,
  close,
  saved,
}: {
  disabled: boolean;
  close(): void;
  saved(): Promise<void>;
}) {
  const [config, setConfig] = useState<Configuration | null>(null),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void accountRequest<Configuration>("/api/dispatch/operating-hours")
      .then((value) => {
        if (live) setConfig(value);
      })
      .catch((e) => {
        if (live) setFailure(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  const interval = (
    value: Interval,
    update: (patch: Partial<Interval>) => void,
    prefix: string,
  ) => (
    <div class="sales-form-grid">
      <Checkbox
        label={prefix + " open"}
        checked={value.open}
        disabled={busy || disabled}
        onChange={(e) => update({ open: e.currentTarget.checked })}
      />
      <TextField
        label={prefix + " start"}
        type="time"
        required
        disabled={busy || disabled || !value.open}
        value={time(value.start)}
        onInput={(e) => update({ start: number(e.currentTarget.value) })}
      />
      <TextField
        label={prefix + " end (24:00 = midnight)"}
        inputMode="numeric"
        placeholder="17:00"
        pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00"
        required
        disabled={busy || disabled || !value.open}
        value={time(value.end)}
        onChange={(e) => update({ end: number(e.currentTarget.value) })}
      />
    </div>
  );
  return (
    <Sheet close={close}>
      <header class="dispatch-sheet-header">
        <DialogTitle>Service hours</DialogTitle>
        <Button size="icon" aria-label="Close service hours" onClick={close}>
          <X size={18} />
        </Button>
      </header>
      {failure && <Notice tone="danger">{failure}</Notice>}
      {!config && !failure && <p role="status">Loading service hours…</p>}
      {config && (
        <form
          class="dispatch-form"
          onSubmit={(e) => {
            e.preventDefault();
            setFailure("");
            if (
              [...config.weekly, ...config.exceptions].some(
                (d) =>
                  !Number.isInteger(d.start) ||
                  !Number.isInteger(d.end) ||
                  d.start < 0 ||
                  d.end > 1440 ||
                  d.start >= d.end,
              )
            ) {
              setFailure(
                "Every day needs a valid start before its end. Split overnight coverage into separate days.",
              );
              return;
            }
            setBusy(true);
            void accountRequest("/api/dispatch/operating-hours", "PUT", {
              enabled: config.enabled,
              expectedVersion: config.version,
              weekly: config.weekly,
              exceptions: config.exceptions,
            })
              .then(async () => {
                await saved();
                close();
              })
              .catch((e) => setFailure(e.message))
              .finally(() => setBusy(false));
          }}
        >
          <p class="workspace-help">
            Company hours use your company settings. Technician availability applies
            separately. Existing appointments remain visible when hours change.
          </p>
          <Checkbox
            label="Enforce company service hours"
            checked={config.enabled}
            disabled={busy || disabled}
            onChange={(e) =>
              setConfig({ ...config, enabled: e.currentTarget.checked })
            }
          />
          <Notice tone="info">
            After-hours emergency assignments require an Owner/Admin override
            and a recorded reason. The board always retains all 24 hours.
          </Notice>
          {config.weekly.map((day, i) => (
            <section class="sales-details" key={day.weekday}>
              <h3>{days[day.weekday]}</h3>
              {interval(
                day,
                (patch) =>
                  setConfig({
                    ...config,
                    weekly: config.weekly.map((d, j) =>
                      j === i ? { ...d, ...patch } : d,
                    ),
                  }),
                days[day.weekday],
              )}
            </section>
          ))}
          <h3>Dated exceptions and holidays</h3>
          <p class="workspace-help">
            An exception replaces that date’s weekly hours. Closed dates allow
            emergency overrides only. Maximum 100 exceptions.
          </p>
          {config.exceptions.map((day, i) => (
            <section class="sales-details" key={i}>
              <TextField
                label={"Exception " + (i + 1) + " date"}
                type="date"
                required
                value={day.date}
                disabled={busy || disabled}
                onInput={(e) =>
                  setConfig({
                    ...config,
                    exceptions: config.exceptions.map((d, j) =>
                      j === i ? { ...d, date: e.currentTarget.value } : d,
                    ),
                  })
                }
              />
              <TextField
                label={"Exception " + (i + 1) + " description"}
                required
                maxLength={120}
                value={day.label}
                disabled={busy || disabled}
                onInput={(e) =>
                  setConfig({
                    ...config,
                    exceptions: config.exceptions.map((d, j) =>
                      j === i ? { ...d, label: e.currentTarget.value } : d,
                    ),
                  })
                }
              />
              {interval(
                day,
                (patch) =>
                  setConfig({
                    ...config,
                    exceptions: config.exceptions.map((d, j) =>
                      j === i ? { ...d, ...patch } : d,
                    ),
                  }),
                "Exception " + (i + 1),
              )}
              <Button
                disabled={busy || disabled}
                onClick={() =>
                  setConfig({
                    ...config,
                    exceptions: config.exceptions.filter((_, j) => j !== i),
                  })
                }
              >
                Remove exception {i + 1}
              </Button>
            </section>
          ))}
          <Button
            disabled={busy || disabled || config.exceptions.length >= 100}
            onClick={() =>
              setConfig({
                ...config,
                exceptions: [
                  ...config.exceptions,
                  { date: "", label: "", open: false, start: 480, end: 1020 },
                ],
              })
            }
          >
            Add date exception
          </Button>
          <Button type="submit" variant="primary" disabled={busy || disabled}>
            {busy ? "Saving…" : "Save service hours"}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
