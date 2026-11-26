import { useEffect, useState } from "preact/hooks";
import { Rows2, Rows3 } from "lucide-preact";

// Salesforce Compact/Comfy density toggle. Persists per browser and applies a
// `data-density` attribute that tightens rows and controls in compact mode.
export function DensityToggle() {
  const [compact, setCompact] = useState(
    () => localStorage.getItem("ofs-density") === "compact",
  );
  useEffect(() => {
    document.documentElement.dataset.density = compact ? "compact" : "comfy";
    localStorage.setItem("ofs-density", compact ? "compact" : "comfy");
  }, [compact]);
  return (
    <button
      class="btn-icon"
      aria-label={compact ? "Switch to comfortable density" : "Switch to compact density"}
      aria-pressed={compact}
      title={compact ? "Comfortable density" : "Compact density"}
      onClick={() => setCompact((v) => !v)}
    >
      {compact ? <Rows3 size={16} /> : <Rows2 size={16} />}
    </button>
  );
}
