# Decisions

Ambiguities resolved during the build, with the reasoning behind each choice.

## Scaffold and tooling

**Next.js pinned to 14.2.33 rather than 15.x.** The brief asked for "Next.js 14+ App Router". 14.2.33 is the final 14.x patch and keeps the synchronous `cookies()` / `params` API, which avoids the async-dynamic-API migration that 15 forces. Upgrading later is a contained change.

**shadcn/ui components written directly into `components/ui/` instead of running the `shadcn` CLI.** The CLI defaults to Tailwind v4 conventions and rewrites `globals.css`; the project is on Tailwind v3.4. The generated files are the same source either way, so they are committed directly and `components.json` is present so the CLI can still add components later.

**Two extra semantic colours (`success`, `warning`) added to the Tailwind theme.** The status lifecycle has six states that need visually distinct badges, and the stock shadcn palette only ships `default`/`secondary`/`destructive`/`outline`.

**npm cache redirected to `C:\npm-cache-iris` during setup.** The Windows account name contains an `&`, which breaks the `cmd` shims npx generates under the default cache path. This affects local tooling only, not the app.

**Dev-only npm audit advisories accepted.** All 16 high-severity advisories trace to `brace-expansion` via the ESLint dependency tree. Fixing them requires ESLint 10, which `eslint-config-next@14` does not support. Nothing ships to the runtime bundle.

**Vitest for unit tests.** The brief requires tests for the two pure utility modules only. Vitest needs no extra config to run TypeScript and is faster to boot than Jest for that scope.

**Zod v4 and `lucide-react` v1.** Both are the current majors at install time and are API-compatible with the usage here.
