// Approximate OpenStreetMap bounding boxes [minLon, minLat, maxLon, maxLat] by U.S. state code.
export const US_STATE_BBOX: Record<string, { name: string; bbox: [number, number, number, number] }> = {
  AL: { name: "Alabama", bbox: [-88.47, 30.22, -84.89, 35.01] },
  AK: { name: "Alaska", bbox: [-179.15, 51.21, -129.98, 71.39] },
  AZ: { name: "Arizona", bbox: [-114.82, 31.33, -109.05, 37.00] },
  AR: { name: "Arkansas", bbox: [-94.62, 33.00, -89.64, 36.50] },
  CA: { name: "California", bbox: [-124.41, 32.53, -114.13, 42.01] },
  CO: { name: "Colorado", bbox: [-109.06, 36.99, -102.04, 41.00] },
  CT: { name: "Connecticut", bbox: [-73.73, 40.98, -71.78, 42.05] },
  DE: { name: "Delaware", bbox: [-75.79, 38.45, -75.05, 39.84] },
  DC: { name: "District of Columbia", bbox: [-77.12, 38.79, -76.91, 39.00] },
  FL: { name: "Florida", bbox: [-87.63, 24.52, -80.03, 31.00] },
  GA: { name: "Georgia", bbox: [-85.61, 30.36, -80.84, 35.00] },
  HI: { name: "Hawaii", bbox: [-160.25, 18.91, -154.81, 22.24] },
  ID: { name: "Idaho", bbox: [-117.24, 41.99, -111.04, 49.00] },
  IL: { name: "Illinois", bbox: [-91.51, 36.97, -87.49, 42.51] },
  IN: { name: "Indiana", bbox: [-88.10, 37.77, -84.78, 41.76] },
  IA: { name: "Iowa", bbox: [-96.64, 40.38, -90.14, 43.50] },
  KS: { name: "Kansas", bbox: [-102.05, 36.99, -94.59, 40.00] },
  KY: { name: "Kentucky", bbox: [-89.57, 36.50, -81.96, 39.15] },
  LA: { name: "Louisiana", bbox: [-94.04, 28.93, -88.82, 33.02] },
  ME: { name: "Maine", bbox: [-71.08, 43.06, -66.95, 47.46] },
  MD: { name: "Maryland", bbox: [-79.49, 37.91, -75.05, 39.72] },
  MA: { name: "Massachusetts", bbox: [-73.51, 41.24, -69.93, 42.89] },
  MI: { name: "Michigan", bbox: [-90.42, 41.70, -82.41, 48.26] },
  MN: { name: "Minnesota", bbox: [-97.24, 43.50, -89.49, 49.38] },
  MS: { name: "Mississippi", bbox: [-91.66, 30.17, -88.10, 34.99] },
  MO: { name: "Missouri", bbox: [-95.77, 35.99, -89.10, 40.61] },
  MT: { name: "Montana", bbox: [-116.05, 44.36, -104.04, 49.00] },
  NE: { name: "Nebraska", bbox: [-104.05, 40.00, -95.31, 43.00] },
  NV: { name: "Nevada", bbox: [-120.01, 35.00, -114.04, 42.00] },
  NH: { name: "New Hampshire", bbox: [-72.56, 42.70, -70.61, 45.31] },
  NJ: { name: "New Jersey", bbox: [-75.56, 38.93, -73.89, 41.36] },
  NM: { name: "New Mexico", bbox: [-109.05, 31.33, -103.00, 37.00] },
  NY: { name: "New York", bbox: [-79.76, 40.50, -71.86, 45.02] },
  NC: { name: "North Carolina", bbox: [-84.32, 33.84, -75.46, 36.59] },
  ND: { name: "North Dakota", bbox: [-104.05, 45.94, -96.55, 49.00] },
  OH: { name: "Ohio", bbox: [-84.82, 38.40, -80.52, 41.98] },
  OK: { name: "Oklahoma", bbox: [-103.00, 33.62, -94.43, 37.00] },
  OR: { name: "Oregon", bbox: [-124.57, 41.99, -116.46, 46.29] },
  PA: { name: "Pennsylvania", bbox: [-80.52, 39.72, -74.69, 42.27] },
  RI: { name: "Rhode Island", bbox: [-71.86, 41.15, -71.12, 42.02] },
  SC: { name: "South Carolina", bbox: [-83.35, 32.03, -78.54, 35.22] },
  SD: { name: "South Dakota", bbox: [-104.06, 42.48, -96.44, 45.95] },
  TN: { name: "Tennessee", bbox: [-90.31, 34.98, -81.65, 36.68] },
  TX: { name: "Texas", bbox: [-106.65, 25.84, -93.51, 36.50] },
  UT: { name: "Utah", bbox: [-114.05, 37.00, -109.04, 42.00] },
  VT: { name: "Vermont", bbox: [-73.44, 42.73, -71.46, 45.02] },
  VA: { name: "Virginia", bbox: [-83.68, 36.54, -75.24, 39.47] },
  WA: { name: "Washington", bbox: [-124.85, 45.54, -116.92, 49.00] },
  WV: { name: "West Virginia", bbox: [-82.64, 37.20, -77.72, 40.64] },
  WI: { name: "Wisconsin", bbox: [-92.89, 42.49, -86.25, 47.08] },
  WY: { name: "Wyoming", bbox: [-111.06, 41.00, -104.05, 45.01] },
};

export function stateServiceArea(stateCode?: string | null): {
  code: string;
  name: string;
  center: [number, number];
  zoom: number;
  bbox: [number, number, number, number];
} {
  const norm = (stateCode || "").trim().toUpperCase();
  const entry = US_STATE_BBOX[norm] || US_STATE_BBOX.CT;
  const code = US_STATE_BBOX[norm] ? norm : "CT";
  const [minLon, minLat, maxLon, maxLat] = entry.bbox;
  const center: [number, number] = [(minLat + maxLat) / 2, (minLon + maxLon) / 2];
  const span = Math.max(maxLat - minLat, maxLon - minLon);
  // Zoomed in tightly on the state's core service area
  const zoom = span < 0.6 ? 12 : span < 2.2 ? 11 : span < 5.0 ? 10 : 9;
  return { code, name: entry.name, center, zoom, bbox: entry.bbox };
}

export function mapEmbedUrlForState(stateCode?: string | null): { code: string; name: string; src: string } {
  const area = stateServiceArea(stateCode);
  const bbox = area.bbox.join("%2C");
  return {
    code: area.code,
    name: area.name,
    src: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`,
  };
}
