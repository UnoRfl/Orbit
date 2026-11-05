# Security

Orbit is a student project, but it holds real people's timetables, messages and
— when they choose to share it — their live location. Reports are taken
seriously.

## Reporting

Use **GitHub's private vulnerability reporting** on this repository
(Security → Report a vulnerability). That opens a private thread; it does not
create a public issue.

Please do not open a public issue for anything exploitable.

## Scope

In scope:

- `https://unorfl.github.io/Orbit/` — the deployed app
- this repository's source and its GitHub Actions workflows
- the Supabase backend's row-level security: anything that lets one account read
  or change another account's data

Out of scope:

- missing `Strict-Transport-Security`, `X-Frame-Options` and similar response
  headers. Orbit is served by GitHub Pages, which does not let a site set
  response headers on the free tier. What can be expressed in a `<meta>` tag is
  in `index.html`.
- denial of service, volumetric testing, and anything that would degrade the
  service for its users
- reports from automated scanners with no demonstrated impact

## Testing rules

Test against your own accounts. Do not read, modify or exfiltrate another
user's data, and do not attempt to disrupt the service. If you reach someone
else's data by accident, stop and say so in the report.

## What is already in place

- Row-level security on every table; friend-visibility is enforced in the
  database, not in the client.
- Live location is time-boxed by a `CHECK` constraint (12h maximum) and wiped
  by a `BEFORE` trigger whenever sharing is off or ghost mode is on, so a
  modified client cannot broadcast indefinitely or invisibly.
- Moderation RPCs are `SECURITY DEFINER` but check `internal.is_staff()` before
  doing anything; trigger functions are not reachable from the REST API.
- CodeQL, gitleaks, zizmor and a ZAP baseline run on every push and weekly
  (`.github/workflows/security.yml`).

The Supabase publishable key in `core.js` is meant to be public — it is the
anonymous key every client uses, and it grants nothing that row-level security
does not already allow. A `service_role` key must never appear in this repo.
