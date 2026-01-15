# AI Coding Rules for Avantej Core

You are my expert coding assistant for the Avantej Core monorepo.

## Project Structure

- **Monorepo**: Bun workspaces with Turborepo for build orchestration
- **Package Manager**: Bun (v1.2.22) - always use `bun` commands, never npm/yarn
- **Workspace Structure**:
  - `apps/server/` - Hono backend API (Cloudflare Workers)
  - `apps/web/` - Vite + TanStack Router web app (Cloudflare Workers)
  - `apps/native/` - Expo + React Native mobile app
  - `packages/api/` - oRPC contracts and shared API types
  - `packages/auth/` - Better-Auth configuration
  - `packages/db/` - Drizzle ORM schema and migrations
  - `packages/services/` - Shared business logic services
  - `packages/types/` - Shared TypeScript types

## Technology Stack

### Backend (apps/server)

- **Framework**: Hono v4+ on Cloudflare Workers
- **API Layer**: oRPC for type-safe RPC procedures
- **Database**: Drizzle ORM with multi-tenant support (control-panel + tenant schemas)
- **Authentication**: Better-Auth (not Clerk!)
- **Validation**: Zod v4+ for schema validation
- **Testing**: Bun test with unit and integration tests
- **Deployment**: Cloudflare Workers via Wrangler

### Web App (apps/web)

- **Framework**: Vite + TanStack Router (NOT Next.js!)
- **React Version**: React 19.1.0
- **Routing**: TanStack Router with file-based routing in `src/routes/`
- **State Management**: TanStack Query (React Query) for server state
- **Forms**: TanStack Form for form management
- **UI Components**: Radix UI primitives with Tailwind CSS (shadcn/ui pattern)
- **Styling**: Tailwind CSS v4+ with `@tailwindcss/vite` plugin
- **Authentication**: Better-Auth React client
- **API Client**: oRPC client from `@avantej-core/api/client`
- **Deployment**: Cloudflare Workers (static assets via Vite)

### Native App (apps/native)

- **Framework**: Expo SDK 54+ with Expo Router
- **React Version**: React 19.1.0
- **React Native**: 0.81.4
- **Routing**: Expo Router with file-based routing in `app/`
- **State Management**: TanStack Query for server state
- **Forms**: TanStack Form
- **Styling**: NativeWind v4+ (Tailwind CSS for React Native)
- **Authentication**: Better-Auth with `@better-auth/expo` plugin
- **API Client**: oRPC client from `@avantej-core/api/client`
- **Storage**: Expo SecureStore for sensitive data

## Code Generation Guidelines

### TypeScript & Type Safety

- Always use TypeScript with strict mode enabled
- Leverage oRPC for end-to-end type safety between client and server
- Use Zod schemas for runtime validation (shared via oRPC)
- Prefer type inference over explicit types when possible
- Use `workspace:*` for internal package dependencies

### File Structure Conventions

**Server (apps/server/src/)**:

- `routes/` - oRPC procedure definitions (auth.routes.ts, organizations.routes.ts, etc.)
- `middleware/` - Hono middleware (auth.middleware.ts, db.middleware.ts, etc.)
- `services/` - Business logic services
- `lib/` - Shared utilities (better-auth.ts, db.ts, email.ts, stripe.ts)
- `tests/integration/` - Integration tests

**Web App (apps/web/src/)**:

- `routes/` - TanStack Router route files (file-based routing)
- `components/` - React components organized by feature
- `components/ui/` - Reusable UI components (shadcn/ui pattern)
- `lib/` - Utilities and configuration
- `hooks/` - Custom React hooks
- `utils/` - Helper functions (orpc.ts for API client setup)

**Native App (apps/native/)**:

- `app/` - Expo Router route files (file-based routing)
- `components/` - React Native components
- `lib/` - Utilities and configuration
- `utils/` - Helper functions (orpc.ts for API client setup)

**Shared Packages**:

- `packages/api/src/routers/` - oRPC router definitions
- `packages/db/src/schema/` - Drizzle schema files (control-panel/ and tenant/)
- `packages/auth/src/` - Better-Auth configuration

### API Communication Pattern

**Always use oRPC for API calls** - never REST endpoints directly:

```typescript
// ✅ CORRECT: Use oRPC client
import { orpc } from "@/utils/orpc";
const data = await orpc.hierarchy.list.query({ organizationId: orgId });

// ❌ WRONG: Direct fetch or REST calls
const response = await fetch("/api/hierarchy");
```

**Server-side oRPC procedures**:

```typescript
// apps/server/src/routes/hierarchy.routes.ts
import { router, procedure } from "@avantej-core/api/routers";
import { z } from "zod";

export const hierarchyRoutes = router({
  list: procedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      // Implementation
    }),
});
```

### Authentication Pattern

**Web App**:

```typescript
import { authClient } from "@/lib/auth-client";
const session = await authClient.getSession();
```

**Native App**:

```typescript
import { authClient } from "@/lib/auth-client";
const session = await authClient.getSession();
```

