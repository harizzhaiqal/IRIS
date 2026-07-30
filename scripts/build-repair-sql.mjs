// Generates supabase/repair.sql — the parts of the migrations that can be
// re-applied to a live database WITHOUT touching a single row.
//
// setup.sql drops and recreates the public schema, which is how it stays
// re-runnable and also how it erases everything you have entered. Most of the
// breakage that file gets used for is not the tables at all: it is functions
// and policies that drifted, typically after renaming something by hand in the
// dashboard, since Postgres stores function bodies as text and never rewrites
// them. Those are all safely replaceable in place.
//
// Regenerate after changing a migration: npm run sql:repair

import { readFileSync, writeFileSync } from "node:fs";

const SOURCES = [
  "supabase/migrations/20260728090000_initial_schema.sql",
  "supabase/migrations/20260728090100_rls_policies.sql",
];

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/**
 * Splits SQL into statements on top-level semicolons only.
 *
 * A semicolon means nothing inside a dollar-quoted function body, a line
 * comment, or a string literal, and all three occur in these migrations. Prose
 * comments are the easiest to overlook: "Reads are open; writes are not." split
 * four policies away from their own CREATE and dropped them from the output.
 */
function splitStatements(sql) {
  const out = [];
  let buf = "";
  let tag = null;

  for (let i = 0; i < sql.length; i += 1) {
    if (!tag) {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) {
        tag = m[0];
        buf += tag;
        i += tag.length - 1;
        continue;
      }

      // Line comment: copy verbatim through the newline.
      if (sql.startsWith("--", i)) {
        const end = sql.indexOf("\n", i);
        const stop = end === -1 ? sql.length : end;
        buf += sql.slice(i, stop);
        i = stop - 1;
        continue;
      }

      // String literal, doubled quotes included.
      if (sql[i] === "'") {
        let j = i + 1;
        while (j < sql.length) {
          if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
          if (sql[j] === "'") break;
          j += 1;
        }
        buf += sql.slice(i, j + 1);
        i = j;
        continue;
      }

      if (sql[i] === ";") {
        if (buf.trim()) out.push(buf.trim());
        buf = "";
        continue;
      }
    } else if (sql.startsWith(tag, i)) {
      buf += tag;
      i += tag.length - 1;
      tag = null;
      continue;
    }
    buf += sql[i];
  }

  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Strips comment lines so classification looks at real SQL. */
const bare = (s) =>
  s
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .trim();

const repairable = [];

for (const file of SOURCES) {
  for (const statement of splitStatements(read(file))) {
    const sql = bare(statement);
    const head = sql.toLowerCase();

    // Already idempotent by construction.
    if (head.startsWith("create or replace function")) {
      repairable.push(statement);
      continue;
    }

    // Recreated after an explicit drop, since CREATE POLICY has no OR REPLACE.
    const policy = /^create\s+policy\s+([\w.]+)\s+on\s+([\w.]+)/i.exec(sql);
    if (policy) {
      repairable.push(
        `drop policy if exists ${policy[1]} on ${policy[2]};\n\n${statement}`,
      );
      continue;
    }

    const trigger = /^create\s+trigger\s+([\w.]+)[\s\S]*?\son\s+([\w.]+)/i.exec(sql);
    if (trigger) {
      repairable.push(
        `drop trigger if exists ${trigger[1]} on ${trigger[2]};\n\n${statement}`,
      );
      continue;
    }

    // Privileges and RLS switches are safe to restate.
    if (
      head.startsWith("grant ") ||
      head.startsWith("revoke ") ||
      head.startsWith("alter default privileges") ||
      /^alter\s+table\s+[\w.]+\s+enable\s+row\s+level\s+security/i.test(sql)
    ) {
      repairable.push(statement);
      continue;
    }

    // Idempotent by its own ON CONFLICT clause.
    if (head.startsWith("insert into storage.buckets")) {
      repairable.push(statement);
      continue;
    }

    // Everything else — CREATE TABLE, CREATE TYPE, CREATE INDEX, seed inserts —
    // is deliberately skipped: it either exists already or would destroy data.
  }
}

const header = `-- ===========================================================================
-- IRIS — repair an existing database in place.
--
-- Re-applies every function, policy, trigger and grant. It creates no tables
-- and writes no rows, so YOUR DATA IS NOT TOUCHED. Run it when the app starts
-- failing with errors like:
--
--   relation "public.profiles" does not exist
--   permission denied for table users
--
-- which is what you get after renaming or altering something in the dashboard:
-- Postgres stores function bodies as text and does not rewrite them when a
-- table is renamed, so the functions keep pointing at a name that is gone.
--
-- Use setup.sql instead only when you want a clean rebuild and accept losing
-- everything you have entered.
--
-- GENERATED FILE — do not edit. Change the migrations, then run:
--   npm run sql:repair
-- ===========================================================================

set search_path = public, extensions;
`;

writeFileSync(
  new URL("../supabase/repair.sql", import.meta.url),
  `${header}\n${repairable.join(";\n\n")};\n`,
);

console.log(
  `supabase/repair.sql written — ${repairable.length} statements, no table or row changes`,
);
