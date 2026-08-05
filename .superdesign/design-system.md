# IRIS Design System

## Product context

IRIS is the internal employee workspace for IRS Software Solution. It currently supports training submissions, reviews, approvals, employee requests, and reminders, and is expected to expand into commission management, an employee-handbook chatbot, asset requests and repairs, a form centre, and career development. The interface should feel dependable, calm, clear, and appropriate for repeated workplace use.

The login page is a public entry point for staff. It uses a split desktop layout: an expressive brand panel on the left and a focused sign-in form on the right. On smaller screens, the brand side collapses to a compact top band so the form stays above the fold.

## Brand character

- Clear, quietly confident, and professional rather than promotional.
- Modern internal-product polish without glassmorphism, neon, decorative serif type, or unrelated gradients.
- The visual identity combines a dark turquoise foundation, a six-blade iris mark, and pointy-top honeycomb geometry inherited from the IRS company mark.
- Decorative geometry should support hierarchy and depth while preserving strong contrast and calm reading areas.

## Color constraints

Use only the repository semantic tokens.

- Primary dark turquoise: `hsl(185 84% 24%)`.
- Primary foreground: `hsl(180 25% 98%)`.
- App background/card: white.
- Main text: `hsl(185 45% 10%)`.
- Muted text: `hsl(185 15% 38%)`.
- Pale support surfaces: turquoise-tinted secondary/muted/accent tokens.
- Borders and form controls: semantic `border` and `input` tokens.
- Purple-to-cyan gradients are reserved for the IRIS aperture logo itself. Do not extend them into large backgrounds, buttons, or unrelated decoration.
- On the dark login panel, honeycomb geometry uses white at low opacity; it may also use slightly lighter turquoise from the existing palette for depth.

## Typography

- Application UI and editorial copy: Geist Sans.
- IRIS wordmark only: Space Grotesk 700.
- Login headline: approximately 2.1rem, medium weight, tight tracking, snug leading.
- Form heading: 1.5rem, semibold, tight tracking.
- Body/supporting copy: 0.875–0.95rem with relaxed line height.
- Captions: 0.6875–0.75rem.
- Do not introduce other font families.

## Components and geometry

- Default radius: 8px; controls generally use 6px; no oversized pill controls except status badges.
- Inputs and primary buttons are 40px high.
- Cards: white surface, thin semantic border, 8px radius, subtle shadow.
- Icons: Lucide line icons at 16–20px.
- The actual IRIS logo and IRS company logo must be retained; do not replace them with generic marks.
- Honeycomb cells are pointy-top hexagons. Prefer cropped clusters, partial outlines, filled low-opacity cells, and true lattice offsets. Avoid a repetitive wallpaper that competes with content.

## Login-page layout

- Desktop: full viewport split with left brand panel at 52% and right form panel at 48%.
- Brand panel padding: 56px on desktop. Keep the IRIS logo near the top, headline and description in the lower-middle area, and copyright near the bottom.
- Form panel: centered 384px maximum width with heading, work-email guidance, email and password fields, full-width turquoise button, access note, and small IRS endorsement.
- Preserve the current copy: “Everything your team needs, in one place.” and “IRS Records and Insight System — empowering employees with streamlined services, accessible resources, and meaningful insights.”
- Keep all sign-in fields, labels, icons, button text, and support copy unchanged across visual variations.

## Decorative honeycomb guidance

- Honeycomb detail should be noticeably richer than the current sparse corner cells, while leaving a quiet zone around the logo and text.
- Acceptable treatments include a subtle low-opacity field, one luminous/tonal cluster, or layered outline-and-fill clusters with depth.
- Keep line weights fine, opacity restrained, and contrast accessible. The motif must remain background scenery, not an illustration that dominates the page.
- Do not introduce photographs, people illustrations, generic SaaS graphics, charts, or floating product cards.

## Motion and responsiveness

- Motion should be optional and restrained: slow ambient drift or opacity breathing for decorative cells only, respecting reduced-motion preferences.
- At widths below the large breakpoint, hide long brand copy and copyright as the current page does; retain a compact brand band and keep the sign-in form immediately accessible.
- Form controls and touch targets must stay at least 40px high.

## Accessibility

- Preserve current AA contrast between white text and the primary panel/button.
- Decorative SVGs are `aria-hidden` and pointer-events disabled.
- Maintain visible keyboard focus rings and semantic labels.
- Never place busy honeycomb intersections directly behind body copy at high opacity.
