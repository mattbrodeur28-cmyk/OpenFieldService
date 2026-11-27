import { useNavigationDisclosures } from '../hooks/use-navigation-disclosures';
import { businessModules, type BusinessModule } from '../business-modules';
import { Avatar } from './ui/surfaces';
import { useEffect, useState } from "preact/hooks";
import { ProfilePopup, type ProfileSection } from "./profile-popup";
import { useApp } from "../context";
import { useAccount, isAdministrator } from "../auth";
import { Wallet, Truck, TrendingUp, House, Globe, Plus, MessageSquare, BookOpen, Code2, ChevronDown, CalendarClock, LayoutDashboard, Briefcase, Users, Wrench, Package, FolderKanban } from "lucide-preact";
import type { View } from "../types";

const navItems: { view: View; path: string; label: string; icon: typeof LayoutDashboard }[] = [
  { view: "dashboard", path: "/", label: "Dashboard", icon: LayoutDashboard },
  { view: "dispatcher", path: "/dispatcher", label: "Dispatcher", icon: CalendarClock },
  { view: "jobs", path: "/jobs", label: "Jobs", icon: Briefcase },
  { view: "customers", path: "/customers", label: "Customers", icon: Users },
  { view: "projects", path: "/projects", label: "Projects", icon: FolderKanban },
  { view: "agreements", path: "/agreements", label: "Agreements", icon: Briefcase },
  { view: "timesheets", path: "/timesheets", label: "Timesheets", icon: CalendarClock },
  { view: "technicians", path: "/technicians", label: "Technicians", icon: Wrench },
  { view: "inventory", path: "/inventory", label: "Inventory", icon: Package },
];

