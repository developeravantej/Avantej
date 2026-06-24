# Avantej · Design Guidelines

Derived from `Brand Kit rev1.pdf` (2024). Scope: native app + web dashboard.

The brand is **monochrome + warm neutrals**. There is no accent color. Every screen should feel calm, editorial, and high-contrast. Restraint is the design principle.

---

## 1. Brand Personality

| Trait | What it means in UI |
|-------|---------------------|
| Editorial | Spacious layouts, serif-free but expressive sans-serif headlines, slow rhythm |
| Restrained | One focal point per screen. No accent color spam, no decorative gradients |
| Premium | Strong typographic hierarchy carries the design — not color, not illustration |
| Identity-forward | The fingerprint mark is the only ornament needed |

**Avoid:** purple/blue fintech gradients · glassmorphism · neon accents · rainbow status pills · rounded cartoon iconography.

---

## 2. Logo

### Marks
- **Wordmark + fingerprint** (default for splash, web header, marketing)
- **Fingerprint only** (favicon, app icon, small spaces, ≤ 32 px)
- **All-white on black** for dark surfaces
- **All-black on white** for light surfaces

### Spacing
Clear-space `x` = the letter height of "v" in the wordmark. No graphic or text inside that buffer on any side.

### Minimum size
- Wordmark + fingerprint: **120 px wide**
- Fingerprint only: **24 px**

### Don'ts (from brand kit)
- ❌ No color shifts (no green, blue, etc. logos)
- ❌ No rotation
- ❌ No outline-only treatments unless on photographic backgrounds
- ❌ No skew / scale-distort
- ❌ No drop shadows on the mark

---

## 3. Color Tokens

The brand palette is intentionally narrow: **3 primaries + 3 secondaries**, monochrome only.

### Primary

| Token | Hex | RGB | Native key (`colors.ts`) | Tailwind |
|-------|-----|-----|---------------------------|----------|
| **Ink** (primary text, logo, CTA bg) | `#000000` | 0, 0, 0 | `colors.primary[1]` | `primary-1` |
| **Paper** (cards, CTA text, surfaces) | `#FFFFFF` | 255, 255, 255 | `colors.primary[2]` | `primary-2` |
| **Mist** (app background, soft surface) | `#F3F3F3` | 243, 243, 243 | — (add as `colors.primary[3]`) | `primary-3` |

### Secondary (neutrals + warm tints)

| Token | Hex | RGB | Use |
|-------|-----|-----|-----|
| **Slate** | `#8A8F91` | 138, 143, 145 | Secondary text, muted labels, inactive states |
| **Sage** | `#D9D9CA` | 217, 217, 202 | Hero blocks, highlight panels, badge backgrounds |
| **Linen** | `#EDEDE4` | 237, 237, 238 | Tab inactive bg, card-on-mist contrast layer |

### Functional (not in brand kit — add cautiously)

These are utility colors that the brand kit doesn't specify but the product needs. Keep saturation low so they don't fight the monochrome system.

| Token | Hex | Use |
|-------|-----|-----|
| **Success** | `#16A34A` (deep) | Confirmation badges only — never as a brand accent |
| **Warning** | `#D97706` (amber-dark) | Expiry / pending offline payment |
| **Destructive** | `#B91C1C` (deep red) | Cancel / reject only |

**Rule:** functional colors live in icons + badges + inline alerts. Never as a button fill, never edge-to-edge, never as decoration.

### Native mapping

Current `apps/native/lib/colors.ts` defines `primary[1]` (ink), `primary[2]` (paper), `secondary[1]` (slate), `secondary[2]`, `secondary[3]`. Align as:

```ts
primary[1] = "#000000"   // ink
primary[2] = "#FFFFFF"   // paper
primary[3] = "#F3F3F3"   // mist  ← add this if missing
secondary[1] = "#8A8F91" // slate
secondary[2] = "#D9D9CA" // sage
secondary[3] = "#EDEDE4" // linen
```

---

## 4. Typography

Three families. Each has one defined weight. Do not introduce other weights without explicit reason.

