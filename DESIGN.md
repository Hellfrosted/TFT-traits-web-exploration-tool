---
name: "TFT Board Exploration Tool"
description: "A dense tactical desktop UI for fast local TFT board search."
colors:
  tactical-bg: "#101415"
  tactical-panel: "#181d1e"
  tactical-panel-raised: "#1d2425"
  tactical-panel-control: "#121718"
  tactical-panel-hover: "#2a3234"
  tactical-border: "#2d3638"
  tactical-border-strong: "#3b474a"
  tactical-text: "#eef3f0"
  tactical-text-muted: "#b3bdb9"
  tactical-text-dim: "#88928f"
  command-green: "#7ec488"
  command-green-strong: "#679f71"
  command-green-muted: "#213127"
  command-green-border: "#34513c"
  warning-gold: "#cab37c"
  danger-coral: "#d1847b"
  danger-coral-strong: "#98514b"
typography:
  display:
    fontFamily: "Bahnschrift, Franklin Gothic Medium, Aptos, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Bahnschrift, Franklin Gothic Medium, Aptos, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "Bahnschrift, Franklin Gothic Medium, Aptos, sans-serif"
    fontSize: "0.96rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Aptos, Calibri, Tahoma, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Aptos, Calibri, Tahoma, sans-serif"
    fontSize: "0.81rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  pill: "999px"
spacing:
  2xs: "0.25rem"
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  2xl: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.command-green-strong}"
    textColor: "#0b130d"
    rounded: "{rounded.md}"
    padding: "0.65rem 0.85rem"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.tactical-panel-hover}"
    textColor: "{colors.tactical-text}"
    rounded: "{rounded.md}"
    padding: "0.65rem 0.85rem"
    height: "44px"
  field-control:
    backgroundColor: "{colors.tactical-panel-control}"
    textColor: "{colors.tactical-text}"
    rounded: "{rounded.md}"
    padding: "0.65rem 0.75rem"
    height: "44px"
  chip-active:
    backgroundColor: "{colors.command-green-muted}"
    textColor: "#d9f0de"
    rounded: "{rounded.sm}"
    padding: "0.25rem 0.55rem"
  panel:
    backgroundColor: "{colors.tactical-panel}"
    textColor: "{colors.tactical-text}"
    rounded: "{rounded.lg}"
    padding: "1rem"
---

# Design System: TFT Board Exploration Tool

## 1. Overview

**Creative North Star: "The Tactical Console"**

This system should feel like a compact local command surface for experienced Teamfight Tactics players: dark, stable, and fast to scan while a player is planning under time pressure. The interface is not a themed game skin. It borrows TFT flavor through Community Dragon unit and trait assets, then keeps the surrounding chrome operational.

The visual language is dense but orderly: a fixed control rail, a results workspace, compact typographic steps, shallow rounded corners, restrained borders, and one green command accent for primary actions and selected states. The system rejects marketing drama, decorative dashboards, and novelty animation. Every visual choice must help users see constraints, query state, and ranked boards faster.

**Key Characteristics:**
- Dark neutral tactical surfaces with low-chroma green command states.
- Dense desktop-first controls with explicit labels, hints, and visible status.
- Compact panels, tables, chips, and dropdowns that preserve scan speed.
- Functional depth from borders, tonal layers, and one ambient shadow.
- Game assets appear inside data objects, not as background decoration.

## 2. Colors

The palette is a restrained dark product system: cool charcoal surfaces, high-contrast text, and a single green accent reserved for command, focus, and active query state.

### Primary
- **Command Green**: The only primary accent. Use it for primary buttons, active chips, focused borders, selected rows, and rank emphasis.
- **Command Green Strong**: The default primary button fill. It is calmer than the hover state so repeated use does not glare.
- **Command Green Muted**: The selected-chip and query-chip surface. It carries state without becoming decorative.

### Secondary
- **Warning Gold**: Use only for warning text or cautionary data states.
- **Danger Coral**: Use only for destructive actions, errors, cancellation, and alert emphasis.

### Neutral
- **Tactical Background**: The application canvas. It should stay dark and quiet.
- **Tactical Panel**: The main panel surface for controls, workspace, and modals.
- **Raised Panel**: Header strips, summary cards, table headers, and secondary containers.
- **Control Well**: Inputs, status panels, and table bodies.
- **Tactical Border**: The default divider and panel stroke.
- **Tactical Text**: Primary text on all dark surfaces.
- **Muted Text**: Secondary copy, labels, table headers, hints, and metadata.
- **Dim Text**: Empty states and low-priority helper copy.

### Named Rules

**The One Command Color Rule.** Green is functional, not decorative. If a green element is not an action, selected state, focus state, or ranked signal, remove the green.

**The Dark Workspace Rule.** Do not introduce light cards, cream canvases, purple gradients, or poster-like hero sections. This is an in-game planning tool, not a marketing page.

## 3. Typography

**Display Font:** Bahnschrift with Franklin Gothic Medium, Aptos, and sans-serif fallbacks.
**Body Font:** Aptos with Calibri, Tahoma, and sans-serif fallbacks.
**Label/Mono Font:** No separate mono family. Numeric clarity comes from tabular-number features on the body stack.

**Character:** The type system is compact and utilitarian. Bahnschrift gives headings a tactical desktop feel, while Aptos keeps controls, labels, and data readable at dense sizes.

