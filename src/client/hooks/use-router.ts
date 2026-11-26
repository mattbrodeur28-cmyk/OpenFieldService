import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import type { View } from "../types";

export interface RouteState {
  view: View;
  id: string | null;
  subId: string | null;
}

const VIEW_ROUTES: Record<string, View> = {
  "": "dashboard",
  chat: "chat",
  team: "team",
  users: "users",
  website: "website",
  environment: "environment",
  knowledge: "knowledge",
  integrations: "integrations",
  builder: "builder",
  settings: "settings",
  dashboard: "dashboard",
  schedule: "schedule",
  dispatcher: "dispatcher",
  timesheets: "timesheets",
  sales: "sales",
  agreements: "agreements",
  projects: "projects",
  calendar: "calendar",
  jobs: "jobs",
  customers: "customers",
  assets: "assets",
  technicians: "technicians",
  services: "services",
  invoices: "invoices",
  materials: "materials",
  inventory: "inventory",
  fleet: "fleet",
  hr: "hr",
  finance: "finance",
  purchasing: "purchasing",
};

function parseRoute(path: string): RouteState {
  const clean = path.replace(/^\/+|\/+$/g, "").split(/[?#]/)[0];
  const segments = clean.split("/");
  const viewKey = segments[0] || "";
  const view = VIEW_ROUTES[viewKey] || "dashboard";
  const id = segments[1] || null;
  return { view, id, subId: segments[2] || null };
}

export function useRouter() {
  const [route, setRoute] = useState<RouteState>(() =>
    parseRoute(window.location.pathname),
  );

  const currentPath = useRef(window.location.pathname);
  const permitted = (to: string) =>
    window.dispatchEvent(
      new CustomEvent("ofs:before-navigation", {
        cancelable: true,
        detail: { to },
      }),
    );
  const navigate = useCallback((to: string) => {
    if (!permitted(to)) return false;
    currentPath.current = to;
    window.history.pushState(null, "", to);
    setRoute(parseRoute(to));
    return true;
  }, []);

  useEffect(() => {
    const handler = () => {
      const to = window.location.pathname;
      if (!permitted(to)) {
        window.history.pushState(null, "", currentPath.current);
        return;
      }
      currentPath.current = to;
      setRoute(parseRoute(to));
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return { ...route, navigate };
}
