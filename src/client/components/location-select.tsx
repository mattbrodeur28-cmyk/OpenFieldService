import { useState } from "preact/hooks";
import type { Site } from "../types";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
/** A customer location is the existing Site UUID, never a new copy of an address. */
export function LocationSelect({
  sites,
  value,
  onChange,
  disabled = false,
}: {
  sites: Site[];
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const matches = sites.filter(
    (s) =>
      s.id === value ||
      !query ||
      `${s.name} ${s.address}`.toLocaleLowerCase().includes(query),
  );
  return (
    <div class="location-selector">
      <TextField
        label="Find a location"
        type="search"
        value={search}
        disabled={disabled}
        placeholder="Property name or address"
        onInput={(e) => setSearch(e.currentTarget.value)}
      />
      <Select
        label="Location"
        value={value}
        disabled={disabled}
        options={[
          { value: "none", label: "Choose a location" },
          ...matches.map((s) => ({
            value: s.id,
            label: s.name + (s.address ? " · " + s.address : ""),
          })),
        ]}
        onValueChange={onChange}
      />
    </div>
  );
}