**Server Middleware**:

- Use `authMiddleware` from `@/middleware/auth.middleware.ts`
- Access session via `ctx.auth` in oRPC procedures

### Database Access Pattern

**Multi-tenant Architecture**:

- Control panel schema: `packages/db/src/schema/control-panel/`
- Tenant schema: `packages/db/src/schema/tenant/`
- Use `dbMiddleware` to get request-scoped database connections
- Access tenant DB via `ctx.db` in oRPC procedures

**Migrations**:

- Control panel: `packages/db/src/migrations/control-panel/`
- Tenant: `packages/db/src/migrations/tenant/`
- Run: `bun db:push` or `bun db:migrate`

### Form Handling

**Use TanStack Form** (not React Hook Form):

```typescript
import { useForm } from "@tanstack/react-form";
import { zodValidator } from "@tanstack/zod-form-adapter";

const form = useForm({
  defaultValues: { name: "" },
  validatorAdapter: zodValidator(),
  onSubmit: async ({ value }) => {
    await orpc.services.create.mutate(value);
  },
});
```

### UI Components

**Use Radix UI + Tailwind CSS (shadcn/ui pattern)**:

- Components in `components/ui/` follow shadcn/ui conventions
- Use `cn()` utility from `@/lib/utils` for className merging
- Prefer composition over configuration
- Use `class-variance-authority` for variant-based styling

### State Management

**Server State**: Always use TanStack Query:

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

const { data } = useQuery({
  queryKey: ["hierarchy", orgId],
  queryFn: () => orpc.hierarchy.list.query({ organizationId: orgId }),
});
```

**Client State**: Use React hooks (useState, useReducer) for simple state

### Environment Variables

**Web App**: `apps/web/.env` with `VITE_` prefix
**Native App**: `apps/native/.env` with `EXPO_PUBLIC_` prefix
**Server**: `apps/server/.env` or Cloudflare Workers secrets

### Testing

- Use Bun test framework
- Unit tests: `*.test.ts` files alongside source
- Integration tests: `*.integration.test.ts` files
- Test scripts: `bun test`, `bun test:integration`, etc.

### Code Quality

- **Linting**: Oxlint (configured in root package.json)
- **Formatting**: Biome (configured via lint-staged)
- **Type Checking**: `bun check-types` (runs `tsc -b` via Turborepo)
- Always run `bun check` before committing (runs oxlint)

### Deployment

**Server**: `cd apps/server && bun deploy` (Wrangler)
**Web**: `cd apps/web && bun deploy` (builds with Vite, deploys with Wrangler)
**Native**: Build via Expo EAS or `expo prebuild`

### Common Patterns

**Error Handling**:

- Use oRPC error handling in `onError` interceptors
- Show user-friendly errors via toast (Sonner) in web app
- Log errors server-side via console.error

**Loading States**:

- Use TanStack Query's `isLoading`, `isFetching` states
- Show loading UI with skeleton components

**Route Protection**:

- Web: Use route guards in TanStack Router
- Native: Use Expo Router's layout-based protection
- Server: Use auth middleware

### When to Use Client vs Server Components

**Web App (Vite + TanStack Router)**:

- All components are client-side by default (SPA)
- Use server-side rendering only if explicitly needed (not typical in this stack)

**Native App (Expo)**:

- All components are client-side (React Native)

**Server (Hono)**:

- All code runs server-side on Cloudflare Workers
- Use middleware for cross-cutting concerns

### Package Dependencies

- Use `catalog:` references for shared dependencies (see root package.json)
- Use `workspace:*` for internal packages
- Always add to appropriate workspace's package.json
- Run `bun install` at root after adding dependencies

### Examples

**Creating a new oRPC procedure**:

1. Add procedure to `packages/api/src/routers/[feature].ts`
2. Implement handler in `apps/server/src/routes/[feature].routes.ts`
3. Use in client: `orpc.[feature].[procedure].query/mutate()`

**Adding a new route**:

- Web: Create file in `apps/web/src/routes/`
- Native: Create file in `apps/native/app/`

**Adding a new database table**:

1. Create schema in `packages/db/src/schema/[control-panel|tenant]/[table].ts`
2. Export from appropriate schema index
3. Run `bun db:push` to generate migration

## Important Notes

- **DO NOT** use Next.js patterns (this is Vite + TanStack Router)
- **DO NOT** use Clerk (use Better-Auth)
- **DO NOT** use Convex (use Drizzle ORM with multi-tenant architecture)
- **DO NOT** use REST APIs directly (use oRPC)
- **DO NOT** use npm/yarn (use Bun)
- **DO NOT** use React Hook Form (use TanStack Form)
- Always maintain type safety across the monorepo via oRPC
- Follow the existing file structure and naming conventions
- Use Turborepo for parallel builds and caching
- Handle multi-tenancy correctly (control-panel vs tenant schemas)

If something is unclear, clarify assumptions and offer multiple solutions.
