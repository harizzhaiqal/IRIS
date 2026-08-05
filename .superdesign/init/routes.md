# Routes

Routing is provided by the Next.js 14 App Router. There is no separate router configuration file. `app/layout.tsx` wraps every route. Pages inside `app/(app)` additionally use the authenticated shell in `app/(app)/layout.tsx`; the `(app)` route group does not appear in URLs.

## Public routes

| URL | Page file | Layout | Summary |
| --- | --- | --- | --- |
| `/` | `app/page.tsx` | `app/layout.tsx` | Redirects to `/dashboard`. |
| `/login` | `app/login/page.tsx` | `app/layout.tsx` | Split-screen IRIS brand panel and staff sign-in form. |

## Authenticated routes

| URL | Page file | Layout | Summary |
| --- | --- | --- | --- |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | Root + authenticated app shell | Role-specific overview for staff, HOD, HR administrator, or CEO, plus request metrics. |
| `/training` | `app/(app)/training/page.tsx` | Root + authenticated app shell | Monthly personal training record, target progress, status, entries, and submission actions. |
| `/training/new` | `app/(app)/training/new/page.tsx` | Root + authenticated app shell | Create or edit a training entry. |
| `/training/team` | `app/(app)/training/team/page.tsx` | Root + authenticated app shell | HOD view of team training submissions and progress. |
| `/training/submissions` | `app/(app)/training/submissions/page.tsx` | Root + authenticated app shell | HR/CEO company submission queue with filters and bulk approval. |
| `/training/review/[id]` | `app/(app)/training/review/[id]/page.tsx` | Root + authenticated app shell | Review an individual training submission and its verification trail. |
| `/requests` | `app/(app)/requests/page.tsx` | Root + authenticated app shell | Employee request list or company review queue, depending on role. |
| `/requests/new` | `app/(app)/requests/new/page.tsx` | Root + authenticated app shell | Create an employee request, with optional AI suggestion and attachments. |
| `/requests/[id]` | `app/(app)/requests/[id]/page.tsx` | Root + authenticated app shell | Request detail, comments, attachments, and review actions. |
| `/reminders` | `app/(app)/reminders/page.tsx` | Root + authenticated app shell | HR reminder schedules and recent delivery runs. |
| `/reminders/new` | `app/(app)/reminders/new/page.tsx` | Root + authenticated app shell | Create an automated reminder schedule. |
| `/reminders/[id]` | `app/(app)/reminders/[id]/page.tsx` | Root + authenticated app shell | Edit a reminder schedule. |
| `/reminders/runs/[id]` | `app/(app)/reminders/runs/[id]/page.tsx` | Root + authenticated app shell | Inspect a reminder run and retry failures. |

## Route handlers

| URL | File | Purpose |
| --- | --- | --- |
| `/auth/signout` | `app/auth/signout/route.ts` | Signs the current employee out. |
| `/training/export` | `app/(app)/training/export/route.ts` | Exports training records. |
| `/training/attachments/[id]` | `app/(app)/training/attachments/[id]/route.ts` | Serves an authorized training attachment. |

## Root redirect source

```tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard");
}
```
