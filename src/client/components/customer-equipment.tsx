import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useApp } from "../context";
import { useAccount } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import type { Asset, Site } from "../types";
import { AssetForm, SiteForm } from "./equipment-forms";
import { LocationSelect } from "./location-select";
import { TextField } from "./ui/input";
import { Button } from "./ui/button";
import { Pagination } from "./pagination";
export function CustomerEquipment({ customerId }: { customerId: string }) {
  const { navigate } = useApp(),
    { user } = useAccount(),
    { readOnly } = useConnectivity();
  const [sites, setSites] = useState<Site[]>([]),
    [assets, setAssets] = useState<Asset[]>([]),
    [location, setLocation] = useState("none"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [siteForm, setSiteForm] = useState<Site | "new" | null>(null),
    [assetForm, setAssetForm] = useState(false);
  const canWrite = user.role !== "viewer" && !readOnly;
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    Promise.all([
      api<{ sites: Site[] }>("GET", `/api/customers/${customerId}/sites`),
      location === "none"
        ? Promise.resolve({ assets: [] as Asset[], total: 0 })
        : api<{ assets: Asset[]; total: number }>(
            "GET",
            `/api/customers/${customerId}/assets?` +
              new URLSearchParams({
                search,
                page: String(page),
                siteId: location,
              }),
          ),
    ])
      .then(([s, a]) => {
        if (live) {
          setSites(s.sites);
          setAssets(a.assets);
          setTotal(a.total);
          if (location === "none" && s.sites.length === 1)
            setLocation(s.sites[0].id);
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
  }, [customerId, location, search, page, revision]);
  const selected = sites.find((s) => s.id === location);
  const saved = () => {
    setSiteForm(null);
    setAssetForm(false);
    setRevision((n) => n + 1);
    window.dispatchEvent(
      new CustomEvent("ofs:crm-changed", { detail: { customerId } }),
    );
  };
  return (
    <section
      class="detail-section equipment-section"
      aria-label="Locations and equipment"
    >
      <div class="equipment-heading">
        <h3>Locations & equipment</h3>
        {canWrite && (
          <div class="equipment-actions">
            <Button onClick={() => setSiteForm("new")}>Add location</Button>
            <Button
              variant="primary"
              disabled={!selected || loading || !!error}
              onClick={() => setAssetForm(true)}
            >
              Register equipment
            </Button>
          </div>
        )}
      </div>
      <p class="workspace-help">
        Choose a customer property to view its equipment. Step 2 reports require
        an equipment record linked to that location.
      </p>
      {error && (
        <p class="equipment-error" role="alert">
          {error}{" "}
          <Button onClick={() => setRevision((n) => n + 1)}>Retry</Button>
        </p>
      )}
      <LocationSelect
        key={customerId}
        sites={sites}
        value={location}
        disabled={!sites.length}
        onChange={(id) => {
          setLocation(id);
          setSearch("");
          setPage(1);
        }}
      />
      {!loading && sites.length === 0 && (
        <p class="text-muted">Add a location before registering equipment.</p>
      )}
      {selected ? (
        <div class="equipment-location">
          <h4>{selected.name}</h4>
          <details class="equipment-location-details">
            <summary>Location details</summary>
            <p>{selected.address || "No address recorded"}</p>
            <p>
              {[
                selected.contact_name,
                selected.contact_phone,
                selected.contact_email,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {selected.access_instructions && (
              <p>
                <strong>Access: </strong>
                {selected.access_instructions}
              </p>
            )}
            {selected.safety_notes && (
              <p>
                <strong>Safety: </strong>
                {selected.safety_notes}
              </p>
            )}
            {canWrite && (
              <Button onClick={() => setSiteForm(selected)}>
                Edit location
              </Button>
            )}
          </details>
          <TextField
            label="Find equipment at this location"
            type="search"
            value={search}
            placeholder="Name, serial number or model"
            onInput={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
          />
          {loading ? (
            <p role="status">Loading equipment…</p>
          ) : assets.length === 0 ? (
            <p class="text-muted">
              {search
                ? "No matching equipment at this location."
                : "No equipment registered at this location yet."}
            </p>
          ) : (
            <div class="equipment-grid">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  class="card equipment-card equipment-link"
                  onClick={() => navigate(`/assets/${asset.id}`)}
                >
                  <strong>{asset.name}</strong>
                  <span>Serial: {asset.serial_number}</span>
                  <span>{selected.name}</span>
                  <span class="text-muted">
                    {asset.status.replaceAll("_", " ")}
                  </span>
                </button>
              ))}
            </div>
          )}
          <Pagination pag={{ page, total, limit: 50 }} setPage={setPage} />
        </div>
      ) : (
        !loading &&
        sites.length > 0 && (
          <p class="text-muted">Choose a location to see its equipment.</p>
        )
      )}
      {siteForm && (
        <SiteForm
          customerId={customerId}
          site={siteForm === "new" ? undefined : siteForm}
          onClose={() => setSiteForm(null)}
          onSaved={saved}
        />
      )}
      {assetForm && selected && (
        <AssetForm
          customerId={customerId}
          sites={sites}
          initialSiteId={selected.id}
          onClose={() => setAssetForm(false)}
          onSaved={saved}
        />
      )}
    </section>
  );
}
