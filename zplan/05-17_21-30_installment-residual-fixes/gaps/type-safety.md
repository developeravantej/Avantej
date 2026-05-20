# Type Safety Audit
**Session:** zplan/05-17_21-30_installment-residual-fixes/
**Findings:** 7 (1 critical · 2 high · 2 medium · 2 low)

## Findings

### [CRITICAL] Payment method enum mismatch between POS router and installment service
**Plan claims:** Phase I.2 adds a .transform() on the Zod enum to normalize ank_transfer → manual_transfer so payment methods are uniform across the system.
**Actual:** 
- POS router (pos.ts line 61) accepts z.enum(["cash", "card", "bank_transfer"])
- Installments router (installments.ts line 32) accepts z.enum(["manual_transfer", "cash", "card", "fpx", "stripe"])
- confirmInstallmentPayment expects "manual_transfer" | "cash" | "card" | "fpx" | "stripe" (line 294 in installment.service.ts)
- No .transform() exists in either router to normalize the enums

**Files:** 
- packages/api/src/routers/pos.ts:61
- packages/api/src/routers/installments.ts:32
- packages/services/src/installment.service.ts:292-298

**Impact:** If a POS sale creates an installment with ank_transfer and later tries to confirm payment via the installments router, the service function will reject ank_transfer and only accept manual_transfer. This is a type error that will fail at runtime.

**Fix:** Add .transform() to POS router payment method enum: z.enum(["cash", "card", "bank_transfer"]).transform(v => v === "bank_transfer" ? "manual_transfer" : v) to normalize before passing to the service.

---

### [HIGH] Unsafe type cast 	x as unknown as TenantDb in pos.service.ts
**Plan claims:** "Cast is safe: Drizzle tx is structurally compatible with NeonDatabase for DML."
**Actual:** Line 635 in pos.service.ts casts a TenantTx to TenantDb via 	x as unknown as TenantDb. While the plan acknowledges this is a Drizzle transaction, the cast bypasses TypeScript's structural type checking. If createInstallmentSchedule is called elsewhere with a real TenantDb and the contract changes, this could break silently.
**File:** packages/services/src/pos.service.ts:635
**Impact:** Maintains type safety by accident; if createInstallmentSchedule signature changes to require TenantDb exclusively, this call site would type-check but fail at runtime.
**Fix:** Modify createInstallmentSchedule to accept TenantDb | TenantTx as the plan proposes (similar to logInstallmentEvent pattern), eliminating the cast. This makes the contract explicit.

---

### [HIGH] Nullable creditsUnlocked requires guards but pattern is inconsistent
**Plan claims:** Phase G.2 uses (pkg.creditsUnlocked ?? 0) as a guard during the deployment window.
**Actual:** Schema (line 85 of package-instances.ts) declares creditsUnlocked: integer("credits_unlocked") without .notNull(), so it IS nullable. All usages appear guarded with ?? fallback in installment.service.ts (lines 358, 699), but the pattern is inconsistently applied (sometimes ?? 0, sometimes ?? creditsTotal).
**File:** packages/db/src/schema/tenant/package-instances.ts:85, packages/services/src/installment.service.ts:358, 699
**Impact:** Type-safe (guards are present), but fragile — any new code accessing pkg.creditsUnlocked must remember to guard it.
**Fix:** Declare creditsUnlocked: integer("credits_unlocked").notNull().default(0) in schema to make it non-nullable and eliminate the need for guards.

---

### [MEDIUM] installmentsWaived column not present in schema
**Plan claims:** Phase E proposes a new column installmentsWaived with NOT NULL DEFAULT 0.
**Actual:** The column does not exist in packages/db/src/schema/tenant/package-instances.ts. The schema has installmentsTotal (line 83) and installmentsPaid (line 84), but no installmentsWaived field. Any code reading pkg.installmentsWaived will fail at runtime.
**File:** packages/db/src/schema/tenant/package-instances.ts (missing field)
**Impact:** If the plan assumes this column exists for calculating remaining installments or refund logic, any reference will fail. Migration not yet applied.
**Fix:** Add migration to create installmentsWaived column, then update schema: installmentsWaived: integer("installments_waived").default(0).notNull(), after line 84.

---

### [MEDIUM] creditsRemaining computed column depends on nullable creditsUnlocked
**Plan claims:** creditsUsed is reliably non-null (.default(0).notNull()).
**Actual:** Line 52 of package-instances.ts correctly declares creditsUsed: integer("credits_used").default(0).notNull(),. However, the computed column creditsRemaining (line 49-51) relies on SQL: COALESCE(credits_unlocked, credits_total) - credits_used. If TypeScript queries select both columns, client-side arithmetic with nullable creditsUnlocked requires guards.
**File:** packages/db/src/schema/tenant/package-instances.ts:49-52
**Impact:** Type-safe if all code guards creditsUnlocked, but documents an implicit contract between nullable and non-null columns.
**Fix:** Add schema documentation clarifying nullability semantics for creditsUnlocked vs. creditsUsed.

---

### [LOW] Three s any type casts in error object assignment
**Plan claims:** The code should use typed errors, not type-cast exceptions.
**Actual:** Lines 832, 843, and 850 in installment.service.ts cast error objects to ny to attach a .code property: (err as any).code = "CONFLICT";
**File:** packages/services/src/installment.service.ts:832, 843, 850
**Impact:** Low — errors are caught and handled, but the pattern could hide bugs if error handling logic changes.
**Fix:** Create a custom error class: class AppError extends Error { code: string; } and use 	hrow new AppError("...", "CONFLICT") instead of casting.

---

### [LOW] TenantTx type is inferred, not centralized
**Plan claims:** Phase H defines a withTx helper based on TenantTx type.
**Actual:** TenantTx is defined at line 25 in installment.service.ts and again at line 39 in pos.service.ts as inferred types: 	ype TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];. The type is redefined in multiple service files rather than being centralized, violating DRY.
**File:** packages/services/src/installment.service.ts:25, packages/services/src/pos.service.ts:39
**Impact:** Low — works correctly, but fragile; if Drizzle's transaction signature changes, all redefinitions need updating.
**Fix:** Export TenantTx from a single location (e.g., packages/db/src/types.ts) and import it in all service files.

---

## Summary
The audit reveals **1 critical runtime issue** (payment method enum mismatch that will cause rejection at the confirmation step), **2 high-priority type safety gaps** (unsafe cast and nullable creditsUnlocked requiring inconsistent guards), **2 medium-severity schema inconsistencies** (missing installmentsWaived column and computed column dependency on nullable field), and **2 low-priority code quality issues** (multiple s any error casts and type duplication). The most urgent fix is adding the .transform() to the POS router to normalize ank_transfer → manual_transfer before the first deployment. The schema inconsistencies must be resolved before Phase H begins, as arithmetic operations depend on them.
