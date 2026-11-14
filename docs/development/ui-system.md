# UI implementation guide

The selected sources, compatibility decision and motion rules are defined in
[ADR-0001](../architecture/decisions/0001-ui-system.md). Feature IDs UI-001 through
UI-008 in [Features.md](../../Features.md) track adoption.

## Current reusable component

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

## Planned shared component inventory

After the framework compatibility checkpoint, establish Button, Input, Field,
Textarea, Select/Combobox, Checkbox/Switch, Card, Badge, Avatar, Dialog/Sheet,
DropdownMenu, Popover, Tabs, Tooltip, Toast, Skeleton and DataTable wrappers.
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
