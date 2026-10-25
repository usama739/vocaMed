# VocaMed design tokens

Source of truth: the **VocaMed Frontend** design canvas (35 artboards). Tokens were read out of
every artboard's styles, de-duplicated, and written to `resources/css/app.css` inside one
`@theme` block, so each token is also a Tailwind utility (`bg-brand`, `text-ink`, `rounded-md`,
`shadow-menu`, `text-control` …). Nothing in `resources/js/components/vocamed/` uses a raw hex
value; a test enforces that, and another test fails if this file, `app.css` and
`resources/js/preview/tokens.ts` disagree.

See every token and component live at **`/components`** (local and testing environments only).

## Typefaces

| Role         | Family                                    | Notes                                                          |
| ------------ | ----------------------------------------- | -------------------------------------------------------------- |
| Latin and UI | **Inter** (variable, 400–700)             | `font-sans`; bundled with `@fontsource-variable/inter`, no CDN |
| Urdu         | **Noto Naskh Arabic** (variable, 400–700) | `font-urdu`; applied to any `:lang(ur)` subtree                |

Urdu text is set with **line-height 2** for body copy and **1.55** for headings, with letter-spacing
off. Latin headings use **1.2** and **−0.01em**. Body is 16px at line-height 1.6.
Phone numbers, times and e-mail fields stay left-to-right inside right-to-left text
(`dir="ltr"` on the value, `text-align: end` on fields).

## Type scale

The design only uses these sizes. Use the utility, not a pixel value.

| Utility        | Size            | Where                                                     |
| -------------- | --------------- | --------------------------------------------------------- |
| `text-caption` | 12px            | Keyboard hints, sidebar section labels                    |
| `text-small`   | 13px            | Helper text, status badges, table headers                 |
| `text-label`   | 14px            | Field labels, secondary text                              |
| `text-control` | 15px            | Buttons, nav items, table cells                           |
| `text-body`    | 16px            | Body text and inputs (16px stops iOS zooming into fields) |
| `text-lead`    | 18px            | Empty-state titles, countdowns                            |
| `text-title`   | 20px            | Panel and dialog titles                                   |
| `text-heading` | 26px            | Page titles (h1)                                          |
| `text-section` | 28–38px (fluid) | Landing section titles                                    |
| `text-display` | 30–42px (fluid) | Document page titles (privacy)                            |
| `text-hero`    | 34–56px (fluid) | Landing hero only                                         |

## Colour

### Brand

| Token         | Hex       | Use                                                 |
| ------------- | --------- | --------------------------------------------------- |
| `brand`       | `#1366D6` | Primary buttons, links, logo mark, selected borders |
| `brand-hover` | `#0F55B3` | Primary button hover, link text                     |
| `brand-deep`  | `#0B4491` | Text on brand tint                                  |
| `brand-tint`  | `#EAF2FE` | Selected chip, pressed toggle, hold banner          |
| `brand-wash`  | `#DDEBFE` | Avatar background                                   |
| `brand-line`  | `#BCD6FA` | Border of brand-tint surfaces                       |

### Navy (landing band)

| Token       | Hex       | Use                    |
| ----------- | --------- | ---------------------- |
| `navy`      | `#0B2A5B` | Landing closing band   |
| `navy-ink`  | `#D6E2F5` | Text on navy           |
| `navy-line` | `#7C97C6` | Outline button on navy |

### Text

| Token      | Hex       | Use                                              |
| ---------- | --------- | ------------------------------------------------ |
| `ink`      | `#071437` | Headings, input text, labels                     |
| `ink-soft` | `#2F3A56` | Unselected chip text                             |
| `copy`     | `#4B5675` | Paragraphs, secondary text                       |
| `subtle`   | `#5B6781` | Captions, placeholders, icons                    |
| `mute`     | `#7A869F` | Disabled microphone fill (icon only, never text) |

### Surfaces and lines

| Token            | Hex       | Use                        |
| ---------------- | --------- | -------------------------- |
| `canvas`         | `#F6F7F9` | App background, sidebar    |
| `surface-subtle` | `#F9FAFB` | Filter bars, table headers |
| `surface-hover`  | `#F4F6FA` | Secondary button hover     |
| `surface-row`    | `#FAFBFC` | Table row hover            |
| `surface-held`   | `#F1F3F8` | Slot held by someone else  |
| `line`           | `#E4E7EE` | Card and table borders     |
| `line-strong`    | `#D5D9E3` | Control borders            |
| `line-soft`      | `#EEF0F5` | Dividers inside cards      |
| `line-dashed`    | `#9AA6BF` | Dashed "add new" buttons   |

### Feedback

