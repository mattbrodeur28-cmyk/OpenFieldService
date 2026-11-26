import "./profile-settings.css";
import { lazy, Suspense } from "preact/compat";
const CustomFieldSettings = lazy(() => import("./custom-field-settings").then(m => ({default:m.CustomFieldSettings})));
const BillingProfileSettings = lazy(() =>
  import("./billing-profile-settings").then((m) => ({
    default: m.BillingProfileSettings,
  })),
);
const QuoteIssuerSettings = lazy(()=>import("./quote-issuer-settings").then(m=>({default:m.QuoteIssuerSettings})));
const ReviewPolicySettings = lazy(() => import("./review-policy-settings").then(m => ({default:m.ReviewPolicySettings})));
import { CompanySettings } from "./company-settings";
import { ServiceTypesSettings } from "./service-type-settings";
import { TextField } from "./ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Dialog, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { useEffect, useState } from "preact/hooks";
import {
  X,
  UserRound,
  Settings,
  ShieldCheck,
  Plug,
  Code2,
  HardDrive,
  LogOut,
} from "lucide-preact";
import {
  useAccount,
  isAdministrator,
  canManagePeople,
  accountRequest,
} from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import { clearSavedFieldData, enableOfflineStorage } from "../offline";
import { AccountPages, ProviderSettings } from "./account-pages";
import { IntegrationsPage } from "./integrations-page";
export type ProfileSection =
  | "profile"
  | "settings"
  | "integrations"
  | "environment"
  | "administration";
