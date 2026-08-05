# Extractable Components

## Layout components

## SidebarHeader

- Source: `components/app-shell/sidebar-header.tsx`
- Category: layout
- Description: Authenticated sidebar masthead with the IRIS lockup and product caption.
- Extractable props: none
- Hardcoded: Dashboard URL, IRIS logo, caption, spacing, border, and typography.

## SidebarNav

- Source: `components/app-shell/sidebar-nav.tsx`
- Category: layout
- Description: Role-aware desktop/mobile navigation list with active route treatment.
- Extractable props: `role` (string), `activeItem` (string when converted for static drafts)
- Hardcoded: Navigation labels, Lucide icon names, route URLs, spacing, colors, and radius.

## Basic and brand components

## IrisLogo

- Source: `components/brand/iris-logo.tsx`
- Category: basic
- Description: IRIS six-blade aperture mark and Space Grotesk wordmark lockup.
- Extractable props: `size` (`lg`, `md`, or `sm`; default `lg`), `tone` (`light` or `dark`; default `light`)
- Hardcoded: Blade geometry, gradients, blend modes, ring geometry, wordmark text, and type styling.

## Honeycomb

- Source: `components/brand/honeycomb.tsx`
- Category: basic
- Description: Decorative pointy-top hexagon clusters used as cropped brand scenery.
- Extractable props: `tone` (`light` or `dark`; default `light`)
- Hardcoded: SVG viewport, cell positions, opacity, fill/stroke behavior, and lattice geometry.

## Button

- Source: `components/ui/button.tsx`
- Category: basic
- Description: Standard action control.
- Extractable props: `variant`, `size`, `disabled`
- Hardcoded: Tailwind component classes and focus/hover states.

## Card

- Source: `components/ui/card.tsx`
- Category: basic
- Description: Bordered white content surface with header, body, and footer composition.
- Extractable props: none beyond content slots
- Hardcoded: Radius, border, surface, shadow, and spacing.

## Input

- Source: `components/ui/input.tsx`
- Category: basic
- Description: Standard 40px form input with semantic border and focus ring.
- Extractable props: `type`, `placeholder`, `disabled`
- Hardcoded: Height, padding, radius, typography, border, and focus treatment.

## Label

- Source: `components/ui/label.tsx`
- Category: basic
- Description: Accessible compact form label.
- Extractable props: none beyond text and target
- Hardcoded: Font size, weight, line height, and disabled state.

## Badge

- Source: `components/ui/badge.tsx`
- Category: basic
- Description: Semantic pill label for workflow status.
- Extractable props: `variant`
- Hardcoded: Pill radius, compact padding, typography, and semantic colors.

## Alert

- Source: `components/ui/alert.tsx`
- Category: basic
- Description: Bordered message container with optional icon, title, and description.
- Extractable props: `variant`
- Hardcoded: Padding, radius, icon positioning, and semantic colors.

## Table

- Source: `components/ui/table.tsx`
- Category: basic
- Description: Responsive data table with compact uppercase headings and row hover states.
- Extractable props: none beyond content slots
- Hardcoded: Typography, spacing, borders, and hover treatment.
