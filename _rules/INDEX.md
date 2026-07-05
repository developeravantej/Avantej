# _rules

Durable, repo-checked-in rules and canonical references for how the live system
is wired. Read the relevant rule before changing the area it covers.

| Rule | Covers |
|---|---|
| [production-domains-and-auth.md](production-domains-and-auth.md) | Live domain topology (move.avantej.com web / move-api.avantej.com API / apex→Framer), Cloudflare account, worker names, and the cross-subdomain cookie config required for login. Read before changing any public domain, auth origin, or deploying web/server. |
