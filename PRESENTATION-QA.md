# IRIS — anticipated questions

Prep notes for presenting to mixed company staff and judges. Organised by the
four scoring criteria, plus the questions that come from a non-technical room.

Answers are written to be **spoken**, not read out. Keep them short; let the
follow-up come.

---

## The three you must not fumble

These carry the most weight and are the most likely to be asked.

### 1. "Is this real AI, or just if-else?"

**Answer honestly, immediately, and turn it into a strength.**

> Right now it is deterministic rules, not a language model — and that was a
> deliberate choice for a prototype. It costs nothing per request, returns in
> milliseconds, works with no internet, cannot leak staff data to a third party,
> and gives the same answer every time, which matters when you are demoing live.
> It is also unit tested, which a model call is not.
>
> The important part is the design: the suggestion is one function behind a
> server action. Swapping it for a real model is a change to that one file, and
> nothing about the form, the database, or the audit trail changes.

**Do not** call it "AI-powered" and hope nobody checks. If a judge discovers
keyword matching after you implied a model, you lose credibility on every other
claim. Saying it first is what makes the rest believable.

If pressed on why not use a model now: cost per request, latency in a live demo,
data leaving the company, and a non-deterministic answer that cannot be tested.
All four are real reasons, not excuses.

### 2. "What is actually finished, and what is a demo?"

> Employee Training Records is the complete module — the full workflow, the
> permission rules, the compliance maths. Request Management is a working
> prototype: it saves real data and enforces real permissions, but it is smaller
> in scope by design.

Be specific about the boundary. Overclaiming is the fastest way to lose the
technical score.

### 3. "How does this actually save the company anything?"

Have the arithmetic ready with **your real headcount**, not the demo's eleven.

> Today it is one Excel workbook per employee per year, twelve monthly sheets
> each, emailed to a HOD with HR copied, signed off by both.
>
> With N staff that is N workbooks a year and roughly N × 12 email threads. HR
> has no way to see who is behind without opening every file. There is no
> reliable company-wide compliance figure until someone builds one by hand.

Then the counter: one screen, live totals, no chasing, no version conflicts, and
a compliance percentage that is correct the moment it is asked for.

---

## Business impact — 35%

**"Why not just keep using Excel?"**
> Excel is fine for one person. It fails at the seams: no single source of truth,
> no way to know who has not submitted, no audit trail of approvals, and the
> yearly total depends on whoever last edited the file. Twelve sheets per person
> per year also means the company total is a manual exercise.

**"Why not Google Forms, or Jira, or the HR system we already pay for?"**
> A form collects data but does not model the two-stage approval, does not
> enforce the hour targets, and does not tell HR who is behind. Jira is built for
> issues, not compliance records. This form is specific to IRS — IRS-HR-F14 — and
> the rules around it are ours, not a vendor's.

**"Who benefits most?"**
> HR gets the compliance picture without asking for it. HODs get a queue instead
> of an inbox. Staff stop hunting for last month's file.

**"What is the time saving per person?"**
> Be honest: the entry itself is comparable. The saving is in everything around
> it — no emailing, no chasing, no consolidating, no rebuilding the annual total.
> That is HR and HOD time, not staff time.

**"How many people would use it?"**
> Everyone. Every staff member files a monthly record; that is what the form
> requires today.

**"What happens to our existing records?"**
> Nothing is lost. The historical workbooks stay as they are. This starts from a
> chosen month forward — or the old data can be imported, which is a small job
> because the shape is already known.

**"Would this work for other forms too?"**
> The same shape — submit, verify, approve, report — covers most internal
> approvals. The Request module is exactly that shape reused, which is why it
> took a fraction of the time.

---

## Innovation & creativity — 25%

**"What is genuinely new here?"**
> Two things. The suggestion engine turns a sentence into a filed, categorised,
> routed request — the staff member types what they need in plain words and the
> form fills itself in. And the compliance view is a live figure rather than a
> quarterly exercise.

**"Why is the AI suggestion useful if I can just pick from a dropdown?"**
> Because people pick wrong, or pick "Other" to avoid thinking. Wrong category
> means wrong queue means a slower answer. It also sets priority from the
> wording, so "broken and I cannot work" is not filed at the same urgency as
> "would be nice to have".

**"Does it learn from what we correct?"**
> Not today. What it does do is store what it suggested alongside what the person
> actually filed, so the disagreements are recorded. That is the data you would
> need to improve it — and it is being collected from day one.

**"What would you add with more time?"**
> A real model behind the same function, HR-initiated password reset, exports,
> and reminders before the deadline. All extension points, not rewrites.

---

## Technical implementation — 20%

Keep these short unless the questioner is technical.

**"What is it built with?"**
> Next.js and TypeScript on the front, Supabase — which is Postgres — for the
> database, authentication, and file storage. Deployed on Vercel.