| Token             | Hex       | Use                            |
| ----------------- | --------- | ------------------------------ |
| `danger`          | `#B4153F` | Destructive button, recording  |
| `danger-ink`      | `#9B1239` | Destructive text, field errors |
| `danger-deep`     | `#7A0E2E` | Text on danger surface         |
| `danger-surface`  | `#FDEBEF` | Error alert background         |
| `danger-line`     | `#F1A3B5` | Error alert border             |
| `warning-surface` | `#FFF6E0` | Warning background             |
| `warning-line`    | `#F1C36B` | Warning border                 |
| `warning-ink`     | `#6B4300` | Warning text                   |
| `warning-accent`  | `#C98A00` | Low-confidence field border    |
| `success-surface` | `#EAF7EE` | Success background             |
| `success-line`    | `#9CD3AB` | Success border                 |
| `success-ink`     | `#14532D` | Success text                   |

### Status (background and text pairs)

Every status also has its own icon and label; colour is never the only signal.

| Status          | Background                   | Text                             | Same colours also used by |
| --------------- | ---------------------------- | -------------------------------- | ------------------------- |
| Booked          | `status-booked` `#E8ECF4`    | `status-booked-ink` `#2F3A56`    | Queued                    |
| Confirmed       | `status-confirmed` `#DDEBFE` | `status-confirmed-ink` `#0B4491` | Sent                      |
| Arrived         | `status-arrived` `#D9F2EA`   | `status-arrived-ink` `#0A5C4A`   |                           |
| In consultation | `status-consult` `#EBE3FC`   | `status-consult-ink` `#4C22A0`   |                           |
| Done            | `status-done` `#DFF3E4`      | `status-done-ink` `#14532D`      | Delivered                 |
| Cancelled       | `status-cancelled` `#FBE3EA` | `status-cancelled-ink` `#9B1239` | Failed                    |
| No-show         | `status-noshow` `#FDEBC8`    | `status-noshow-ink` `#7A4A00`    |                           |

Backgrounds: `status-booked`, `status-confirmed`, `status-arrived`, `status-consult`,
`status-done`, `status-cancelled`, `status-noshow`. Text colours: the same names with `-ink`.

### Overlay

`overlay` is `rgba(7, 20, 55, 0.45)`, the scrim behind dialogs and the slide-over.

### shadcn/ui names

The starter kit's components read semantic variables. They are mapped to the tokens above in
`:root`: `--primary` = `brand`, `--foreground` = `ink`, `--muted-foreground` = `subtle`,
`--border` = `line`, `--input` = `line-strong`, `--ring` = `brand`, `--destructive` = `danger`,
`--sidebar` = `canvas`, `--accent` = `surface-hover`.

### Contrast (WCAG 2.1, computed)

| Pair                                                             | Ratio                 | Needs        |
| ---------------------------------------------------------------- | --------------------- | ------------ |
| `ink` on white                                                   | 18.0                  | 4.5          |
| `copy` on white / on `canvas`                                    | 7.3 / 6.8             | 4.5          |
| `subtle` on white / `canvas` / `surface-subtle` / `surface-held` | 5.7 / 5.3 / 5.4 / 5.1 | 4.5          |
| white on `brand` / `brand-hover`                                 | 5.4 / 7.1             | 4.5          |
| `brand-deep` on `brand-tint`                                     | 8.3                   | 4.5          |
| white on `danger`                                                | 6.7                   | 4.5          |
| `danger-deep` on `danger-surface`                                | 9.5                   | 4.5          |
| `warning-ink` on `warning-surface`                               | 8.0                   | 4.5          |
| `success-ink` on `success-surface`                               | 8.3                   | 4.5          |
| Status text on status background                                 | 6.4 – 9.5             | 4.5          |
| Focus ring `brand` on white / `canvas`                           | 5.4 / 5.0             | 3 (non-text) |
| White icon on `mute`                                             | 3.7                   | 3 (non-text) |

## Radii

| Utility        | Size  | Where                                 |
| -------------- | ----- | ------------------------------------- |
| `rounded-xs`   | 6px   | Keyboard keys                         |
| `rounded-sm`   | 8px   | Menu items, segmented-switch buttons  |
| `rounded-md`   | 10px  | Every control: buttons, inputs, chips |
| `rounded-lg`   | 12px  | Alerts, toasts                        |
| `rounded-xl`   | 14px  | Tables, inner cards                   |
| `rounded-2xl`  | 16px  | Page cards, dialogs, slide-over       |
| `rounded-full` | 999px | Badges, pills, avatars                |

## Shadows

| Utility        | Value                                 | Where                  |
| -------------- | ------------------------------------- | ---------------------- |
| `shadow-xs`    | `0 1px 2px rgba(7, 20, 55, 0.06)`     | Active nav item        |
| `shadow-card`  | `0 3px 4px rgba(0, 0, 0, 0.03)`       | Resting cards          |
| `shadow-lift`  | `0 10px 30px rgba(7, 20, 55, 0.07)`   | Hovered cards          |
| `shadow-menu`  | `0 12px 28px rgba(7, 20, 55, 0.12)`   | Dropdowns, toasts      |
| `shadow-panel` | `0 20px 50px rgba(7, 20, 55, 0.14)`   | Booking slide-over     |
| `shadow-glow`  | `0 6px 16px rgba(19, 102, 214, 0.28)` | Hovered primary button |
| `shadow-modal` | `0 20px 50px rgba(7, 20, 55, 0.25)`   | Confirm dialog         |

