# Theme and Design Tokens

## Compact token summary

### Stack

- Tailwind CSS with CSS-variable semantic colors and shadcn/ui-style primitives.
- Light mode is the product default; dark mode is available through the `.dark` class.
- Interface font: locally bundled Geist Sans. Monospace font: Geist Mono. Brand wordmark: Space Grotesk 700.
- Icons: Lucide React. Brand mark: custom six-blade iris. Decorative motif: pointy-top honeycomb hexagons.

### Light palette

| Token | HSL value | Intended use |
| --- | --- | --- |
| background/card/popover | `0 0% 100%` | White app and form surfaces |
| foreground/card-foreground | `185 45% 10%` | Deep turquoise-black text |
| primary | `185 84% 24%` | Dark turquoise brand panels and primary actions |
| primary-foreground | `180 25% 98%` | Near-white text on primary |
| secondary/muted | `185 40% 96%` / `185 30% 96%` | Pale turquoise support surfaces |
| muted-foreground | `185 15% 38%` | Secondary copy |
| accent | `185 45% 93%` | Hover/selected tint |
| border/input | `185 25% 88%` / `185 25% 85%` | Controls and separators |
| ring | `185 84% 30%` | Focus indicator |
| destructive | `0 72% 45%` | Errors/rejections |
| success | `145 65% 30%` | Approved/success |
| warning | `40 96% 55%` | Attention/late |

### Dark palette

- Background `190 45% 7%`; foreground `180 25% 96%`.
- Primary lifts to `185 65% 45%` for contrast on dark surfaces.
- Border/input use `190 28% 18–20%`; muted foreground is `185 15% 65%`.

### Geometry, spacing, and elevation

- Base radius: `0.5rem`; large `0.5rem`, medium `0.375rem`, small `0.25rem`.
- Controls use 40px default height, 36px small, and 44px large.
- Cards use a 1px semantic border, 8px radius, white surface, and Tailwind `shadow-sm`.
- Login desktop split: 52% brand panel / 48% form panel; brand padding 56px; form width capped at 384px.
- Responsive breakpoints are Tailwind defaults: sm 640px, md 768px, lg 1024px, xl 1280px, 2xl 1536px. Container 2xl max width is 1400px.
- Motion is restrained: color transitions on controls and 200ms accordion/dialog state transitions.

### Typography

- Body and application UI: Geist Sans, Tailwind default scale.
- Login headline: 2.1rem, medium, tight tracking, snug leading.
- Login form heading: 1.5rem, semibold, tight tracking.
- Supporting copy: 0.875–0.95rem; captions: 0.6875–0.75rem.
- IRIS wordmark: Space Grotesk 700 with negative letter spacing.

## Raw source dumps

### `tailwind.config.ts`

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
```

### `app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/*
 * Brand palette: dark turquoise on white.
 *
 * Hue 185 carries the brand and is reused for the neutrals — borders, muted
 * text and surfaces are desaturated turquoise rather than grey, which keeps the
 * interface cohesive instead of looking like a grey app with teal buttons.
 *
 * Status colours deliberately stay off that hue. Approved, late and rejected
 * are read at a glance on badges no larger than a word, so success sits at 145
 * and warning at 32 to remain unmistakably green and amber next to turquoise.
 */

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 185 45% 10%;
    --card: 0 0% 100%;
    --card-foreground: 185 45% 10%;
    --popover: 0 0% 100%;
    --popover-foreground: 185 45% 10%;
    /* 6.2:1 on white, so white label text on a primary button clears AA. */
    --primary: 185 84% 24%;
    --primary-foreground: 180 25% 98%;
    --secondary: 185 40% 96%;
    --secondary-foreground: 185 60% 16%;
    --muted: 185 30% 96%;
    --muted-foreground: 185 15% 38%;
    --accent: 185 45% 93%;
    --accent-foreground: 185 70% 18%;
    --destructive: 0 72% 45%;
    --destructive-foreground: 0 0% 100%;
    --success: 145 65% 30%;
    --success-foreground: 0 0% 100%;
    /* The one badge carrying dark text. White on amber reaches only 4.17:1,
       and the amber dark enough to fix that reads brown rather than a warning.
       Dark text on a true amber keeps the meaning and clears AA at 8.2:1. */
    --warning: 40 96% 55%;
    --warning-foreground: 30 95% 12%;
    --border: 185 25% 88%;
    --input: 185 25% 85%;
    --ring: 185 84% 30%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 190 45% 7%;
    --foreground: 180 25% 96%;
    --card: 190 40% 9%;
    --card-foreground: 180 25% 96%;
    --popover: 190 40% 9%;
    --popover-foreground: 180 25% 96%;
    /* Lifted well above the light-mode value: the same dark turquoise would
       disappear into the background here. 7:1 against it. */
    --primary: 185 65% 45%;
    --primary-foreground: 190 60% 8%;
    --secondary: 190 30% 16%;
    --secondary-foreground: 180 25% 96%;
    --muted: 190 30% 15%;
    --muted-foreground: 185 15% 65%;
    --accent: 190 32% 19%;
    --accent-foreground: 180 25% 96%;
    --destructive: 0 62% 45%;
    --destructive-foreground: 0 0% 100%;
    --success: 145 55% 45%;
    --success-foreground: 145 80% 8%;
    --warning: 32 90% 50%;
    --warning-foreground: 25 90% 10%;
    --border: 190 28% 18%;
    --input: 190 28% 20%;
    --ring: 185 65% 50%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

### `app/layout.tsx`

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Space_Grotesk } from "next/font/google";

import "./globals.css";

/* The IRIS logo is set in Space Grotesk per the brand sheet. It is loaded only
   for the wordmark — the interface itself stays on Geist. */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "IRIS — IRS Records and Insight System",
  description: "Internal staff workflow system for IRS Software Solution.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```


