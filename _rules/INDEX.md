# _rules

Durable, repo-checked-in rules and canonical references for how the live system
is wired. **Before starting any task, check this index for a rule covering the
area you're about to touch — and read it before changing anything.**

| Rule | Covers |
|---|---|
| [production-domains-and-auth.md](production-domains-and-auth.md) | Live domain topology (move.avantej.com web / move-api.avantej.com API / apex→Framer), Cloudflare account, worker names, and the cross-subdomain cookie config required for login. Read before changing any public domain, auth origin, or deploying web/server. |
| [working-with-linear/README.md](working-with-linear/README.md) | Handling Linear issues (AVANTEJ / NCT): assign to self + move to In Progress before starting, reproduce, fix minimally, and prove the fix with an attached e2e video before closing. Read before working any Linear issue. |
