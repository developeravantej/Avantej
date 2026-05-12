/**
 * Re-export of the shared oRPC error mapper. The implementation lives in
 * `packages/api/src/lib/orpc-error-mapper.ts` so it can be consumed by the
 * shared router definitions; this file exists for ergonomic imports from
 * server-side code (`apps/server/src/...`).
 */

export { mapPgError, withPgErrorMapping } from "@avantej-core/api/lib/orpc-error-mapper";