export function Sidebar({ currentView, currentId, collapsed = false }: { currentView: View; currentId?: string | null; collapsed?: boolean }) {
  const { navigate, stats } = useApp();
  const { user, teams } = useAccount();
  const canManage = isAdministrator(user);
  const [profileSection, setProfileSection] = useState<ProfileSection | null>(null);
  useEffect(() => { const mapped: Partial<Record<View, ProfileSection>> = { settings: 'settings', integrations: 'integrations', environment: 'environment', users: 'administration' }; if (mapped[currentView]) setProfileSection(mapped[currentView]!); }, [currentView]);
  function closeProfile() { setProfileSection(null); if (['settings', 'integrations', 'environment', 'users'].includes(currentView)) navigate('/'); }

  const {expanded:expandedModules,toggle:toggleModule}=useNavigationDisclosures(user.id);
  const appsExpanded=expandedModules.fieldService;

  const active = (view: View) => currentView === view || (["schedule","calendar"].includes(currentView) && view==="dispatcher") || (currentView==="materials" && view==="inventory") || (currentView === "assets" && view === "customers") || (["purchasing", "invoices"].includes(currentView) && view === "finance");
  const colors: Partial<Record<View, string>> = {
    timesheets: "blue", sales: "cyan", dispatcher: "blue", schedule: "pink", jobs: "purple", customers: "blue", technicians: "pink",
    invoices: "purple", materials: "cyan", projects: "cyan",
  };
  const navItem = (item: typeof navItems[number]) => {
    const count = item.view === "jobs" ? stats.jobs : item.view === "customers" ? stats.customers
      : item.view === "invoices" ? stats.invoices_outstanding : 0;
    return <button key={item.view} title={item.label} aria-label={item.label}
      aria-current={active(item.view) ? "page" : undefined}
      class={`sidebar-item ${active(item.view) ? "active" : ""}`}
      onClick={() => navigate(item.path)}>
      <span class={`workspace-nav-icon ${colors[item.view] ? `icon-${colors[item.view]}` : ""}`} aria-hidden="true"><item.icon size={12} /></span>
      <span class="workspace-nav-label">{item.label}</span>
      {count > 0 && <span class="sidebar-badge">{count}</span>}
    </button>;
  };

  const moduleGroup = (module: BusinessModule, Icon: typeof LayoutDashboard) => {
    const expanded = !collapsed && expandedModules[module.view];
    const selected = active(module.view);
    return <div class="workspace-module" key={module.view}>
      <button type="button" class={`sidebar-item workspace-app-toggle ${selected ? 'active' : ''}`}
        title={collapsed ? `${module.label} overview` : module.label}
        aria-label={collapsed ? `${module.label} overview` : `${expanded ? 'Collapse' : 'Expand'} ${module.label}`}
        aria-current={collapsed && selected && !currentId && currentView===module.view ? 'page' : undefined}
        aria-expanded={collapsed ? undefined : expanded}
        aria-controls={collapsed ? undefined : `${module.view}-pages`}
        onClick={() => collapsed ? navigate('/'+module.view) : toggleModule(module.view)}>
        <Icon size={14} aria-hidden="true"/><span class="workspace-nav-label">{module.label}</span>
        {!collapsed && <ChevronDown size={14} class={`workspace-chevron ${expanded ? '' : 'closed'}`} aria-hidden="true"/>}
      </button>
      <div id={`${module.view}-pages`} class="workspace-app-pages" hidden={!expanded}>
        {[{key:'overview',label:'Overview',path:'/'+module.view},...module.pages].map(page=>{
          const pageActive = selected && (page.key==='overview' ? !currentId && currentView===module.view : currentView===page.key || (currentView===module.view && currentId===page.key));
          return <button type="button" key={page.key} title={page.label} class={`sidebar-item ${pageActive?'active':''}`} aria-current={pageActive?'page':undefined} onClick={()=>navigate(page.path)}><span class="workspace-nav-label">{page.label}</span></button>;
        })}
      </div>
    </div>;
  };

  return (
    <aside id="workspace-navigation" aria-label="Workspace navigation" class={`slds-nav-vertical sidebar workspace-sidebar ${collapsed ? "collapsed" : ""}`}>
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
          {teams.map(team => <button class={`sidebar-item ${currentView === "team" && currentId === team.id ? "active" : ""}`} title={team.name} aria-label={team.name} aria-current={currentView === "team" && currentId === team.id ? "page" : undefined} onClick={() => navigate("/team/" + team.id)}>
            <span class="workspace-team-avatar" aria-hidden="true">{team.name.slice(0, 1).toUpperCase()}</span><span class="workspace-nav-label">{team.name}</span>
          </button>)}
          {!teams.length && !collapsed && <p class="workspace-team-empty">No teams assigned</p>}
        </div>
        <div class="sidebar-section-title">Apps</div>
        <button class={`sidebar-item workspace-app-toggle ${navItems.some(item => active(item.view)) ? 'active' : ''}`} title="Field Service"
          aria-expanded={collapsed || appsExpanded} aria-controls="field-service-pages"
          onClick={() => toggleModule("fieldService")} disabled={collapsed}>
          <CalendarClock size={14} class="workspace-app-symbol" aria-hidden="true" />
          <span class="workspace-nav-label">Field Service</span>
          <ChevronDown size={14} class={`workspace-chevron ${appsExpanded ? "" : "closed"}`} aria-hidden="true" />
        </button>
        <div id="field-service-pages" class="workspace-app-pages" hidden={!collapsed && !appsExpanded}>
          {navItems.slice(1).filter(item=>item.view!=="purchasing"||canManage).map(navItem)}
        </div>
        {moduleGroup(businessModules.sales, TrendingUp)}
        {user.role !== "viewer" && moduleGroup(businessModules.fleet, Truck)}
        {canManage && moduleGroup(businessModules.finance, Wallet)}
        {canManage && navItem({ view: "builder", path: "/builder", label: "App builder", icon: Code2 })}
        {navItem({ view: "knowledge", path: "/knowledge", label: "Knowledge", icon: BookOpen })}
        {canManage && navItem({ view: "website", path: "/website", label: "Website", icon: Globe })}
      </nav>
      <div class="workspace-sidebar-footer">
        <button class="sidebar-item workspace-account-button" title={user.name} aria-label={`${user.name} profile and settings`} aria-haspopup="dialog" onClick={() => setProfileSection("profile")}><Avatar name={user.name} /><span class="workspace-nav-label">{user.name}<small>{user.role}</small></span></button>
      </div>
      {profileSection && <ProfilePopup initialSection={profileSection} close={closeProfile} />}
    </aside>
  );
}
