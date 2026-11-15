import { useEffect, useState } from "preact/hooks";
import { X } from "lucide-preact";
import { accountRequest } from "../auth";
import { Button } from "./ui/button";
import { DialogTitle } from "./ui/dialog";
import { Select } from "./ui/select";
import { Sheet, Notice } from "./ui/surfaces";
interface Mapping {
  technician_id: string;
  technician_name: string;
  active: number;
  user_id: string | null;
  version: number;
}
interface Configuration {
  technicians: Mapping[];
  people: { id: string; name: string }[];
}
export function TechnicianAccounts({
  disabled,
  close,
}: {
  disabled: boolean;
  close(): void;
}) {
  const [data, setData] = useState<Configuration | null>(null),
    [failure, setFailure] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void accountRequest<Configuration>("/api/service/technician-users")
      .then((result) => {
        if (live) setData(result);
      })
      .catch((e) => {
        if (live) setFailure(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function save(row: Mapping, userId: string | null) {
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      const result = await accountRequest<{ technician: Mapping }>(
        "/api/service/technician-users/" + row.technician_id,
        "PUT",
        { userId, expectedVersion: row.version },
      );
      setData(
        (current) =>
          current && {
            ...current,
            technicians: current.technicians.map((t) =>
              t.technician_id === row.technician_id ? result.technician : t,
            ),
          },
      );
      setNotice("Technician account link saved.");
    } catch (e) {
      setFailure(
        (e as Error).message + " Close and reopen to review current links.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet close={close}>
      <header class="sales-sheet-header">
        <DialogTitle>Technician accounts</DialogTitle>
        <Button
          size="icon"
          aria-label="Close technician accounts"
          onClick={close}
        >
          <X size={18} />
        </Button>
      </header>
      <p class="workspace-help">
        Link an existing company login to one technician. This prepares reliable
        authorship for safety reports and timesheets. It does not create a user,
        change their role, or restrict the older company-wide job screens.
      </p>
      {failure && <Notice tone="danger">{failure}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {!data && !failure && <p role="status">Loading technician accounts…</p>}
      {data?.technicians.length === 0 && <p>Create a technician first.</p>}
      {data?.technicians.map((row) => (
        <TechnicianAccountRow
          key={row.technician_id + "-" + row.version}
          row={row}
          data={data}
          disabled={disabled || busy}
          save={save}
        />
      ))}
    </Sheet>
  );
}
function TechnicianAccountRow({
  row,
  data,
  disabled,
  save,
}: {
  row: Mapping;
  data: Configuration;
  disabled: boolean;
  save(row: Mapping, id: string | null): Promise<void>;
}) {
  const [choice, setChoice] = useState(row.user_id || "none");
  return (
    <section class="sales-details">
      <h3>
        {row.technician_name}
        {row.active ? "" : " · Inactive"}
      </h3>
      <Select
        label={"Login for " + row.technician_name}
        value={choice}
        disabled={disabled}
        onValueChange={setChoice}
        options={[
          { value: "none", label: "No linked login" },
          ...data.people.map((p) => ({
            value: p.id,
            label: p.name,
            disabled:
              !row.active ||
              data.technicians.some(
                (t) =>
                  t.technician_id !== row.technician_id && t.user_id === p.id,
              ),
          })),
          ...(row.user_id && !data.people.some((p) => p.id === row.user_id)
            ? [
                {
                  value: row.user_id,
                  label: "Former or ineligible team member",
                  disabled: true,
                },
              ]
            : []),
        ]}
      />
      <Button
        disabled={disabled || choice === (row.user_id || "none")}
        onClick={() => void save(row, choice === "none" ? null : choice)}
      >
        Save account link
      </Button>
    </section>
  );
}
