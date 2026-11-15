import { Avatar } from './ui/surfaces';
import { useEffect, useState } from "preact/hooks";
import { ProfilePopup, type ProfileSection } from "./profile-popup";
import { useApp } from "../context";
import { useAccount, isAdministrator } from "../auth";
import { ShoppingCart, Truck, TrendingUp, House, Globe, Plus, MessageSquare, BookOpen, Code2, ChevronDown, CalendarClock, LayoutDashboard, Briefcase, Users, Wrench, Settings, CalendarDays, FileText, Package } from "lucide-preact";
import type { View } from "../types";

const navItems: { view: View; path: string; label: string; icon: typeof LayoutDashboard }[] = [
  { view: "dashboard", path: "/", label: "Dashboard", icon: LayoutDashboard },
  { view: "dispatcher", path: "/dispatcher", label: "Dispatcher", icon: CalendarClock },
  { view: "schedule", path: "/schedule", label: "Schedule", icon: CalendarDays },
  { view: "jobs", path: "/jobs", label: "Jobs", icon: Briefcase },
  { view: "customers", path: "/customers", label: "Customers", icon: Users },
  { view: "timesheets", path: "/timesheets", label: "Timesheets", icon: CalendarClock },
  { view: "technicians", path: "/technicians", label: "Technicians", icon: Wrench },
  { view: "invoices", path: "/invoices", label: "Invoices", icon: FileText },
  { view: "purchasing", path: "/purchasing", label: "Purchasing", icon: ShoppingCart },
  { view: "fleet", path: "/fleet", label: "Fleet", icon: Truck },
  { view: "inventory", path: "/inventory", label: "Inventory", icon: Package },
  { view: "materials", path: "/materials", label: "Materials", icon: Package },
  { view: "services", path: "/services", label: "Service types", icon: Settings },
];

export function Sidebar({ currentView, currentId, collapsed = false }: { currentView: View; currentId?: string | null; collapsed?: boolean }) {
  const { navigate, stats } = useApp();
  const { user, teams } = useAccount();
  const canManage = isAdministrator(user);
  const [profileSection, setProfileSection] = useState<ProfileSection | null>(null);
  useEffect(() => { const mapped: Partial<Record<View, ProfileSection>> = { settings: 'settings', integrations: 'integrations', environment: 'environment', users: 'administration' }; if (mapped[currentView]) setProfileSection(mapped[currentView]!); }, [currentView]);
  function closeProfile() { setProfileSection(null); if (['settings', 'integrations', 'environment', 'users'].includes(currentView)) navigate('/'); }

  const [appsExpanded, setAppsExpanded] = useState(true);

  const active = (view: View) => currentView === view || (currentView === "assets" && view === "customers");
  const colors: Partial<Record<View, string>> = {
    timesheets: "blue", sales: "cyan", dispatcher: "blue", schedule: "pink", jobs: "purple", customers: "blue", technicians: "pink",
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
          {navItems.slice(1).filter(item=>item.view!=="purchasing"||canManage).filter(item=>!["inventory","fleet"].includes(item.view)||user.role!=="viewer").map(navItem)}
        </div>
        {navItem({view:"sales",path:"/sales",label:"Sales",icon:TrendingUp})}
        {canManage && navItem({ view: "builder", path: "/builder", label: "App builder", icon: Code2 })}
        {navItem({ view: "knowledge", path: "/knowledge", label: "Knowledge", icon: BookOpen })}
        {canManage && navItem({ view: "website", path: "/website", label: "Website", icon: Globe })}
      </nav>
      <div class="workspace-sidebar-footer">
        <button class="sidebar-item workspace-account-button" title={user.name} aria-haspopup="dialog" onClick={() => setProfileSection("profile")}><Avatar name={user.name} /><span class="workspace-nav-label">{user.name}<small>{user.role}</small></span></button>
      </div>
      {profileSection && <ProfilePopup initialSection={profileSection} close={closeProfile} />}
    </aside>
  );
}
