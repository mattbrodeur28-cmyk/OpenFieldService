import { useEffect, useState, useRef } from "preact/hooks";
import { api } from "../api";
import { useApp } from "../context";
import { LocationSelect } from "./location-select";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import type { Asset, Job, Site } from "../types";
import { useConnectivity } from "../hooks/use-connectivity";

export function AssetPicker({
  customerId,
  value,
  onChange,
  initialAsset,
}: {
  customerId: string;
  value: string | null;
  onChange: (id: string | null) => void;
  initialAsset?: Asset;
}) {
  const selectionEpoch = useRef(0);
  const [sites, setSites] = useState<Site[]>([]),
    [location, setLocation] = useState(
      initialAsset?.customer_id === customerId ? initialAsset.site_id : "none",
    ),
    [assets, setAssets] = useState<Asset[]>([]),
    [linked, setLinked] = useState<Asset | null>(initialAsset ?? null),
    [search, setSearch] = useState(""),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    if (!customerId) {
      setSites([]);
      return;
    }
    api<{ sites: Site[] }>("GET", `/api/customers/${customerId}/sites`)
      .then((data) => {
        if (live) {
          setSites(data.sites);
          if (!value && data.sites.length === 1) setLocation(data.sites[0].id);
        }
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [customerId, revision]);
  useEffect(() => {
    let live = true;
    if (!value) {
      setLinked(null);
      return;
    }
    const epoch = selectionEpoch.current;
    const known =
      assets.find((a) => a.id === value) ??
      (initialAsset?.id === value ? initialAsset : null);
    if (known && known.customer_id === customerId) {
      setLinked(known);
      setLocation(known.site_id);
      return;
    }
    api<{ asset: Asset }>("GET", `/api/assets/${value}`)
      .then(({ asset }) => {
        if (!live || epoch !== selectionEpoch.current) return;
        if (asset.customer_id !== customerId)
          throw new Error("Equipment belongs to a different customer.");
        setLinked(asset);
        setLocation(asset.site_id);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [customerId, value]);
  useEffect(() => {
    let live = true;
    if (!customerId || location === "none") {
      setAssets([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api<{ assets: Asset[]; total: number }>(
      "GET",
      `/api/customers/${customerId}/assets?` +
        new URLSearchParams({ search, siteId: location }),
    )
      .then((data) => {
        if (live) {
          setAssets(data.assets);
          setTotal(data.total);
        }
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [customerId, location, search, revision]);
  const choices = assets
    .filter((a) => a.site_id === location)
    .map((a) => ({
      value: a.id,
      label: `${a.name} · ${a.serial_number}${a.status === "retired" ? " (retired)" : ""}`,
    }));
  if (
    value &&
    linked?.id === value &&
    linked.site_id === location &&
    !choices.some((c) => c.value === value)
  )
    choices.unshift({
      value,
      label: `${linked.name} · ${linked.serial_number}`,
    });
  return (
    <div class="equipment-picker">
      <LocationSelect
        key={customerId}
        sites={sites}
        value={location}
        disabled={!customerId || !sites.length}
        onChange={(next) => {
          selectionEpoch.current++;
          setLocation(next);
          setAssets([]);
          setSearch("");
          onChange(null);
        }}
      />
      <TextField
        label="Find equipment at this location"
        type="search"
        disabled={!customerId || location === "none"}
        value={search}
        placeholder="Name, serial number or model"
        onInput={(e) => setSearch(e.currentTarget.value)}
      />
      <Select
        label="Equipment (required for Step 2)"
        value={value ?? "none"}
        disabled={!customerId || location === "none" || loading || !!error}
        options={[
          { value: "none", label: "Select equipment before Step 2" },
          ...choices,
        ]}
        onValueChange={(id) => onChange(id === "none" ? null : id)}
      />
      {location === "none" && customerId && (
        <p class="text-muted">
          Choose the customer location, then its equipment.
        </p>
      )}
      {loading && <p role="status">Loading equipment…</p>}
      {error && (
        <p role="alert" class="equipment-error">
          {error}{" "}
          <button
            type="button"
            class="btn"
            onClick={() => setRevision((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {!loading && !error && total > 50 && (
        <p class="text-muted">
          Showing the first 50 matches at this location. Search by serial number
          to find more.
        </p>
      )}
    </div>
  );
}

export function JobEquipment({ job }: { job: Job }) {
  const { updateJob, navigate } = useApp();
  const { readOnly } = useConnectivity();
  const [value, setValue] = useState(job.asset_id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setValue(job.asset_id);
  }, [job.asset_id]);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await updateJob(job.id, { asset_id: value });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (readOnly)
    return (
      <section
        class="detail-section equipment-section"
        aria-label="Job equipment"
      >
        <h3>Equipment</h3>
        {job.asset_id != null ? (
          <button
            class="btn"
            onClick={() => navigate(`/assets/${job.asset_id}`)}
          >
            View equipment & history
          </button>
        ) : (
          <p class="text-muted">No equipment linked.</p>
        )}
        <p class="text-muted">Reconnect to change the equipment link.</p>
      </section>
    );
  return (
    <section
      class="detail-section equipment-section"
      aria-label="Job equipment"
    >
      <h3>Equipment</h3>
      <fieldset disabled={busy}>
        <AssetPicker
          key={job.customer_id}
          customerId={job.customer_id}
          value={value}
          onChange={setValue}
        />
      </fieldset>
      <div class="equipment-actions">
        <button
          class="btn"
          disabled={busy || value === job.asset_id}
          onClick={save}
        >
          {busy ? "Saving…" : "Save equipment link"}
        </button>
        {job.asset_id != null && (
          <button
            class="btn"
            onClick={() => navigate(`/assets/${job.asset_id}`)}
          >
            View equipment & history
          </button>
        )}
      </div>
      <p class="text-muted">
        Equipment is required for Step 2. Link it before submitting PJSA; an
        accepted PJSA requires safety reassessment before changing equipment.
        Changing this link keeps the job address unchanged.
      </p>
      {error && (
        <p class="equipment-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
