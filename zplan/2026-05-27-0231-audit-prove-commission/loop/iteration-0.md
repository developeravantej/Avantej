# Iteration 0 — gate + initial proof run

## Gate
- First run: RED — `auth.middleware.test.ts:109` "Object possibly undefined".
- Build-error fix: added `?.` to `consoleErrorCalls[0]?.[0]` access.
- Second run: RED — `payment/view.tsx:40,48` (Date→string, missing createdByName).
- Build-error fix: converted `item.date` to ISO string; removed `createdByName` field reference.
- Third run: GREEN.

## Proof run (gap-prove-commission.spec.ts via gap-prove.config.ts)
- 1 test, ~34s, video captured.
- Soft failures: GP-01, F-04, F-05, F-06.

## Failure → target mapping
| step | reason | classification |
|------|--------|----------------|
| GP-01 | heading `/commission/i` not found | spec-too-strict (commissions page uses different heading element/text) |
| F-04 | got code "400" not "BAD_REQUEST"; body inner code IS "BAD_REQUEST" with raw SQL leak in message | TEST + CODE: orpcCall doesn't propagate inner code; procedure leaks "Failed query: insert into commission_splits..." |
| F-05 | no approved split in test env to mark paid | DATA GAP (skip-tolerant; still good to fix the underlying code) |
| F-06 | no paid commission with salesOrderId | DATA GAP (skip-tolerant) |

## Worklist (parallel-safe by file ownership)
- Agent A — commission-splits.service.ts + refunds.service.ts → F-11, F-12, F-06
- Agent B — category-commission.service.ts → F-01, F-02
- Agent C — commission-calculator.service.ts → F-13
- Agent D — payouts.service.ts + payouts.ts → F-19, F-15, F-08
- Agent E (sequential after A) — lifecycle.procedures.ts + commission-splits.service.ts plumbing → F-04, F-05, F-14
- Spec fix (host) — GP-01 selector loosen; F-04 inner-code parse
