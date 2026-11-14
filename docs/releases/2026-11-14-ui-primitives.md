# Shared UI primitives — 2026-11-14

Status: implemented; local browser and automated checks passed. Live LXC deployment and hosted CI status are separate.
Commit: use the commit containing this record. Baseline: `886f6b5`.
Feature IDs: UI-003/004/005 and UX-006, partial completion.

## Behavior

Profile/settings and integration details now share a Radix-backed Dialog wrapper.
Modal stacking, focus restoration, app background inertness and dismissal are
centralized. Settings sections have keyboard-aware Radix tabs. Profile fields use
shared labeled inputs and save/close buttons use the shared Button component.
All adopt the existing light/dark tokens; motion honors reduced-motion preferences.
The source is formatted for maintenance; no new backend behavior or schema change.

## Validation

- Final post-format typecheck and production build passed; all 28 tests passed
  on macOS / Node 26.7.0. Hosted Debian/Node 24 CI is separate.
- Build guard inspected the bundled module graph and found no React/react-dom
  runtime. Only the Preact browser runtime is permitted.
- M1 baseline JS: 188.36 KB / 49.90 KB gzip. Final candidate: 253.84 KB /
  72.47 KB gzip (increase: 22.57 KB gzip). CSS: 59.19 KB / 10.93 KB gzip.
- Desktop Chrome / disposable local fixture: account popup, repeated pointer open,
  keyboard tab navigation (Down then Enter), integration details and nested focus
  trap (Shift+Tab wraps to last control; Tab returns to close) verified.
- Escape closes only the nested integration details and restores focus to Outlook;
  another Escape returns focus to the account button.
- Chrome responsive emulation at 400px: dark profile inspected; reduced-motion
  emulation enabled and final candidate opened on first pointer click. After explicit
  app inertness was added, background controls no longer appeared in the AX tree.
- Profile name required validation prevented an empty submission. Saving the same
  fixture name displayed Profile updated. No password or provider credentials changed.
- Rendering emulation was restored and DevTools closed after verification.

These checks do not qualify VoiceOver/other screen readers, physical touch devices,
other browsers or every primitive. The first pilot exposed an extra first-open mount
step; explicit body portal targeting removed it in the final browser check.
No new tests merely assert CSS/classes; behavioral domain tests are retained.

## Deployment and rollback

Frozen install, build and restart using the existing [update guide](../../deploy/ACCOUNTS.md#update-an-existing-lxc).
The standard backup policy still applies; this slice itself does not migrate data.
A code/dependency/build rollback to 886f6b5 restores the previous native dialogs.
No LXC update was performed during this source/browser validation.

## Remaining work

UI-003 stays open for dropdown/select/ref/portal compatibility and broader styling
integration qualification. UI-004/005 stay open for the remaining shared components
and workspace adoption. UX-006 stays open for full accessibility, contrast, physical
mobile and broader browser coverage. Future Dispatcher/CRM/accounting adoption is
still planned. See [ADR-0002](../architecture/decisions/0002-radix-preact-pilot.md).
