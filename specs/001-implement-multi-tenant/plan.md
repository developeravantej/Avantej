# Implementation Plan: Multi-Tenant Authentication & Organization Management

**Branch**: `001-implement-multi-tenant` | **Date**: 2025-10-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-implement-multi-tenant/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement multi-tenant authentication and organization management using Better-Auth Organization and Admin plugins to support Avantej Core's B2B2C fitness platform. The system enables franchise owners (B2) to subscribe via Stripe, provision isolated organizations with hierarchical structure (Organization → Country → Region → Area → Branch), and manage team members with hierarchy-scoped roles (Admin, Trainer, Staff, Client). Platform administrators (Avantej Core) oversee all tenants through a centralized control panel without accessing tenant data. Key features: payment-gated provisioning (1:1 subscription-to-org), invitation-based member management, hierarchy-based RBAC, session context switching, and admin impersonation for support.

**Technical Approach**: Leverage Better-Auth Organization plugin for tenant isolation and member management, Better-Auth Admin plugin for platform governance, Neon serverless Postgres with separate projects per tenant (project-per-tenant pattern), Drizzle ORM for type-safe schema and migrations, Hono web framework with oRPC for type-safe edge API on Cloudflare Workers, Vite + TanStack Router for React SPA frontend (also deployed to Workers), and Stripe webhooks for payment-gated provisioning. All components align with stateless edge architecture, ≤200ms API latency, and strict TypeScript type safety.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) with Bun 1.x runtime
**Primary Dependencies**:
- Better-Auth 1.x (Organization + Admin plugins)
- Drizzle ORM 0.x (PostgreSQL adapter)
- Hono 4.x (Fast web framework for edge)
- oRPC 1.x (Type-safe RPC framework)
- Vite 6.x + TanStack Router 1.x (React SPA with routing)
- Stripe SDK 14.x (payment integration)
- Neon Serverless Driver (Postgres client)

**Storage**: Neon.tech Serverless Postgres (separate Neon projects per tenant for true data isolation, control panel database for platform metadata)

**Testing**: Vitest 1.x (unit/integration tests with Bun runtime), Playwright 1.x (E2E tests for user flows), Chrome DevTools MCP (frontend behavior validation)

**Target Platform**: Cloudflare Workers (edge runtime for API and frontend), Neon Serverless (database hosting)

**Project Type**: Web application (monorepo with separate backend API and frontend apps)

**Performance Goals**:
- API latency ≤200ms p95 (per constitution Principle IX)
- Authentication operations complete in <2 seconds
- Organization context switching <1 second
- Hierarchy permission checks <100ms (99th percentile)
- Database branch provisioning <30 seconds

**Constraints**:
- Stateless edge-native architecture (no server-side sessions per Principle III)
- JWT tokens ≤15 minutes lifespan (per Principle V)
- All tenant data must remain in dedicated Neon project (per Principle I)
- Payment confirmation required before organization creation (per Principle II)
- TLS 1.3 enforced, PII encrypted at rest/transit (per Principle X)

**Scale/Scope**:
- Support 1,000+ tenant organizations at launch
- Handle 10,000+ concurrent users across all tenants
- Manage 100+ members per large franchise organization
- Process 1,000+ invitation emails per day
- Audit log retention for 2 years minimum

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Mandatory Principles Compliance

