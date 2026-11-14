# UI implementation guide

The selected sources, compatibility decision and motion rules are defined in
[ADR-0001](../architecture/decisions/0001-ui-system.md). Feature IDs UI-001 through
UI-008 in [Features.md](../../Features.md) track adoption.

## Current reusable components

`src/client/components/ui/animated-number.tsx` wraps the framework-independent
NumberFlow custom element for Preact. It is used for operational dashboard counts.
It preserves accessible static text, respects reduced-motion preferences and keeps
the first value static. Revenue remains ordinary formatted text.

```tsx
import { AnimatedNumber } from './ui/animated-number';

<AnimatedNumber value={openJobs} />
```

Use normal static numbers for editable amounts, financial review, dense tables and
frequent keyboard workflows. New animations need a purpose and a reduced-motion
variant. Do not turn a pending API request into a fake successful count update.

## Radix and form controls

[ADR-0002](../architecture/decisions/0002-radix-preact-pilot.md) approves a bounded
Dialog/Tabs compatibility slice. Profile/settings and nested integration details
now consume these wrappers. Existing tokens provide the styling; no Tailwind reset
or complete shadcn registry installation is claimed.

| Wrapper | Current contract / usage |
| --- | --- |
| Dialog, DialogTitle | Body portal, modal focus trap, Escape/outside dismissal, nested layers, background inertness, focus return; mount conditionally while open |
| Tabs, TabsList, TabsTrigger, TabsContent | Radix family; manual activation for account sections |
| Button | Typed native button/ref; default, primary, ghost, danger variants; explicit submit opt-in; icon size needs aria-label |
| Input, TextField | Native input/ref; field label, hint/error ID and invalid state; profile form |
| AnimatedNumber | Selected dashboard counts only; initial static value and reduced motion |

Do not mix native top-layer dialogs and body-portaled child modals in the same
workflow. Use DialogTitle inside each Dialog; complex dialog forms intentionally
do not describe the entire contents as one aria-describedby paragraph. The
standalone browser runtime is required; this wrapper is not an SSR API.

## Extended shared inventory

| Wrapper | Contract / usage |
| --- | --- |
| Select | Radix 2.4.1, MIT; controlled value/options, body portal, label and scroll controls; Builder, Team filters and Dispatcher |
| ActionMenu | Radix DropdownMenu 2.2.1, MIT; asChild Button trigger, body portal and item callbacks; Team actions |
| Tooltip | Radix Tooltip 1.4.1, MIT; asChild trigger and body portal; Dispatcher refresh |
| Sheet | Shared Dialog with a side-panel presentation; Dispatcher assignment/resource forms |
| Card / Badge / Avatar | Local token-styled surfaces; navigation, Team and Dispatcher |
| Textarea / Checkbox | Native labeled form controls; Team composer / Dispatcher override |
| Notice / LoadingState / Skeleton / EmptyState | Status/error, pending and empty presentation; preserve actual server feedback |
| Table | Native semantic table inside a labeled scroll region; Dispatcher appointment list |

The three added Radix packages use their official MIT primitives:
https://www.radix-ui.com/primitives/docs/components/select,
https://www.radix-ui.com/primitives/docs/components/dropdown-menu and
https://www.radix-ui.com/primitives/docs/components/tooltip. Exact versions and
integrity hashes are locked. Local wrappers and surfaces were authored in this
repository; no registry component source or premium template was copied.

Keep the single Preact runtime and existing CSS token strategy from ADR-0002;
Tailwind initialization is deliberately deferred to avoid introducing a second
reset/theme. New primitive families require their own browser qualification.

Beautiful UI (https://www.beautifului.dev/), RareUI (https://rareui.in/),
Magic UI (https://magicui.design/) and 21st.dev (https://21st.dev/) were reviewed
as references for chat/composition, restrained interaction and individual component
patterns. This release installs none of their libraries or templates. Their source
licenses/dependencies require review if a specific component is later adopted.
Animated decorative effects do not add value to a frequently used dispatch board;
its immediate drag/stretch feedback uses ordinary pointer-driven rendering.

[Current release evidence](../releases/2026-11-14-dispatcher.md) distinguishes tested
browser interactions from pending physical touch/accessibility qualification.
CRM/contracts/projects/accounting will reuse these wrappers as those modules ship.

## Review checklist

- [ ] Existing shared components/tokens reused; no conflicting theme/reset/runtime.
- [ ] Package/source provenance and license reviewed; lockfile updated if necessary.
- [ ] API/permission/error behavior remains unchanged or deliberately documented.
- [ ] Keyboard, focus, portals and dialog dismissal checked where relevant.
- [ ] Mobile/touch, dark mode, reduced motion and high-volume data views checked.
- [ ] Bundle cost and rendering performance proportionate to the business benefit.
- [ ] Browser/feel checks recorded separately from compile and automated test results.
