import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Checkbox, Notice } from "./ui/surfaces";
interface Company {
  timeZone: string;
  version: number;
}
export function CompanySettings() {
  const { readOnly } = useConnectivity();
  const [settings, setSettings] = useState<Company | null>(null),
    [zone, setZone] = useState(""),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const load = async () => {
    try {
      const data = await accountRequest<Company>("/api/service/company");
      setSettings(data);
      setZone(data.timeZone);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <section class="settings-card">
      <h3>Company settings</h3>
      <p class="workspace-help">
        Set the default timezone for company scheduling and technician reports.
        Times use this setting without a label on every screen.
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
      {!settings ? (
        <Button disabled={busy || readOnly} onClick={() => void load()}>
          Reload company settings
        </Button>
      ) : (
        <form
          class="sales-details"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || readOnly) return;
            setBusy(true);
            setError("");
            setSuccess("");
            try {
              const data = await accountRequest<Company>(
                "/api/service/company",
                "PUT",
                {
                  expectedVersion: settings.version,
                  timeZone: zone,
                  reason,
                  acknowledgeScheduleTimes: ack,
                },
              );
              window.dispatchEvent(new Event("company-settings-changed"));
              setSettings(data);
              setZone(data.timeZone);
              setReason("");
              setAck(false);
              setSuccess(
                "Company timezone saved. Reload open job reports to use the new default.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <TextField
            label="Company timezone"
            value={zone}
            disabled={busy || readOnly}
            required
            maxLength={100}
            placeholder="America/New_York"
            hint="Use an IANA timezone, such as America/New_York, America/Chicago or Europe/London."
            onInput={(e) => {
              setZone(e.currentTarget.value);
              setSuccess("");
            }}
          />
          {zone !== settings.timeZone && (
            <>
              <Notice tone="warning">
                Existing schedule dates and clock times stay the same and are
                interpreted in the new timezone. Review appointments and notify
                your team. Submitted actual UTC timestamps and report evidence
                remain unchanged.
              </Notice>
              <TextField
                label="Reason for timezone change"
                value={reason}
                minLength={10}
                maxLength={1000}
                required
                disabled={busy || readOnly}
                onInput={(e) => setReason(e.currentTarget.value)}
              />
              <Checkbox
                label="I reviewed the effect on existing schedules"
                checked={ack}
                disabled={busy || readOnly}
                onChange={(e) => setAck(e.currentTarget.checked)}
              />
            </>
          )}
          <Button
            type="submit"
            disabled={
              busy ||
              readOnly ||
              zone === settings.timeZone ||
              !ack ||
              reason.trim().length < 10
            }
          >
            {busy ? "Saving…" : "Save company settings"}
          </Button>
        </form>
      )}
    </section>
  );
}