**"Is our data secure? Can I see other people's records?"**
> No, and this is enforced by the database itself, not by the screen. Every table
> has row-level security: a staff member's query for other people's records
> returns nothing, even if they bypass the app entirely. That is tested — there
> are checks that specifically try to read another employee's data and confirm it
> comes back empty.

**"What stops someone approving their own request?"**
> The database refuses it. Not the button being hidden — the rule sits in a
> trigger, so it holds regardless of how the change arrives.

**"How do you know it works?"**
> 60 unit tests on the calculations, 80 checks against a real Postgres covering
> the workflow and the permission rules, and 31 more on the deployment scripts.
> They run in seconds and need no database.

**"What about the hours calculation — why not just store 7.5 hours?"**
> Everything is stored as whole minutes and formatted for display. Floating point
> hours drift, and a year of drift makes a compliance total nobody can reconcile.
> Same reason costs are stored in cents.

**"A course ran two days, 9 to 5. Is that 16 hours?"**
> Calculated as 16, but staff normally record 14 because lunch is not learning
> time. Both numbers are stored and the reviewer sees both, with the reason for
> the difference. That mirrors what people already write on the paper form.

**"Can it scale?"**
> For a company this size, comfortably. The heavy work — totals, permission
> checks — happens in the database rather than in the app.

**"Who maintains it?"**
> Fair question, and worth being straight: it is a prototype-stage internal tool.
> Making it production would mean an owner, a backup policy, and a support route.

---

## Presentation & demonstration — 20%

**Have the demo path rehearsed and short.** Suggested order:

1. Sign in as a staff member — show the month, the target, the status badge
2. Add a training entry — show hours auto-calculating, then override with a reason
3. Submit — show it move to the HOD
4. Sign in as the HOD — verify it
5. Sign in as HR — approve it, and **show the dashboard total change only now**
6. Switch to Requests — type "my monitor is too small", press Suggest with AI
7. Approve the request as HR

Step 5 is the one that lands: unverified hours never count.

**"Can I try it?"**
> Yes. Have the URL and a demo login ready on a slide.

**If something breaks live:** say what you expected, say what happened, move on to
the next step. Do not debug in front of the room. Judges score composure; a
five-minute silence costs more than the broken feature.

---

## Questions from a non-technical room

**"Do I have to learn a new system?"**
> If you can fill in the Excel form, you can use this. It is the same fields in
> the same order — it just adds up for you and sends itself.

**"What if I have no training in a month?"**
> There is a nil return. It says "nothing this month" rather than leaving HR
> guessing whether you forgot.

**"What if I forget to submit?"**
> It is due by the 10th of the following month and shows as overdue after that.
> Your HOD and HR both see it.

**"Can I fix a mistake after submitting?"**
> Not directly — but your HOD can return it to you, which reopens it. That is
> deliberate: an approved record should not change quietly.

**"Who can see what I wrote?"**
> You, your HOD, and HR. Not your colleagues.

**"Does it work on my phone?"**
> Yes, the screens adapt. Most people will use it on a laptop.

**"What if the internet is down?"**
> It needs a connection. It is a web system.

**"Will this be used to judge my performance?"**
> Worth answering carefully and honestly — it records the hours the form already
> requires. Anything beyond that is a management decision, not a system one.

---

## Harder questions, and honest answers

**"How much of this was written by AI?"**
> Answer plainly. It was built with AI assistance, which is entirely in keeping
> with an AI competition. What matters is that the design decisions, the business
> rules, and the testing are understood and defensible — which you can prove by
> answering the next question well.

**"What was the hardest problem you hit?"**
> Pick a real one. A good candidate: permission rules that look right and are not.
> The rules had to be tested by actually trying to read another employee's data
> and confirming nothing came back — reading the code was not enough.

**"What is broken or unfinished?"**
> Have the list ready and say it before you are asked. Requests is a prototype.
> There is no email notification yet. There is no reporting export. HR approving
> their own record is a segregation-of-duties gap in a one-HR company, and it is
> documented rather than hidden.

**"Why should we trust the compliance number?"**
> Because it only counts what both a HOD and HR have approved, and the totals are
> recalculated by the database on every change rather than stored by the app. A
> client cannot write a total that disagrees with the entries behind it.

**"What happens if two people edit at once?"**
> A month belongs to one employee, so that case does not arise for training. For
> requests, the last decision wins and every action is in the audit log.

**"What did this cost to build?"**
> Development time. Running it: the free tiers of Supabase and Vercel cover a
> company this size, so effectively nothing until it grows.

**"Is our staff data leaving the company?"**
> Today it sits in a hosted Postgres database. Nothing is sent to any AI service —
> the suggestion runs on our own server. That would change if a real model were
> added later, and it would be a decision to take deliberately.

---

## If you only prepare four sentences

1. Training Records is finished; Requests is a prototype — and here is the line
   between them.
2. The suggestion engine is rules, not a model, on purpose — and swapping it is a
   one-file change.
3. Permissions are enforced by the database, not the screen, and that is tested.
4. Only hours approved by both a HOD and HR count toward compliance.
