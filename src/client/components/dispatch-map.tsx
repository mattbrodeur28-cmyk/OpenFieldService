import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { stateServiceArea } from "../us-state-bounds";

export interface DispatchMapJob {
  id: string;
  identifier: string;
  customer_name?: string;
  address?: string | null;
  status: string;
  technician_id?: string | null;
  technician_name?: string | null;
  technician_color?: string | null;
  scheduled_time?: string | null;
  service_type_name?: string | null;
}

interface GeoPoint {
  lat: number;
  lon: number;
}

const CACHE_KEY = "ofs-geocode-cache-v1";
const memCache = new Map<string, GeoPoint | null>();

function loadCache(): Record<string, GeoPoint | null> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveCache(key: string, val: GeoPoint | null) {
  memCache.set(key, val);
  try {
    const cur = loadCache();
    cur[key] = val;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cur));
  } catch {
    // ignore storage quota errors
  }
}

async function geocodeAddress(address: string, stateName: string): Promise<GeoPoint | null> {
  const clean = address.trim();
  if (!clean) return null;
  const key = `${clean.toLowerCase()}|${stateName.toLowerCase()}`;
  if (memCache.has(key)) return memCache.get(key) || null;
  const disk = loadCache();
  if (key in disk) {
    memCache.set(key, disk[key]);
    return disk[key];
  }
  const hasState = /\b[A-Z]{2}\b|\b\d{5}\b/.test(clean) || clean.toLowerCase().includes(stateName.toLowerCase());
  const queries = hasState ? [clean] : [`${clean}, ${stateName}, USA`, clean];
  for (const q of queries) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { lat?: string; lon?: string }[];
      if (data[0]?.lat && data[0]?.lon) {
        const pt = { lat: Number(data[0].lat), lon: Number(data[0].lon) };
        if (Number.isFinite(pt.lat) && Number.isFinite(pt.lon)) {
          saveCache(key, pt);
          return pt;
        }
      }
    } catch {
      // network/offline fallback
    }
  }
  saveCache(key, null);
  return null;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makePinIcon(color: string, label: string, unassigned: boolean) {
  const bg = unassigned ? "#f97316" : color || "#0ea5e9";
  return L.divIcon({
    className: "st-leaflet-pin-wrap",
    html: `<div class="st-leaflet-pin" style="background:${escapeHtml(bg)}"><span>${escapeHtml(label)}</span></div>`,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -34],
  });
}

export function DispatchMap({
  stateCode,
  jobs,
  onSelectJob,
}: {
  stateCode: string;
  jobs: DispatchMapJob[];
  onSelectJob?: (jobId: string) => void;
}) {
  const area = useMemo(() => stateServiceArea(stateCode), [stateCode]);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [coords, setCoords] = useState<Record<string, GeoPoint>>({});
  const [geocoding, setGeocoding] = useState(false);

  const addressedJobs = useMemo(
    () => jobs.filter((j): j is DispatchMapJob & { address: string } => Boolean(j.address && j.address.trim().length > 0)),
    [jobs],
  );
  const addrKey = useMemo(
    () => addressedJobs.map((j) => `${j.id}:${j.address}`).join("|"),
    [addressedJobs],
  );

  // Initialize Leaflet map once
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, {
      center: area.center,
      zoom: area.zoom,
      scrollWheelZoom: true,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = group;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Re-center when state changes and no pins are present
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pinCount = addressedJobs.filter((j) => coords[j.id]).length;
    if (pinCount === 0) {
      map.setView(area.center, area.zoom, { animate: false });
    }
  }, [area.code, area.center[0], area.center[1], area.zoom]);

  // Geocode active/open job addresses
  useEffect(() => {
    let alive = true;
    const missing = addressedJobs.filter((j) => !(j.id in coords));
    if (!missing.length) return;
    setGeocoding(true);
    (async () => {
      const found: Record<string, GeoPoint> = {};
      for (const job of missing.slice(0, 20)) {
        if (!alive) return;
        const pt = await geocodeAddress(job.address, area.name);
        if (pt) found[job.id] = pt;
      }
      if (alive && Object.keys(found).length) {
        setCoords((prev) => ({ ...prev, ...found }));
      }
      if (alive) setGeocoding(false);
    })();
    return () => {
      alive = false;
    };
  }, [addrKey, area.name]);

  // Render pins & zoom into active/open job service area
  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const bounds: [number, number][] = [];

    for (const job of addressedJobs) {
      const pt = coords[job.id];
      if (!pt) continue;
      bounds.push([pt.lat, pt.lon]);
      const unassigned = !job.technician_id;
      const initials = unassigned
        ? "!"
        : (job.technician_name || "T")
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
      const marker = L.marker([pt.lat, pt.lon], {
        icon: makePinIcon(job.technician_color || "#0ea5e9", initials, unassigned),
      });
      const popupEl = document.createElement("div");
      popupEl.className = "st-map-popup";
      popupEl.innerHTML = `
        <strong>#${escapeHtml(job.identifier)} · ${escapeHtml(job.customer_name || "Customer")}</strong>
        <div class="st-map-popup-meta">${escapeHtml(job.technician_name || "Unassigned")} · ${escapeHtml(job.status.replace("_", " "))}${job.scheduled_time ? ` · ${escapeHtml(job.scheduled_time)}` : ""}</div>
        <div class="st-map-popup-addr">${escapeHtml(job.address)}</div>
      `;
      if (onSelectJob) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "st-map-popup-btn";
        btn.textContent = unassigned ? "Assign job" : "Edit assignment";
        btn.onclick = () => onSelectJob(job.id);
        popupEl.appendChild(btn);
      }
      marker.bindPopup(popupEl);
      marker.addTo(group);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 12, { animate: true });
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 13 });
    } else {
      map.setView(area.center, area.zoom, { animate: false });
    }
  }, [addressedJobs, coords, area.center[0], area.center[1], area.zoom]);

  const pinnedCount = addressedJobs.filter((j) => coords[j.id]).length;

  return (
    <section class="st-map-card">
      <div class="st-map-header">
        <strong>
          Field Dispatch Map — {area.name} ({area.code})
        </strong>
        <span class="workspace-help">
          {pinnedCount > 0
            ? `${pinnedCount} active/open job ${pinnedCount === 1 ? "pin" : "pins"} plotted`
            : geocoding
              ? "Locating active job addresses…"
              : `Service area centered from Tax / Billing Settings (${area.code})`}
        </span>
      </div>
      <div class="st-map-canvas-wrap">
        <div ref={containerRef} class="st-map-leaflet" aria-label={`Interactive dispatch map for ${area.name}`} />
      </div>
      {addressedJobs.length > 0 && (
        <div class="st-map-grid" style={{ marginTop: "10px" }}>
          {addressedJobs.slice(0, 8).map((j) => {
            const pt = coords[j.id];
            return (
              <button
                type="button"
                key={j.id}
                class="st-map-pin-card"
                onClick={() => {
                  if (pt && mapRef.current) {
                    mapRef.current.setView([pt.lat, pt.lon], 13, { animate: true });
                  }
                  onSelectJob?.(j.id);
                }}
              >
                <span
                  class="st-tech-avatar"
                  style={{ background: !j.technician_id ? "#f97316" : j.technician_color || "#0ea5e9" }}
                >
                  {!j.technician_id ? "!" : (j.technician_name || "T").slice(0, 2).toUpperCase()}
                </span>
                <div style={{ textAlign: "left" }}>
                  <strong>
                    #{j.identifier} · {j.customer_name}
                  </strong>
                  <small>
                    {j.technician_name || "Unassigned"} · {j.address}
                  </small>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
