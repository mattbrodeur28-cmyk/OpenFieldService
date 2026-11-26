import {AgreementsPage} from "./components/agreements-page";
import { BusinessSection } from "./components/business-section";
import {PurchasingPage} from "./components/purchasing-page";
import {FleetPage} from "./components/fleet-page";
import {InventoryPage} from "./components/inventory-page";
import {Timesheets} from "./components/timesheets";
import { SalesPage } from "./components/sales-page";
import { Dispatcher } from "./components/dispatcher";

import { useEffect, useMemo, useState } from "preact/hooks";
import { AppContext } from "./context";
import { useAppState } from "./hooks/use-app";
import { useRouter } from "./hooks/use-router";
import { Sidebar } from "./components/sidebar";
import { Dashboard } from "./components/dashboard";
import { ScheduleView } from "./components/schedule-view";
import { JobList } from "./components/job-list";
import { JobDetail } from "./components/job-detail";
import { CustomerList } from "./components/customer-list";
import { CustomerDetail } from "./components/customer-detail";
import { TechnicianList } from "./components/technician-list";
import { ServiceTypeList } from "./components/service-type-list";
import { MaterialList } from "./components/material-list";
import { InvoiceList } from "./components/invoice-list";
import { InvoiceDetail } from "./components/invoice-detail";
import { AssetDetail } from "./components/asset-detail";
import { ErrorBanner } from "./components/error-banner";
import { useConnectivity } from "./hooks/use-connectivity";
import { TeamChannel } from "./components/team-channel";
import { AccountPages } from "./components/account-pages";
import { WorkspacePage } from "./components/workspace-page";
import { PanelLeft, Sparkles } from "lucide-preact";

export function App() {
  const isAgent = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("agent") || params.get("mode") === "agent";
  }, []);

  useEffect(() => {
    if (isAgent) {
      document.documentElement.setAttribute("data-agent", "");
    }
  }, [isAgent]);

  const connectivity = useConnectivity();
  const { view, id, subId, navigate } = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const workspaceNavigate = (to: string) => {
    if (navigate(to) === false) return;
    if (window.matchMedia("(max-width: 767px)").matches) setSidebarCollapsed(true);
  };
  const appState = useAppState(isAgent, navigate);
  const [detailError, setDetailError] = useState<string | null>(null);


  // Load detail when URL has an ID
  useEffect(() => {
    setDetailError(null);
    if (view === "jobs" && id) {
      appState.selectJob(id).catch((err) => setDetailError((err as Error).message));
    } else if (view === "customers" && id) {
      appState.selectCustomer(id).catch((err) => setDetailError((err as Error).message));
    } else if (view === "invoices" && id) {
      appState.selectInvoice(id).catch((err) => setDetailError((err as Error).message));
    }
  }, [view, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderMain = () => {
    if (view === "agreements") return <AgreementsPage id={id}/>;
    if (view === "sales") return <SalesPage opportunityId={id} quoteId={subId} />;
    if (view === "inventory") return <InventoryPage locationId={id}/>;
    if (view === "fleet") return <FleetPage section={id}/>;
    if (["hr", "finance", "purchasing", "invoices"].includes(view)) return <BusinessSection view={view} id={id} invoiceDetail={view === "invoices" && !!id && !!appState.selectedInvoice}/>;
    if (view === "timesheets") return <Timesheets />;
    if (view === "dispatcher") return <Dispatcher />;
    if (view === "team" && id) return <TeamChannel key={id} id={id} />;
    if (["users", "environment", "settings", "integrations"].includes(view)) return <Dashboard />;
    if (["team", "website"].includes(view)) return <AccountPages key={view + id} view={view} id={id} />;
    if (["chat", "knowledge", "integrations", "builder"].includes(view)) return <WorkspacePage view={view} />;
    if (view === "assets" && id) return <AssetDetail key={id} id={id} />;
    if (view === "jobs" && id) {
      if (appState.selectedJob) return <JobDetail />;
      return <div class="page"><div class="empty-state" role={detailError ? "alert" : "status"}>
        <h2>{detailError ? "Job unavailable" : "Loading job…"}</h2>
        {detailError && <p>{detailError}</p>}
        {detailError && <button class="btn" onClick={() => navigate("/schedule")}>Back to schedule</button>}
      </div></div>;
    }
    if (view === "customers" && id) {
      if(appState.selectedCustomer?.id===id)return <CustomerDetail key={id}/>;
      return <div class="page"><p role={detailError?'alert':'status'}>{detailError||'Loading account…'}</p><button class="btn" onClick={()=>navigate("/customers")}>Back to accounts</button></div>;
    }
    if (view === "invoices" && id && appState.selectedInvoice) return <InvoiceDetail />;
    switch (view) {
      case "calendar":
      case "schedule": return <Dispatcher />;
      case "jobs": return <JobList />;
      case "customers": return <CustomerList />;
      case "technicians": return <TechnicianList />;
      case "services": return <ServiceTypeList />;
      case "materials": return <InventoryPage initialTab="catalog" />;
      case "invoices": return <InvoiceList />;
      default: return <Dashboard />;
    }
  };

  return (
    <AppContext.Provider value={{ ...appState, navigate: workspaceNavigate }}>
      <div class="layout workspace-layout">
        <Sidebar currentView={view} currentId={id} collapsed={sidebarCollapsed} />
        {!sidebarCollapsed && <button class="workspace-backdrop" aria-label="Close navigation" onClick={() => setSidebarCollapsed(true)} />}
        <main class="main-content workspace-main">
          {<header class="workspace-header">
            <button class="btn-icon" aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              aria-expanded={!sidebarCollapsed} aria-controls="workspace-navigation"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}><PanelLeft size={16} /></button>
            <span class="workspace-header-title">Field Service</span>
            <span class="workspace-header-divider" aria-hidden="true" />
            <span class="workspace-header-subtitle">Your workspace</span>
          </header>}
          {connectivity.readOnly && <span class="workspace-offline-indicator" role="status">Offline / saved data · changes require a connection</span>}
          {appState.loading ? (
            <div class="loading-text">Loading...</div>
          ) : (
            renderMain()
          )}
        </main>
      </div>
      {view !== "chat" && <button class="btn workspace-ask-ai" onClick={() => workspaceNavigate("/chat")}><Sparkles size={16} /> Ask AI</button>}
      <ErrorBanner />
    </AppContext.Provider>
  );
}
