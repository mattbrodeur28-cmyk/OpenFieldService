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

## Planned shared component inventory

Dialog, Tabs, Button and input/field wrappers are implemented. Next qualify
DropdownMenu and Select/Combobox, then establish Textarea, Checkbox/Switch, Card,
Badge, Avatar, Sheet, Popover, Tooltip, Toast, Skeleton and DataTable wrappers.
Standardize loading/empty/error/permission states and light/dark themes. Migrate one
vertical workflow at a time and retain its existing functional acceptance tests.

Choose Radix-backed shadcn components consistently when that compatibility path is
proven. Beautiful UI, RareUI, Magic UI and 21st.dev are reviewed sources for specific
components and interaction patterns, not permission to install every catalog or
combine several complete themes. Record each adopted component's upstream URL,
revision/license, local changes, added dependencies and validation evidence.

## Review checklist

- [ ] Existing shared components/tokens reused; no conflicting theme/reset/runtime.
- [ ] Package/source provenance and license reviewed; lockfile updated if necessary.
- [ ] API/permission/error behavior remains unchanged or deliberately documented.
- [ ] Keyboard, focus, portals and dialog dismissal checked where relevant.
- [ ] Mobile/touch, dark mode, reduced motion and high-volume data views checked.
- [ ] Bundle cost and rendering performance proportionate to the business benefit.
- [ ] Browser/feel checks recorded separately from compile and automated test results.
