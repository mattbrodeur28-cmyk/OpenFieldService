import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../auth";
export function useCompanyTimeZone() {
  const [timeZone, setZone] = useState<string | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = () => {
      void accountRequest<{ timeZone: string }>("/api/service/company")
        .then((data) => {
          if (live) {
            setZone(data.timeZone);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    };
    load();
    window.addEventListener("company-settings-changed", load);
    return () => {
      live = false;
      window.removeEventListener("company-settings-changed", load);
    };
  }, []);
  return { timeZone, error };
}