### Hierarchy
- **Display** (600, 1.4rem, 1.1): App title only. Never use hero-scale display type in this product UI.
- **Headline** (600, 1.15rem, 1.2): Workspace titles and primary panel headings.
- **Title** (600, 0.96rem, 1.25): Section headings, modal titles, and spotlight headings.
- **Body** (400, 0.875rem, 1.5): Default UI copy, input values, table cells, and status text.
- **Label** (600, 0.81rem, 1.4): Form labels, metadata, table labels, and compact helper text.
- **Data Microcopy** (600-700, 0.70rem-0.82rem): Stat labels, chips, row metadata, and tooltip rows.

### Named Rules

**The Dense-But-Legible Rule.** Keep type fixed in rems and avoid fluid clamp sizing. Responsive behavior changes structure, not the typography scale.

**The No Display Labels Rule.** Display fonts belong to headings only. Labels, buttons, chips, and table data must stay in the UI/body stack.

## 4. Elevation

Depth is a hybrid of tonal layering, 1px borders, and one ambient shadow. Panels use the shadow to separate large regions from the dark canvas; most internal components rely on border and surface changes instead. Hover and active states should change tone, not jump forward dramatically.

### Shadow Vocabulary
- **Panel Ambient** (`0 12px 28px rgba(0, 0, 0, 0.28)`): Main panels, dropdowns, tooltips, and modals only.

### Named Rules

**The Single Shadow Rule.** Use the ambient shadow only for surfaces that genuinely sit above the app: main panels, dropdowns, tooltips, and modals. Do not stack custom shadows on buttons or chips.

**The Border-First Rule.** Internal hierarchy is created with `1px` strokes and tonal surfaces before shadow.

## 5. Components

### Buttons
- **Shape:** Compact rounded rectangle (0.5rem radius) with a 44px minimum hit target.
- **Primary:** Command Green Strong fill, Command Green Border stroke, dark button text, 0.65rem 0.85rem padding, 600 weight.
- **Hover / Focus:** Hover shifts to Command Green. Focus uses a 2px Command Green outline with a 2px offset.
- **Secondary / Ghost:** Outline buttons use raised charcoal surfaces, strong borders, and primary text. They hover by shifting only to the surface-hover tone.
- **Danger:** Cancellation and destructive actions use Danger Coral Strong with Danger Coral hover and a separate coral focus ring.

### Chips
- **Style:** Chips are compact inline-flex pills with 0.375rem radius, small icons, and 0.25rem 0.55rem padding.
- **State:** Active or selected chips use Command Green Muted with Command Green Border. Neutral unit and trait chips use Raised Panel with Tactical Border. Inactive trait chips use a darker inactive background and muted text.

### Cards / Containers
- **Corner Style:** Main panels use 0.625rem radius; internal summary cards use 0.5rem.
- **Background:** Main containers use Tactical Panel. Headers, summaries, spotlights, and query cards use Raised Panel. Inputs and table bodies use Control Well.
- **Shadow Strategy:** Main panels may use Panel Ambient. Internal cards must use border and surface only.
- **Border:** Default `1px` Tactical Border, upgraded to Tactical Border Strong for controls and dropdowns.
- **Internal Padding:** Dense panels use 0.75rem-1rem; larger modal and workspace regions use 1rem.

### Inputs / Fields
- **Style:** Inputs and selects use Control Well background, Tactical Border Strong, 0.5rem radius, 44px minimum height, and 0.65rem 0.75rem padding.
- **Focus:** Border shifts to Command Green with a subtle green focus shadow.
- **Error / Disabled:** Disabled controls reduce opacity and keep layout stable. Errors use Danger Coral text or border treatment, not only colorless copy.

### Navigation
- **Style, typography, default/hover/active states, mobile treatment.** This app has no route navigation; the left control rail is the navigation model. At narrow widths the two-column shell collapses to a stacked structure, toolbar groups become vertical, and tables retain horizontal scroll instead of shrinking text.

### Signature Components

**Constraint Multi-select.** A dense combobox with selected pills, inline search, a 50-item dropdown cap, optional Community Dragon icons, and explicit empty state. The dropdown is a raised panel with strong border, ambient shadow, and hover rows.

**Board Results Table.** A sticky-header data table with dense rows, compact chips, selected row state, and rank emphasis in Command Green. Preserve table scanability before adding decoration.

**Board Spotlight.** A compact summary container above the table that exposes the selected board's metrics, units, and traits without opening a separate modal.

**Cache Modal.** A focused utility modal with a bounded width, scrollable body, table layout, and compact footer actions.

## 6. Do's and Don'ts

### Do:
- **Do** keep the search task primary: controls, query state, and results must remain legible at a glance.
- **Do** preserve density with order: align labels, group constraints, and let compact spacing carry more information.
- **Do** use Community Dragon assets inside unit and trait objects when they clarify data.
- **Do** keep focus states visible with the 2px Command Green outline and 44px hit targets.
- **Do** use skeletons, inline status, and explicit errors for loading or search failures instead of vague waiting text.
- **Do** respect reduced motion. Motion should communicate state in 150ms-250ms, not choreograph the page.

### Don't:
- **Don't** drift into a marketing landing page, a generic SaaS dashboard, a comp tier-list clone, or a broad TFT companion app.
- **Don't** use decorative card grids, hero-metric layouts, gratuitous animation, or visual noise that slows scanning during live-game decision making.
- **Don't** add purple gradients, glass cards, beige paper surfaces, oversized hero headings, or brand-campaign composition.
- **Don't** use green as decoration. Green means command, focus, active, selected, or ranked.
- **Don't** use border-left or border-right accents wider than 1px on cards, list items, alerts, or callouts.
- **Don't** pair 1px borders with wide decorative shadows on buttons or chips. Use border and tone for internal components.
- **Don't** invent custom affordances where standard controls work. Dense product UI earns trust through familiarity.