## Motion

Utilities: `animate-rise` (fade up 12px, 420ms), `animate-fade`, `animate-pop` (spring scale-in),
`animate-draw` (stroke draw), `animate-caret`, `animate-float`, `animate-pulse-ring`; the `.reveal`
class plus `<Reveal>` fades sections in once as they scroll into view. Easing is `ease-out-soft`
(`cubic-bezier(0.2, 0.7, 0.2, 1)`) and `ease-spring`. One rule in `app.css` makes every animation and
transition settle instantly under `prefers-reduced-motion`.

## Motion

Utilities: `animate-rise` (fade up 12px, 420ms), `animate-fade`, `animate-pop` (spring scale-in),
`animate-draw` (stroke draw), `animate-caret`, `animate-float`, `animate-pulse-ring`; the `.reveal`
class plus `<Reveal>` fades sections in once as they scroll into view. Easing is `ease-out-soft`
(`cubic-bezier(0.2, 0.7, 0.2, 1)`) and `ease-spring`. One rule in `app.css` makes every animation and
transition settle instantly under `prefers-reduced-motion`.

## Focus ring

**3px solid `brand`, 2px outside the element**, on every interactive element
(`a`, `button`, `input`, `select`, `textarea`, `summary`, `[tabindex]`) via `:focus-visible`.
The rule in `app.css` is deliberately unlayered so it beats the `outline-none` and `ring-*`
classes inside the shadcn components, and it switches their ring shadow off so there is one
ring, not two. Do not add per-component focus styles.

## Sizes and spacing

- **Tap targets are at least 44px** in both directions. Buttons are 44 (`sm`, `icon`), 48
  (default) or 52px (`lg`); inputs and chips are 48px; nav items, breadcrumbs, menu items and
  table row actions are 44px or more. `e2e/components.spec.ts` measures every button and link on
  the preview page.
- The sidebar is 272px wide; the booking panel is 480px; the app card sits on `canvas` with a
  12px gutter. Page content padding is 28px; cards use 16–20px.
- Motion respects `prefers-reduced-motion` (the recording pulse and spinners stop).

## Language and direction

`<html lang dir>` is set by the server from the `locale` cookie. All layout uses logical
utilities (`ms-*`, `pe-*`, `start-*`, `text-start`, `border-s`, `rounded-s` …); an ESLint rule
rejects `ml-`, `pr-`, `left-`, `text-left` and similar in `resources/js`. Icons that point
(breadcrumb chevrons) flip with `rtl:-scale-x-100`.

## Where this differs from the design canvas

The canvas is the visual source of truth; these are the places the code does something different
and why.

| Design                                                  | Code                                       | Why                                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language buttons 38px, "Show/Hide" password button 40px | 44px                                       | Tap-target rule                                                                                                                                             |
| Up/down chevron beside the clinic name in the sidebar   | Omitted                                    | It implies a clinic switcher; the spec has none                                                                                                             |
| Toasts are an inline banner at the top of the page      | Floating, bottom-centre, 44px dismiss      | Toasts must be reachable from anywhere (including the slide-over) without layout shift                                                                      |
| Confirm dialog sits near the top                        | Centred                                    | Radix default; same card, scrim and shadow                                                                                                                  |
| Review card steps time by 30 minutes                    | Steps through the doctor's real free slots | A time that is not a free slot cannot be booked                                                                                                             |
| Appointment "No-show" in Urdu appears as two spellings  | One spelling, `غیر حاضر`                   | One label per status                                                                                                                                        |
| Light only                                              | Light only; the app now defaults to light  | The starter kit followed the system dark setting, which left the sidebar dark against white cards. The `.dark` values are the kit's, not part of the design |
| Inline styles and Google Fonts links                    | Tailwind utilities and self-hosted fonts   | Project conventions                                                                                                                                         |

Decisions made where the spec and the design disagreed (confirmed with the project owner):

- **Clinic name** sits at the top of the sidebar (design), not in the top bar (spec).
- **Voice review buttons** are _Confirm booking_, _Record again_, _Discard_, with every field
  editable in place (design), not _Confirm_, _Edit_, _Discard_ (spec).

## Placeholders and sample data

Bracketed text (`[Clinic name]`, `[User name]`, `[Patient name]`) is a placeholder the server will
fill in; it stays bracketed in every language. Names, phone numbers and times on `/components`
and in `resources/js/lib/data` are sample data and are labelled "Sample data" wherever they appear.
No testimonials, statistics or logos are used anywhere.
