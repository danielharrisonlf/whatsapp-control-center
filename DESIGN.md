# Design

The contract every screen follows. When a new screen disagrees with this file, the screen is wrong.

## Scene

Developers and WhatsApp administrators at a desk, often with the Meta App dashboard open in another tab, debugging webhooks or preparing templates for long stretches. They need to answer "is it working, and if not, why?" quickly. Both themes are first-class; **System** is the default.

Mode: **operate**. Familiar patterns, dense information, no decoration. Delight is reserved for the WhatsApp preview, the only place that imitates another product.

## Layout

- **Framed shell.** Sidebar (224px) sits on the canvas; the working area is one bordered panel (`radius 10px`, 8px inset on desktop, full-bleed on mobile).
- Page = `PageHeader` (title, short description, actions on the right) + body with a 24px gutter. Tables run edge to edge with their first and last columns aligned to the gutter.
- No cards inside cards. A `Section` is a heading plus content; it gets a border only when it holds a list (`framed`).
- Side sheets (not modals) for inspecting records (events, logs, messages). Dialogs only for confirmations and short creation forms.

## Type

- **IBM Plex Sans** (variable, self-hosted) for everything. **IBM Plex Mono** only for data: IDs, wamids, JSON, template names, codes.
- Base 14px. Steps: 11 (group labels) · 12 · 13 (secondary) · 14 (body) · 16 (dialog titles) · 20 (page titles). Headings use weight, not size jumps.
- Numbers in tables, stats and times are `tabular-nums`.

## Color

Cool graphite neutrals plus one green accent. Tokens live in `apps/www/src/styles.css`; dark redefines the same names.

| Token | Use |
|---|---|
| `canvas` / `surface` / `raised` / `sunken` / `overlay` | App background, panel, hovered and secondary surfaces, inputs, menus |
| `fg` / `muted` / `subtle` | Primary text, secondary text (≥4.5:1), tertiary labels |
| `accent` | Primary buttons, active navigation icon, focus ring, selection. Nothing decorative |
| `success` / `warning` / `danger` / `info` (+ `-soft`, `-text`) | Status only, always with a label or icon. Warning never as text on light backgrounds (`warning-text` is the dark amber) |
| `chart-1…4` | Sent, delivered, read, failed. Validated with the dataviz palette checker in both themes |

Dark mode is not inverted light: surfaces step up in lightness for elevation, accents are desaturated and lighter, text is `#E4E7EB`, not white.

## Components

- Every interactive control has default, hover, active, focus-visible (2px ring), disabled and loading states (`Button loading` keeps its width and shows a spinner).
- Status is a `Badge` with a dot and a word (`Approved`, `Bad signature`). Never color alone.
- `IdChip` for every Meta identifier: mono, truncates, click to copy.
- Errors: `ErrorPanel` names the problem in plain language (Meta's `error_user_title` or our hint table) with **Technical details** (code, subcode, fbtrace_id, request id, sanitized raw) folded.
- Loading: skeletons shaped like the content. Empty states explain what will appear and how to make it appear.
- Destructive actions use `ConfirmDialog`, which lists consequences; irreversible ones require typing a name.
- Things the API cannot do get `ManualActionNotice` ("This action must be completed in Meta Business Manager.") with a link. Never a fake success.

## Motion

150–220ms ease-out for state changes (menus, sheets, hover). No page-load choreography. Theme switching disables transitions for one frame. `prefers-reduced-motion` collapses all motion.

## Copy

- Controls name the action: "Submit for review", "Deregister number", "Reveal verify token".
- Explain Meta constraints where they bite: 24h window, 10 register/deregister per 72h, 30-day name reuse, 7-day media retention.
- No eyebrows, no "Are you sure?", no emoji as icons, no `·` chains of metadata.