function DeviceStorage() {
  const state = useConnectivity();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function change(enable: boolean) {
    setBusy(true);
    setError("");
    try {
      if (enable) await enableOfflineStorage();
      else await clearSavedFieldData();
    } catch {
      setError("Device storage could not be updated.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="settings-card">
      <h3>
        <HardDrive size={17} /> Device storage
      </h3>
      <p>
        {state.offlineStorageUnavailableReason === "https"
          ? "Offline access requires HTTPS."
          : state.offlineStorageUnavailableReason
            ? "Offline storage is unavailable in this browser."
            : state.offlineStorageEnabled
              ? "Offline storage is enabled on this device."
              : "Offline storage is paused on this device."}{" "}
        Online changes save to the server.
      </p>
      {state.hasSavedData && (
        <p>Saved schedules and job packets are present on this device.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <div class="integration-actions">
        {!state.offlineStorageUnavailableReason &&
          !state.offlineStorageEnabled && (
            <button
              class="btn"
              disabled={busy}
              onClick={() => void change(true)}
            >
              Enable offline access
            </button>
          )}
        {(state.hasSavedData || state.offlineStorageEnabled) && (
          <button
            class="btn"
            disabled={busy}
            onClick={() => void change(false)}
          >
            Clear saved data and pause storage
          </button>
        )}
      </div>
    </section>
  );
}
export function ProfilePopup({
  initialSection = "profile",
  close,
}: {
  initialSection?: ProfileSection;
  close(): void;
}) {
  const { user, refreshAccount, logout } = useAccount();
  const admin = isAdministrator(user);
  const people = canManagePeople(user);
  const [section, setSection] = useState<ProfileSection>(initialSection);
  const [name, setName] = useState(user.name);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<
    { id: string; label: string; model: string; configured: boolean }[]
  >([]);
  async function refreshProviders() {
    try {
      setProviders(
        (
          await accountRequest<{ providers: typeof providers }>(
            "/api/workspace/status",
          )
        ).providers,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (section === "integrations") void refreshProviders();
  }, [section]);
  return (
    <Dialog class="profile-dialog" close={close}>
      <Tabs
        value={section}
        onValueChange={(value) => setSection(value as ProfileSection)}
        orientation="vertical"
        activationMode="manual"
      >
        <header class="profile-dialog-header">
          <div>
            <DialogTitle>Your workspace</DialogTitle>
            <p>
              {user.name} · {user.hr ? "HR / " : ""}
              {user.role}
            </p>
          </div>
          <Button
            size="icon"
            aria-label="Close profile and settings"
            onClick={close}
          >
            <X size={20} />
          </Button>
        </header>
        <div class="profile-dialog-layout">
          <nav aria-label="Profile and settings">
            <TabsList
              aria-label="Settings sections"
              className="profile-section-tabs"
            >
              <TabsTrigger value="profile" className="profile-tab">
                <UserRound size={17} /> Profile
              </TabsTrigger>
              <TabsTrigger value="settings" className="profile-tab">
                <Settings size={17} /> Settings
              </TabsTrigger>
              <span class="profile-nav-caption">Settings sections</span>
              <TabsTrigger value="integrations" className="profile-tab">
                <Plug size={17} /> Integrations
              </TabsTrigger>
              {admin && (
                <TabsTrigger value="environment" className="profile-tab">
                  <Code2 size={17} /> Environment variables
                </TabsTrigger>
              )}
              {people && (
                <TabsTrigger value="administration" className="profile-tab">
                  <ShieldCheck size={17} /> Administration
                </TabsTrigger>
              )}
            </TabsList>
            <button
              class="profile-signout"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void logout().catch((e) => {
                  setError(e.message);
                  setBusy(false);
                });
              }}
            >
              <LogOut size={17} /> Sign out
            </button>
          </nav>
          <TabsContent value={section} className="profile-dialog-content">
            {error && (
              <p class="workspace-error" role="alert">
                {error}
              </p>
            )}
            {section === "profile" && (
              <>
                <div class="profile-identity">
                  <span>{user.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <h3>{user.name}</h3>
                    <p>{user.email}</p>
                    <small>
                      {user.hr ? "HR · " : ""}
                      {user.role}
                    </small>
                  </div>
                </div>
                <section class="settings-card">
                  <h3>Profile details</h3>
                  {saved && (
                    <p class="account-success" role="status">
                      Profile updated.
                    </p>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setBusy(true);
                      setError("");
                      setSaved(false);
                      void accountRequest("/api/auth/profile", "PUT", { name })
                        .then(refreshAccount)
                        .then(() => setSaved(true))
                        .catch((e) => setError(e.message))
                        .finally(() => setBusy(false));
                    }}
                  >
                    <TextField
                      label="Display name"
                      value={name}
                      onInput={(e) => setName(e.currentTarget.value)}
                      maxLength={100}
                      required
                      autoComplete="name"
                    />
                    <TextField
                      label="Email"
                      type="email"
                      value={user.email}
                      readOnly
                      hint="Your administrator manages your account email."
                    />
                    <Button variant="primary" type="submit" disabled={busy}>
                      {busy ? "Saving…" : "Save profile"}
                    </Button>
                  </form>
                </section>
                <AccountPages view="settings" id={null} />
              </>
            )}
            {section === "settings" && (
              <>
                <header class="workspace-settings-heading">
                  <h3>Settings</h3>
                  <p>Manage company preferences, billing and this device.</p>
                </header>
                <div class="workspace-settings-stack">
                  {admin && <CompanySettings />}
                  {admin && <ServiceTypesSettings />}
                  {admin && <Suspense fallback={<p>Loading custom fields…</p>}><CustomFieldSettings /></Suspense>}
                  {admin && (
                    <Suspense fallback={<p>Loading billing profiles…</p>}>
                      <BillingProfileSettings />
                    </Suspense>
                  )}
                  {admin && <Suspense fallback={<p>Loading pricing approval policy…</p>}><ReviewPolicySettings /></Suspense>}
                  {admin && <Suspense fallback={<p>Loading quote issuer…</p>}><QuoteIssuerSettings /></Suspense>}
                  <DeviceStorage />
                  <section class="settings-card">
                    <h3>Integrations</h3>
                    <p>
                      Connect Google, Microsoft, CRM and other available
                      services.
                    </p>
                    <button
                      class="btn"
                      onClick={() => setSection("integrations")}
                    >
                      Manage integrations
                    </button>
                  </section>
                  {admin && (
                    <section class="settings-card">
                      <h3>Environment variables</h3>
                      <p>
                        Configure the allowed AI connection settings. System and
                        encryption settings stay on the server.
                      </p>
                      <button
                        class="btn"
                        onClick={() => setSection("environment")}
                      >
                        Manage environment variables
                      </button>
                    </section>
                  )}
                </div>
              </>
            )}
            {section === "integrations" && (
              <>
                <h3>Integrations</h3>
                <IntegrationsPage
                  providers={providers}
                  refresh={refreshProviders}
                />
              </>
            )}
            {section === "environment" &&
              (admin ? (
                <ProviderSettings />
              ) : (
                <p>Administrator access required.</p>
              ))}
            {section === "administration" &&
              (people ? (
                <>
                  <h3>Administration</h3>
                  <p class="workspace-help">
                    {admin
                      ? "Manage workspace users and privileged access."
                      : "HR access manages ordinary users and team membership. System configuration remains restricted to Owners and Admins."}
                  </p>
                  <AccountPages view="users" id={null} />
                </>
              ) : (
                <p>People administration access required.</p>
              ))}
          </TabsContent>
        </div>
      </Tabs>
    </Dialog>
  );
}
