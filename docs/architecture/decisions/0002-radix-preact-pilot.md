# ADR-0002: Radix dialog and tabs on Preact compatibility

Date: 2026-11-14
Status: Accepted for Dialog and Tabs; broader compatibility gate remains open.
Feature IDs: UI-003, UI-004, UI-005, UX-006.

## Context and options

The account popup and nested integration details repeated native dialog lifecycle
code. Settings sections lacked tab keyboard semantics. The selected UI direction
uses source-owned shadcn-style wrappers with Radix behavior, while the app already
uses Preact and application CSS tokens.

Options considered: migrate the whole application to React; retain native dialogs
indefinitely; or test a bounded Radix/Preact compatibility slice. Choose the third
option to preserve existing service workflows while validating the requested
primitive family. This does not approve every React library under compatibility.

## Decision

Keep Preact as the sole browser rendering runtime. Vite's Preact preset aliases
React imports; TypeScript paths resolve the corresponding compatibility types.
A production build guard rejects bundled React/react-dom runtime modules. Peer
packages may exist in node_modules; they must not become a second browser runtime.

`components/ui/dialog.tsx` owns the Radix Root/Portal/Overlay/Content composition,
explicit document.body portal, nested layer context, app-background inertness and
focus return for the existing navigation triggers. Product dialogs provide a
DialogTitle and close callback. Mount a Dialog only while open; nested dialogs
must use the same wrapper and stay inside its component context.

`components/ui/tabs.tsx` exposes the selected Radix family. Account sections use
manual activation: Up/Down moves focus and Enter/Space selects a section. This
avoids issuing settings API requests merely while arrowing through tab labels.

`button.tsx` and `input.tsx` are local source-owned controls with typed native
props/refs, explicit button variants and accessible field label/help relationships.
Buttons default to type=button; forms explicitly request type=submit.

Use the existing CSS tokens and named classes in this slice. Do not initialize
Tailwind/reset the stylesheet during this migration. A future utility-CSS adoption
needs a separate scoped decision; adapt selected shadcn patterns to these shared
wrappers meanwhile. No premium template or registry source was copied in this slice.

## Source provenance

| Item | Version/license | Source and local adaptation |
| --- | --- | --- |
| Radix Dialog | 1.3.1 / MIT | https://www.radix-ui.com/primitives/docs/components/dialog — local modal composition, layers, focus return and styling |
| Radix Tabs | 1.2.1 / MIT | https://www.radix-ui.com/primitives/docs/components/tabs — local exports and account-section use |
| shadcn Dialog pattern | Documentation reference; no registry source copied | https://ui.shadcn.com/docs/components/radix/dialog — source-owned wrapper composition and token styling |
| Preact compatibility | Existing pinned lockfile / MIT | https://preactjs.com/guide/v10/typescript/ — compatibility type paths plus existing Vite aliases |
| NumberFlow | 0.6.2 / MIT | https://number-flow.barvian.me/vanilla — prior operational-counter adapter |

Exact transitive versions and integrity hashes are in pnpm-lock.yaml. Review
upstream dependency fixes and repeat browser checks before upgrading primitives.

## Validation and consequences

See [the UI release record](../../releases/2026-11-14-ui-primitives.md) for build,
bundle and browser results. These dialogs/tabs passed the bounded Chrome pilot;
Radix Select, DropdownMenu, more complicated asChild/ref combinations and other
registry components remain unqualified. Screen-reader and physical mobile-device
checks are still required for full UX-006 acceptance.

The gzip JavaScript bundle increases by approximately 22 KB over the M1 baseline.
This is accepted for the focus, modal and tab behavior; review code splitting as
more primitive families are added. Do not silently add a complete second theme.

## Migration, rollback and revisit triggers

No database or server configuration changes. Profile/settings and integration
modals migrate together so a native top-layer dialog does not cover a portaled
child. Roll back code/dependencies/build to 886f6b5 if necessary; no data restore
is needed for this UI-only slice.

Revisit if portal/focus behavior regresses on a supported browser, a new primitive
cannot pass the compatibility checks, the bundle grows disproportionately, or a
future framework migration is approved. Add wrappers to the inventory with their
own evidence rather than broadening this decision by assumption.