| Principle | Requirement | Compliance Status | Implementation Notes |
|-----------|-------------|-------------------|---------------------|
| **I. Multi-Tenant Data Isolation** | Dedicated Neon project per tenant, hierarchy-scoped access | ✅ PASS | Each organization gets completely isolated Neon database project (project-per-tenant pattern). Hierarchy (Org → Country → Region → Area → Branch) enforced via Drizzle schema and Better-Auth Organization scoping. Query filters auto-apply tenant + hierarchy context. Connection routing middleware switches between control panel DB and tenant-specific DB. |
| **II. Payment-Gated Provisioning** | Organization creation only after Stripe payment confirmed | ✅ PASS | Stripe webhook handler validates `payment_intent.succeeded` or `subscription.created` events before triggering organization provisioning. 1:1 subscription-to-org ratio enforced in database schema. |
| **III. Stateless Edge-Native Architecture** | All logic on Cloudflare Workers, no server state | ✅ PASS | ElysiaJS API deployed to Workers. Session state stored in JWT (organization context, user role). Refresh tokens in HTTP-only cookies. Cloudflare KV for lightweight rate-limiting cache only. |
| **V. RBAC with Better-Auth** | Use Better-Auth, 4 roles, short-lived JWTs | ✅ PASS | Better-Auth Organization plugin provides built-in member roles. Custom roles mapped: Admin (org owner), Trainer, Staff, Client. JWTs expire after 15 min (Better-Auth config). Role checks enforced via Better-Auth middleware on all routes. |
| **VI. Type Safety & Strict TypeScript** | TypeScript strict mode, schema validation at boundaries | ✅ PASS | All code in TypeScript strict mode. Drizzle schemas provide compile-time type safety. ElysiaJS Elysia.t validators enforce runtime schema validation at API boundaries. |
| **VIII. Test Coverage & Quality Gates** | ≥80% coverage, unit/integration/E2E tests | ✅ PASS | Vitest for unit tests (auth logic, membership CRUD, hierarchy validation). Playwright for E2E (onboarding flow, invitation acceptance, admin panel). Coverage enforced in Turbo CI config. |
| **IX. Performance & Observability** | ≤200ms API latency, structured logging, OpenTelemetry | ✅ PASS | Cloudflare Workers analytics for latency monitoring. ElysiaJS structured logging with tenant context, user ID, request ID. OpenTelemetry SDK for distributed tracing across Workers → Neon → Stripe. |
| **X. Security & Compliance** | TLS 1.3, PII encrypted, GDPR/PCI-DSS compliance | ✅ PASS | Cloudflare enforces TLS 1.3. Neon encrypts data at rest. Better-Auth hashes passwords (bcrypt). No PII in JWT claims or logs. Stripe handles PCI-DSS (no card data stored). GDPR: data export via API, deletion via cascade constraints. |
| **XI. Conventional Commits & Spec-Driven Workflow** | Follow Spec-Kit lifecycle, commit message format | ✅ PASS | This plan follows `/speckit.plan` workflow. Tasks will reference spec ID `spec:001-implement-multi-tenant`. Commits use Conventional Commits format enforced by git hooks. |
| **XII. Centralized Tenant Governance** | Admin control panel via Better-Auth Admin plugin | ✅ PASS | Better-Auth Admin plugin provides tenant oversight APIs. Avantej Admin dashboard (TanStack Start) displays metadata from master Neon database (org status, payment status, member count). Admin impersonation logged for audit. |

### Technology Stack Alignment

| Component | Constitution Requirement | Selected Technology | Justification |
|-----------|-------------------------|---------------------|---------------|
| **Backend Framework** | Hono | Hono 4.x | ✅ Fast, lightweight web framework. Edge-optimized with zero dependencies. Works perfectly with Cloudflare Workers. |
| **API Layer** | oRPC | oRPC 1.x | ✅ End-to-end type safety between client and server. OpenAPI generation included. |
| **Frontend Framework** | Vite + TanStack Router | Vite 6.x + TanStack Router 1.x | ✅ Fast build tool with type-safe routing. React SPA architecture for admin and web apps. |
| **Database** | Neon.tech | Neon Serverless Postgres | ✅ Constitution-mandated. Project-per-tenant (separate Neon projects) provides true data isolation with scale-to-zero cost efficiency. |
| **ORM** | Drizzle ORM | Drizzle ORM 0.x | ✅ Constitution-mandated. Type-safe schema, automatic migrations. |
| **Auth** | Better-Auth with Organization + Admin plugins | Better-Auth 1.x | ✅ Constitution-mandated. Organization plugin for multi-tenant, Admin plugin for platform governance. |
| **Realtime Sync** | TanStack DB + ElectricSQL Cloud | N/A (deferred to future feature) | ⚠️ Not required for this feature. Auth and org management are request/response based. Realtime sync needed for booking/calendar features. |
| **Payments** | Stripe + Stripe Connect | Stripe SDK 14.x | ✅ Constitution-mandated. Webhook integration for payment-gated provisioning. |
| **Hosting** | Cloudflare Workers | Cloudflare Workers | ✅ Edge runtime for both API and frontend (via Vite + Workers). |
| **Package Manager** | Bun | Bun 1.x | ✅ Constitution-mandated. Fast runtime and package manager. |
| **Monorepo** | Turborepo | Turborepo 1.x | ✅ Constitution-mandated. Caching and orchestration for monorepo builds. |
| **Styling** | Tailwind CSS + Radix UI | Tailwind CSS 3.x + Radix UI 1.x | ✅ Constitution-mandated. Accessible components for admin panel and onboarding UI. |
| **Testing** | Vitest, Playwright, Chrome DevTools MCP | Vitest 1.x + Playwright 1.x | ✅ Constitution-mandated. Bun-compatible test runner, E2E for user flows. |