| Role | Family | Weight | Sample use |
|------|--------|--------|------------|
| **Heading** | Nordeco | Bold | Screen titles, hero metrics, success states |
| **Subheading** | Metropolis | Medium | Section labels, mid-emphasis copy, card titles |
| **Body** | Plus Jakarta Sans | Regular | Paragraphs, captions, list rows, metadata |

### Scale (mobile-tuned from brand-kit print scale)

| Token | Family | Size | Line height | Use |
|-------|--------|------|-------------|-----|
| `display` | Nordeco Bold | 42 / 32 | 1.05 | Splash + onboarding hero numerals |
| `title-xl` | Nordeco Bold | 32 | 1.1 | Screen title (e.g., "Booking Confirmed!") |
| `title-lg` | Nordeco Bold | 24 | 1.15 | Card hero text |
| `title-md` | Nordeco Bold | 20 | 1.2 | Section title |
| `subheading` | Metropolis Medium | 16–18 | 1.3 | Card titles, sub-labels |
| `body` | Plus Jakarta Sans Reg | 14–16 | 1.5 | Paragraphs, descriptions |
| `caption` | Plus Jakarta Sans Reg | 12 | 1.4 | Metadata, timestamps, footnotes |
| `label-uppercase` | Plus Jakarta Sans Reg | 11 | 1.3 (tracking `0.15em`, uppercase) | Section labels ("ACTIVE", "UP NEXT") |

### Rules
- Headings stay in **Nordeco Bold only**. Never use it for body.
- Body never exceeds 16 pt on mobile.
- Section labels (e.g., `BOOKING DETAILS`, `UP NEXT`) are **Plus Jakarta Sans Regular**, uppercase, tracked `0.15em`, Slate color.
- Do not use italic for body. The brand voice is calm + factual, not expressive.
- Never mix more than 3 type sizes inside a single card.

### Native font.ts mapping (already correct)
```ts
heading: "Nordeco"
subheading: "Metropolis-Medium"
body: "PlusJakartaSans-Regular"
```

---

## 5. Spacing System

Brand kit defines logo clear-space via `x`. Apply the same modular logic to the UI:

- **Base unit:** 4 px
- **Scale:** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64

### Layout rules
- Screen edge padding: **16 px** mobile, **24 px** tablet/web
- Card internal padding: **16–20 px**
- Card-to-card vertical gap: **12–16 px**
- Section-to-section vertical gap: **24–32 px** (use generously — match brand-kit print breathing room)
- Inline gap between icon + label: **6–8 px**

---

## 6. Radius & Surfaces

The brand kit is sharp-edged for logo/typography, soft for product surfaces. Match that:

| Element | Radius |
|---------|--------|
| Cards / surfaces | 16 px (`rounded-2xl`) |
| Buttons | 12 px |
| Pills / badges | full (999) |
| Image hero | 16 px |
| Icon button bg | 999 (circular) |
| Brand chrome (header bar) | sharp (0) — keep alignment with logotype |

### Elevation
- Default cards: no shadow, **1 px hairline border** in Linen `#EDEDE4`
- Floating sheets / modals: `shadow-lg` (subtle, never colored)
- No glass blur on light surfaces. Reserve subtle blur for image-backed dark surfaces only.

---

## 7. Iconography

The fingerprint mark is bold-rounded-line — match that mood:

- Use **Ionicons outline** family by default (existing project standard)
- Stroke weight: **1.5–2 px** consistent across screen
- Size scale: **14 (inline), 16 (label), 20 (button), 24 (header), 28+ (emphasis)**
- Color: inherit text color — never tint icons independently
- Don't mix outline + filled inside the same screen unless used as an "active" state

### Specific icon mapping (current app conventions to preserve)

| Domain | Icon |
|--------|------|
| Calendar | `calendar-outline` |
| Time | `time-outline` |
| Trainer / person | `person-circle-outline` |
| Branch / building | `business-outline` |
| Package | `cube-outline` |
| Credits / rating | `star-outline` |
| Notification | `notifications-outline` |
| Payment / wallet | `wallet-outline` |
| Settings | `settings-outline` |
| Confirmation | `checkmark-circle` |
| Warning | `alert-circle` |
| Destructive | `close-circle-outline` |

---

## 8. Components

### Buttons

