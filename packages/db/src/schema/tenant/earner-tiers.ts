/**
 * Earner Tiers — re-export shim (Task #15)
 *
 * Future code should import `earnerTiers` from this module. The underlying
 * table is still `trainer_tiers` (a rename was explicitly avoided to prevent
 * FK drift on members.trainerTierId). This shim lets code use the more
 * generic name without any migration or FK churn.
 *
 * NOTE: `trainerTiers` is NOT re-exported here — it is already exported by
 * `./trainer-tiers` in the barrel. Only the alias `earnerTiers` is added.
 */

export { trainerTiers as earnerTiers } from "./trainer-tiers";
