import { useState } from "preact/hooks";
import { useApp } from "../context";
import { useAccount, isAdministrator } from "../auth";
import { House, Globe, Plus, LogOut, MessageSquare, BookOpen, Plug, Code2, SlidersHorizontal, ChevronDown, CalendarClock, LayoutDashboard, Briefcase, Users, Wrench, Settings, CalendarDays, FileText, Package } from "lucide-preact";
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

export function Sidebar({ currentView, currentId, collapsed = false }: { currentView: View; currentId?: string | null; collapsed?: boolean }) {
  const { navigate, stats } = useApp();
  const { user, teams, logout } = useAccount();
  const canManage = isAdministrator(user);
  const [logoutError, setLogoutError] = useState('');

  const [appsExpanded, setAppsExpanded] = useState(true);

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
          {navItem({ ...navItems[0], label: "Home", icon: House })}
          {navItem({ view: "chat", path: "/chat", label: "Chat", icon: MessageSquare })}
        </div>
        <div class="workspace-team-heading"><button class="sidebar-section-title" onClick={() => navigate("/team")}>Team</button><button class="btn-icon" title="View teams" aria-label="View teams" onClick={() => navigate("/team")}><Plus size={14} /></button></div>
        <div class="workspace-team-list">
          {teams.map(team => <button class={`sidebar-item ${currentView === "team" && currentId === team.id ? "active" : ""}`} title={team.name} aria-current={currentView === "team" && currentId === team.id ? "page" : undefined} onClick={() => navigate("/team/" + team.id)}>
            <span class="workspace-team-avatar" aria-hidden="true">{team.name.slice(0, 1).toUpperCase()}</span><span class="workspace-nav-label">{team.name}</span>
          </button>)}
          {!teams.length && !collapsed && <p class="workspace-team-empty">No teams assigned</p>}
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
        <div class="sidebar-section-title workspace-account-heading">Account</div>
        {canManage && navItem({ view: "website", path: "/website", label: "Website", icon: Globe })}
        {navItem({ view: "knowledge", path: "/knowledge", label: "Knowledge", icon: BookOpen })}
        {navItem({ view: "integrations", path: "/integrations", label: "Integrations", icon: Plug })}
        {canManage && navItem({ view: "environment", path: "/environment", label: "Environment variables", icon: Code2 })}
        {navItem({ view: "calendar", path: "/calendar", label: "Calendar", icon: CalendarDays })}
        {canManage && navItem({ view: "users", path: "/users", label: "Users", icon: Users })}
        {canManage && navItem({ view: "builder", path: "/builder", label: "App builder", icon: Code2 })}
        {navItem({ view: "settings", path: "/settings", label: "Settings", icon: SlidersHorizontal })}
      </nav>
      <div class="workspace-sidebar-footer">
        <button class="sidebar-item workspace-account-button" title={user.name} onClick={() => navigate("/settings")}><span class="workspace-team-avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span><span class="workspace-nav-label">{user.name}<small>{user.role}</small></span></button>
        <button class="sidebar-item" title="Sign out" onClick={() => { void logout().catch(error => setLogoutError(error.message)); }}><LogOut size={15} /><span class="workspace-nav-label">Sign out</span></button>
        {logoutError && <p role="alert">{logoutError}</p>}
      </div>
    </aside>
  );
}