| Variant | BG | Text | Use |
|---------|-----|------|-----|
| **Primary** | Ink `#000` | Paper `#FFF` | The single main action per screen |
| **Secondary** | Paper `#FFF`, 1 px Ink border | Ink | Tertiary action / "Cancel" / outline |
| **Ghost text** | transparent | Ink | Inline links, low-emphasis |
| **Destructive text** | transparent | `#B91C1C` | Cancel booking, reject |

- One primary button per screen. Never two side-by-side.
- Min height: **48 px** (touch target). Padding: 16 px vertical, 20 px horizontal.
- Disabled state: 50% opacity.

### Cards
- BG: Paper `#FFF`
- Border: 1 px Linen `#EDEDE4`
- Radius: 16
- Padding: 16–20 px
- Optional internal section divider: 1 px Linen, full-width, with 12 px top/bottom padding

### Status badges
Use these consistently across web + native:

| Status | BG | Text |
|--------|-----|------|
| Confirmed / Active | `#DCFCE7` (success-tint) | `#16A34A` |
| Completed | Linen `#EDEDE4` | Slate `#8A8F91` |
| Pending / Pending offline | `#FEF3C7` (warning-tint) | `#D97706` |
| Cancelled | `#FEE2E2` (destructive-tint) | `#B91C1C` |
| No-show | `#FEF3C7` | `#D97706` |

Pill shape (full radius), small size (text-xs), 10 px horizontal padding.

### Headers
- Back arrow on left, screen title text-2xl Nordeco Bold, optional right-side action (text label preferred over icon — e.g., "Cancel" not `…`)
- Vertical padding: 16 top, 8 bottom

### Progress
- Bar height: **2–3 px** (thin, editorial)
- BG: Linen `#EDEDE4`
- Fill: Ink `#000`
- Avoid colored progress bars

---

## 9. Photography & Imagery

The brand has no defined imagery, so default to:

- **Editorial fitness photography** — desaturated, warm tones, no over-bright stock-photo vibes
- Always inside a 16:9 or 4:3 framed block with 16 px radius
- Apply a subtle **gradient scrim** (`from-black/30 to-transparent`) under any text overlay to preserve readability
- Avoid lifestyle "stock model smiling at camera" shots. Prefer action/atmospheric.

Placeholder image (project default): `https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800`

---

## 10. Motion & Feedback

- Transitions: 200–300 ms ease-out for sheets, modals, navigation
- Tap feedback: 0.6 opacity press state (`activeOpacity={0.7}` on TouchableOpacity)
- Loading skeletons preferred over spinners for content areas
- Toast / alert: avoid colored backgrounds — use a neutral surface with an inline icon

---

## 11. Web Dashboard Notes

The web admin dashboard inherits the same palette + typography. Variations:

- Tables: hairline rows (1 px Linen), 14 px body, generous row padding (12 px)
- Sidebar: Mist background, active item in Ink with Paper text
- Filter chips / segmented controls: pill shape, Ink active, Paper inactive with Linen border
- Use the shadcn/ui defaults — they map cleanly to this palette. Override their primary color to `#000` not the default zinc tone.

---

## 12. Do / Don't Quick Reference

| Do | Don't |
|----|-------|
| Use Ink as the only true "color" | Introduce blue/purple/teal brand accents |
| Use Sage / Linen for warmth | Add gradients on cards |
| Use uppercase labels in Slate sparingly | Stack 4+ pills on a single row |
| Lead with typographic hierarchy | Lead with colorful icons |
| Keep status pills small + token-based | Mix outline + filled icon styles |
| Preserve the fingerprint mark's proportions | Recolor the logo |
| One primary action per screen | Place two equally-weighted CTAs side by side |
| Use generous vertical rhythm | Cram dense cards together |

---

## 13. File References

- Brand kit source: `apps/native/Brand Kit rev1.pdf`
- Font files: `apps/native/assets/fonts/{Nordeco-Bold.otf, Metropolis-Medium.otf, PlusJakartaSans-Regular.ttf}`
- Native color tokens: `apps/native/lib/colors.ts`
- Native font tokens: `apps/native/lib/font.ts`
- Web globals: `apps/web/src/styles/` (apply same palette via Tailwind config)

When in doubt: **fewer colors, bigger type, more whitespace, sharper hierarchy.**
