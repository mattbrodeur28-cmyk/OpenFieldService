import { AppNav, embedded } from "@clawnify/app/client";
import { useState } from "preact/hooks";
import { useApp } from "../context";
import { MessageSquare, BookOpen, Plug, Code2, SlidersHorizontal, ChevronDown, CalendarClock, LayoutDashboard, Briefcase, Users, Wrench, Settings, CalendarDays, FileText, Package } from "lucide-preact";
import type { View } from "../types";

const navItems: { view: View; path: string; label: string; icon: typeof LayoutDashboard }[] = [
  { view: "dashboard", path: "/", label: "Dashboard", icon: LayoutDashboard },
  { view: "schedule", path: "/schedule", label: "Schedule", icon: CalendarDays },
  { view: "jobs", path: "/jobs", label: "Jobs", icon: Briefcase },
  { view: "customers", path: "/customers", label: "Customers", icon: Users },
  { view: "technicians", path: "/technicians", label: "Technicians", icon: Wrench },
  { view: "invoices", path: "/invoices", label: "Invoices", icon: FileText },
  { view: "materials", path: "/materials", label: "Materials", icon: Package },
  { view: "services", path: "/services", label: "Service types", icon: Settings },
];

export function Sidebar({ currentView, collapsed = false }: { currentView: View; collapsed?: boolean }) {
  const { navigate, stats } = useApp();

  const [appsExpanded, setAppsExpanded] = useState(true);

  if (embedded) {
    const icons = ["home", "calendar-days", "briefcase", "users", "settings", "file-text", "package", "settings"];
    return <AppNav title="Field Service" icon="settings" active={currentView === "assets" ? "customers" : currentView}
      groups={[{ items: navItems.map((item, index) => ({
        id: item.view, label: item.label, href: item.path, icon: icons[index],
        home: item.view === "dashboard",
        count: item.view === "jobs" ? stats.jobs || undefined
          : item.view === "customers" ? stats.customers || undefined
          : item.view === "invoices" ? stats.invoices_outstanding || undefined : undefined,
      })) }]}
      onNavigate={item => navigate(item.href ?? "/")} />;
  }

  const active = (view: View) => currentView === view || (currentView === "assets" && view === "customers");
  const colors: Partial<Record<View, string>> = {
    schedule: "pink", jobs: "purple", customers: "blue", technicians: "pink",
    invoices: "purple", materials: "cyan", services: "purple",
  };
  const navItem = (item: typeof navItems[number]) => {
    const count = item.view === "jobs" ? stats.jobs : item.view === "customers" ? stats.customers
      : item.view === "invoices" ? stats.invoices_outstanding : 0;
    return <button key={item.view} title={item.label}
      aria-current={active(item.view) ? "page" : undefined}
      class={`sidebar-item ${active(item.view) ? "active" : ""}`}
      onClick={() => navigate(item.path)}>
      <span class={`workspace-nav-icon ${colors[item.view] ? `icon-${colors[item.view]}` : ""}`} aria-hidden="true"><item.icon size={12} /></span>
      <span class="workspace-nav-label">{item.label}</span>
      {count > 0 && <span class="sidebar-badge">{count}</span>}
    </button>;
  };

  return (
    <aside id="workspace-navigation" aria-label="Workspace navigation" class={`sidebar workspace-sidebar ${collapsed ? "collapsed" : ""}`}>
      <div class="sidebar-brand">
        <div class="sidebar-brand-icon" aria-hidden="true">F</div>
        <span class="sidebar-brand-name">Field Service</span>
      </div>
      <nav class="sidebar-nav" aria-label="Main navigation">
        <div class="workspace-home">
          {navItem({ ...navItems[0], label: "Home" })}
        </div>
        <div class="sidebar-section-title">Apps</div>
        <button class="sidebar-item workspace-app-toggle" title="Field Service"
          aria-expanded={collapsed || appsExpanded} aria-controls="field-service-pages"
          onClick={() => setAppsExpanded(!appsExpanded)} disabled={collapsed}>
          <CalendarClock size={14} class="workspace-app-symbol" aria-hidden="true" />
          <span class="workspace-nav-label">Field Service</span>
          <ChevronDown size={14} class={`workspace-chevron ${appsExpanded ? "" : "closed"}`} aria-hidden="true" />
        </button>
        <div id="field-service-pages" class="workspace-app-pages" hidden={!collapsed && !appsExpanded}>
          {navItems.slice(1).map(navItem)}
        </div>
        <div class="sidebar-section-title">Workspace</div>
        {[
          { view: "chat" as View, path: "/chat", label: "Chat", icon: MessageSquare },
          { view: "knowledge" as View, path: "/knowledge", label: "Knowledge", icon: BookOpen },
          { view: "integrations" as View, path: "/integrations", label: "Integrations", icon: Plug },
          { view: "builder" as View, path: "/builder", label: "App builder", icon: Code2 },
          { view: "settings" as View, path: "/settings", label: "Settings", icon: SlidersHorizontal },
        ].map(navItem)}
      </nav>
      <div class="workspace-sidebar-footer">
        <strong>Your workspace</strong>
        <span>OpenFieldService</span>
      </div>
    </aside>
  );
}