### Pre-Research Gate Evaluation

**Status**: ✅ **PASS** - All mandatory principles satisfied, no constitution violations.

No complexity justification required. This feature aligns perfectly with the approved technology stack and architectural principles.

## Project Structure

### Documentation (this feature)

```
specs/001-implement-multi-tenant/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Feature specification
├── research.md          # Phase 0 output (technology decisions and patterns)
├── data-model.md        # Phase 1 output (entity schemas and relationships)
├── quickstart.md        # Phase 1 output (development setup guide)
├── contracts/           # Phase 1 output (API specifications)
│   ├── auth-api.yaml        # Authentication endpoints (login, register, verify)
│   ├── org-api.yaml         # Organization lifecycle (create, update, suspend)
│   ├── hierarchy-api.yaml   # Hierarchy management (CRUD for nodes)
│   ├── member-api.yaml      # Member management (invite, remove, update roles)
│   ├── admin-api.yaml       # Admin control panel (view tenants, impersonate)
│   └── webhook-api.yaml     # Stripe webhook handlers (payment events)
├── checklists/
│   └── requirements.md  # Specification quality validation
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

The Avantej Core monorepo follows a multi-platform structure with backend server, web app, and mobile app.

```
apps/
├── server/                      # Hono backend API (Cloudflare Workers)
│   ├── src/
│   │   ├── index.ts            # Hono app entry point + oRPC routes
│   │   ├── routes/             # oRPC procedure definitions
│   │   │   ├── auth.ts         # Authentication procedures
│   │   │   ├── organizations.ts # Organization procedures
│   │   │   ├── hierarchy.ts    # Hierarchy procedures
│   │   │   ├── members.ts      # Member management procedures
│   │   │   ├── admin.ts        # Admin procedures
│   │   │   └── webhooks.ts     # Stripe webhook handlers
│   │   ├── middleware/         # Hono middleware
│   │   │   ├── auth.middleware.ts     # Better-Auth session validation
│   │   │   ├── tenant.middleware.ts   # Organization context injection
│   │   │   ├── hierarchy.middleware.ts # Hierarchy scope enforcement
│   │   │   └── ratelimit.middleware.ts # Tenant-level rate limiting
│   │   ├── services/           # Business logic
│   │   │   ├── auth.service.ts       # User authentication, email verification
│   │   │   ├── org.service.ts        # Organization provisioning, lifecycle
│   │   │   ├── member.service.ts     # Invitation, role assignment, removal
│   │   │   ├── hierarchy.service.ts  # Node creation, movement, deletion
│   │   │   ├── admin.service.ts      # Tenant oversight, impersonation
│   │   │   └── payment.service.ts    # Stripe webhook processing
│   │   └── lib/                # Shared utilities
│   │       ├── db.ts           # Drizzle database clients
│   │       ├── stripe.ts       # Stripe client configuration
│   │       └── logger.ts       # Structured logging utility
│   ├── tests/
│   │   ├── unit/               # Vitest unit tests
│   │   └── integration/        # Vitest integration tests
│   └── wrangler.toml           # Cloudflare Workers configuration
│
├── web/                         # Web app (Vite + TanStack Router + Cloudflare Workers)
│   ├── app/
│   │   ├── routes/             # TanStack Router routes
│   │   │   ├── _auth/          # Login, register, verify email
│   │   │   ├── onboarding/     # Post-payment org setup wizard
│   │   │   ├── dashboard/      # Org dashboard, hierarchy view
│   │   │   ├── members/        # Member list, invite, manage
│   │   │   ├── admin/          # Admin control panel (platform admins)
│   │   │   └── settings/       # Org settings, profile
│   │   ├── components/         # React components
│   │   │   ├── HierarchyTree.tsx     # Tree view of org structure
│   │   │   ├── MemberTable.tsx       # Member list with filters
│   │   │   ├── InviteForm.tsx        # Invitation creation form
│   │   │   ├── OrgSwitcher.tsx       # Multi-org context switcher
│   │   │   └── OnboardingWizard.tsx  # Step-by-step org setup
│   │   └── lib/                # Client-side utilities
│   │       ├── auth-client.ts  # Better-Auth client
│   │       └── api.ts          # oRPC client (type-safe)
│   ├── tests/
│   │   └── e2e/                # Playwright E2E tests
│   ├── vite.config.ts          # Vite configuration
│   └── wrangler.toml           # Cloudflare Workers deployment config
│
├── native/                      # Mobile app (Expo + React Native)
│   ├── app/                    # Expo Router file-based routing
│   │   ├── (auth)/             # Auth screens
│   │   ├── (tabs)/             # Tab navigation
│   │   └── _layout.tsx         # Root layout
│   ├── components/             # React Native components
│   └── lib/
│       ├── auth-client.ts      # Better-Auth Expo client
│       └── api.ts              # oRPC client (type-safe)
│
└── packages/
    ├── db/                     # Drizzle schema and migrations
    │   ├── src/
    │   │   ├── schema/         # Table definitions
    │   │   │   ├── users.ts            # User accounts (platform-wide)
    │   │   │   ├── organizations.ts    # Organizations (tenants)
    │   │   │   ├── hierarchy.ts        # Hierarchy nodes (country/region/area/branch)
    │   │   │   ├── members.ts          # Organization memberships
    │   │   │   ├── invitations.ts      # Pending invitations
    │   │   │   ├── subscriptions.ts    # Stripe subscription records
    │   │   │   └── admin-sessions.ts   # Impersonation sessions
    │   │   └── migrations/     # Drizzle migration files
    │   └── drizzle.config.ts   # Drizzle configuration
    │
    ├── auth/                   # Better-Auth configuration
    │   └── src/
    │       └── index.ts        # Shared Better-Auth config
    │
    └── api/                    # oRPC contracts (shared types)
        └── src/
            ├── index.ts        # oRPC router exports
            ├── auth.ts         # Auth procedure contracts
            ├── organization.ts # Organization procedure contracts
            └── member.ts       # Member procedure contracts
```

**Structure Decision**: Multi-platform monorepo structure selected. Rationale:
- **`apps/server`** for Hono backend API (Cloudflare Workers deployment)
- **`apps/web`** for web application (Vite + TanStack Router, deployed to Cloudflare Workers)
- **`apps/native`** for mobile application (Expo + React Native)
- **Shared `packages/db`** for Drizzle schema (used by server and migrations)
- **Shared `packages/auth`** for Better-Auth configuration (used across all apps)
- **Shared `packages/api`** for oRPC contracts (shared type-safe API definitions)

This structure enables independent deployment of server (Workers), web (Workers via Vite), and native (mobile stores), while sharing database schema, authentication, and API contracts to ensure type safety. Turborepo orchestrates builds and caching across all apps and packages.

## Complexity Tracking

*No constitution violations detected. Complexity tracking table not required.*

All technology choices align with constitution-approved stack. No additional architectural patterns or complexity introduced beyond what's mandated by the constitution.
