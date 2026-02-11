# How to Run the Project

This monorepo contains **web** (React + Vite), **server** (Hono API on Cloudflare Workers), and **native** (Expo/React Native) apps. Use either **npm** or **Bun** for install and scripts.

---

## Prerequisites

- **Node.js** 18+ (required)
- **npm** (comes with Node) or **Bun** ([install Bun](https://bun.sh))
- **PostgreSQL** (for database; required for server)
- **Expo Go** app on your phone (optional; for running the mobile app)

---

## 1. Install dependencies

From the project root:

```bash
# With npm
npm install

# Or with Bun (if installed)
bun install
```

Use the same tool for the rest of the commands (e.g. if you used `npm install`, use `npm run dev`).

---

## 2. Environment setup

### Server (`apps/server`)

- Ensure **PostgreSQL** is running and you have a connection string.
- Create or edit `apps/server/.env` (and `apps/server/.dev.vars` if you use Wrangler secrets) with your database and auth URLs. Example:

  ```env
  # Database (control panel / tenant URLs as used by your app)
  DATABASE_URL=postgresql://...
  # Auth
  BETTER_AUTH_URL=http://localhost:3000
  BETTER_AUTH_SECRET=your-secret
  # CORS (web app origin)
  CORS_ORIGIN=http://localhost:3001
  ```

- Copy or adapt from any existing `.env.example` or project docs. The server reads from `.env` / `.dev.vars` when running locally.

### Web (`apps/web`)

- Copy `apps/web/.env.example` to `apps/web/.env` and set the API base URL:

  ```env
  VITE_SERVER_URL=http://localhost:3000
  ```

### Native (`apps/native`)

- Copy `apps/native/.env.example` to `apps/native/.env` and set the API base URL:

  ```env
  EXPO_PUBLIC_SERVER_URL=http://localhost:3000
  ```

---

## 3. Database

From the project root:

```bash
# Push schema to the database (Drizzle)
npm run db:push
# or
bun run db:push
```

Other useful commands:

- `npm run db:studio` — open Drizzle Studio
- `npm run db:generate` — generate migrations
- `npm run db:migrate` — run migrations

---

## 4. Run the apps

All commands are run from the **project root** unless stated otherwise.

### Run everything (web + server)

```bash
npm run dev
# or
bun run dev
```

- **Web app:** [http://localhost:3001](http://localhost:3001)
- **API:** [http://localhost:3000](http://localhost:3000)

### Run only the web app

```bash
npm run dev:web
# or
bun run dev:web
```

Requires the server to be running (e.g. in another terminal with `npm run dev:server`) for API calls.

### Run only the server

```bash
npm run dev:server
# or
bun run dev:server
```

API: [http://localhost:3000](http://localhost:3000).

### Run the native (Expo) app

```bash
npm run dev:native
# or
bun run dev:native
```

Then open the project in **Expo Go** on your device (scan QR code or use the tunnel URL). Ensure `EXPO_PUBLIC_SERVER_URL` in `apps/native/.env` points to your running API (e.g. `http://localhost:3000`; use your machine’s LAN IP or tunnel URL if testing on a physical device).

---

## 5. Other useful commands

| Command              | Description                          |
|----------------------|--------------------------------------|
| `npm run build`      | Build all apps                       |
| `npm run check-types` | Type-check all packages            |
| `npm run check`      | Run oxlint                           |
| `npm run db:push`    | Push Drizzle schema to the database  |
| `npm run db:studio`  | Open Drizzle Studio                  |

Use `bun run <script>` instead of `npm run <script>` if you installed with Bun.

---

## 6. Login credentials (reference)

From the main README:

- **Avantej Core (SaaS):** developer.avantej@gmail.com / password123  
- **Tenant (franchisee):** franchisee@gmail.com / password123  

Use these only in development.

---

## Troubleshooting

- **“bun is not recognized”**  
  Use **npm** for all commands (e.g. `npm install`, `npm run dev`). The project works with both npm and Bun.

- **API or DB errors**  
  Check `apps/server/.env` and that PostgreSQL is running and reachable. Run `npm run db:push` after changing schema.

- **Web app can’t reach API**  
  Ensure `VITE_SERVER_URL` in `apps/web/.env` is `http://localhost:3000` (or your server URL) and that the server is running.

- **Native app can’t reach API**  
  On a real device, use your computer’s LAN IP or Expo’s tunnel URL in `EXPO_PUBLIC_SERVER_URL`, not `localhost`.
