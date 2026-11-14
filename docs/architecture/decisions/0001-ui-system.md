# ADR-0001: UI component and interaction system

Date: 2026-11-14

Status: Accepted direction; staged adoption. NumberFlow is the first runtime slice.
React-component compatibility and broad screen migration remain planned work.

## Context

The product needs a consistent modern UI for dispatch, CRM, agreements, accounting,
collaboration and AI. The current app uses Preact, Vite, TypeScript, Lucide and CSS
tokens. Existing business behavior and accessibility must survive modernization.
The owner requested the sources below; they serve different purposes and should
not introduce independent competing design systems into individual screens.

## Decision and source roles

| Source | Intended role | Adoption boundary |
| --- | --- | --- |
| [shadcn/ui](https://ui.shadcn.com/docs) | Primary source-owned component system and enterprise app patterns | Keep selected components in the repository; normalize to shared tokens and documented variants |
| [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction) | Accessible dialog, menu, popover, select, tabs and related behavior | Prefer one primitive family under shadcn wrappers; Radix Themes is not an additional visual theme |
| [NumberFlow](https://number-flow.barvian.me/vanilla) | Transitions for meaningful changes in selected operational counters | Framework-independent custom element behind a local adapter; static initial value, reduced-motion support and accessible text |
| [Emil Kowalski skills](https://github.com/emilkowalski/skills) | Design engineering, motion and interaction review guidance | Development guidance, not a browser dependency; requested Radix choice takes precedence over different library suggestions |
| [Beautiful UI](https://www.beautifului.dev/) | AI/chat interaction and information-presentation references | Adapt suitable prompt, approval, context, task and diff patterns; do not fabricate reasoning, tools, progress or completion |
| [RareUI](https://rareui.in/) | Selected interaction/component references | Review each proposed component's source, license, dependencies, accessibility and framework requirements before adoption |
| [Magic UI](https://magicui.design/) | Selected microinteractions, empty/onboarding states and public-site effects | Keep operational tables, financial figures and frequent dispatch actions clear and fast |
| [21st.dev](https://21st.dev/) | Discovery of selected component/block implementations | Review the individual author/component and license; adapt locally instead of importing a second complete theme |

Use source-owned components in `src/client/components/ui` with shared tokens,
variants and a documented API. Product modules consume these wrappers rather than
copying a different button/dialog/table implementation into every feature.
Business permissions and persistence remain server responsibilities.

## Framework and styling compatibility

shadcn's React setup, Radix React primitives and many source components target a
React ecosystem. This repository currently uses Preact; adding packages is not proof
of compatibility. Do not silently bundle a second React runtime or partially migrate
screens between rendering frameworks.

Before importing those components into production:

1. Prototype one dialog, dropdown, select, tabs and validated form with the actual
   production bundler/type configuration; include portals, refs and nested dialogs.
2. Verify keyboard behavior, focus trapping/return, dismissal, screen readers,
   mobile interaction and reduced motion in a real browser.
3. Inspect the built dependency graph for duplicate runtimes and measure bundle cost.
4. Record whether tested Preact compatibility is supportable. If not, propose a
   dedicated React migration with regression criteria and a rollback plan.
5. Decide/document the Tailwind/CSS integration and token mapping before running a
   component initializer. Avoid broad CSS resets or an uncontrolled CLI overwrite
   of the existing stylesheet during another feature change.

NumberFlow has a framework-independent API and can be adopted without that runtime
migration. Its adapter is the first implemented slice. This ADR does not mean
shadcn/Radix or every reference library is already installed or every screen migrated.

## Interaction and motion standards

- Favor clear hierarchy, compact readable data, predictable navigation and coherent
  light/dark tokens over decoration. Preserve useful information density for dispatch.
- Motion must communicate feedback, state or spatial relationships. Frequent keyboard
  actions are immediate; do not delay work behind an animation.
- Simple hover/press/state changes use CSS. Add a motion library only for a reviewed
  interaction needing gestures, springs, layout or exit coordination.
- Name transitioned properties; avoid `transition: all`, layout-property animation,
  large bounces and entry from `scale(0)`. Restrict hover motion to capable pointers.
- Honor `prefers-reduced-motion`; use short purposeful transitions. Dashboard counter
  updates use 200 ms movement with static first render. Money remains static in the
  current slice; never animate an amount while someone is reviewing or entering it.
- Use focus-visible states, labels, keyboard alternatives, adequate touch targets and
  reduced-motion checks as acceptance criteria, not later polish tasks.
- Never present an optimistic animation as proof that a message, invoice, assignment,
  payment or AI-generated change was saved. Show pending/success/failure accurately.

## Licensing, maintenance and review

Record upstream source/version/license for copied components, preserve notices and
review added dependencies. Do not copy premium/proprietary templates without the
appropriate rights. Registry instructions and generated source are reviewed as code.
Pin reproducible dependency resolution in the lockfile; document local customizations
and the process for upstream accessibility/security fixes.

Verification distinguishes compilation, automated tests, browser behavior, animation
feel and live service proof. A passing build does not prove focus management, touch
behavior or Preact/React component compatibility.

## Rollout

1. UI-001: this ADR, source roles and adoption criteria.
2. UI-002: reusable NumberFlow adapter and selected dashboard counters.
3. UI-003: Preact/React and Tailwind/component compatibility decision.
4. UI-004: shared shadcn/Radix wrappers and an example component inventory.
5. UI-005: profile/settings and integrations dialogs, then navigation/channel/Builder.
6. UI-006: Dispatcher, CRM, contracts and accounting screens reuse the same system.

Track completion and evidence in Features.md. The unfinished workspace changes
remain separate from this dependency/component adoption slice until verified.
