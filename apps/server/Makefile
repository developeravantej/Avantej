# apps/server/Makefile

.PHONY: stripe-listen-platform stripe-listen-connect stripe-seed

stripe-listen-platform:
	./scripts/stripe-listen.sh platform

stripe-listen-connect:
	./scripts/stripe-listen.sh connect

stripe-seed:
	bun run scripts/stripe-seed-saas-products.ts
