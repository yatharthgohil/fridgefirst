# FridgeFirst

Minimal Next.js App Router starter using TypeScript and Tailwind CSS. The home page is intentionally blank. No product components, authentication flow, database schema, or AI integration are implemented yet.

See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for product scope, architecture, and implementation decisions.

## Local development

Use Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. A blank page is expected. `GET /api/health` returns `{"status":"ok"}` to confirm HTTP routing works; it does not check external services.

The starter runs without environment variables. When adding Supabase, copy `.env.example` to `.env.local` and supply your project's values. Keep credentials out of Git. Supabase clients, session handling, and AI provider credentials will be added with their respective features.

## Commands

```sh
npm run lint
npm run typecheck
npm run build
npm start
```

`npm start` runs the production app after a successful build.

### Tooling dependency note

The pinned Next.js lint configuration currently depends on plugins that require ESLint 9. npm marks that ESLint version deprecated and reports a `braces` advisory through the lint configuration's dependency chain. No patched `braces` release is available at setup time; npm's suggested fix would downgrade the Next.js lint configuration across major versions. This affects development tooling, not the application's runtime dependencies. Revisit the linter dependencies when compatible updates are available.

## Organization

| Directory | Responsibility |
| --- | --- |
| `src/app/` | Pages, layouts, and thin HTTP route handlers |
| `src/features/` | Feature-specific UI and client hooks |
| `src/components/` | Shared UI components |
| `src/server/modules/` | Server-side domain rules and application services |
| `src/server/integrations/` | AI, database, and storage adapters |
| `src/server/auth/` | Session verification and authorization helpers |
| `src/lib/supabase/` | Separate browser/server Supabase helpers |
| `src/contracts/` | Shared validation schemas and API types |
| `supabase/migrations/` | Future database migrations |
| `supabase/seed/` | Future shelf-life reference data |
| `docs/` | Project decisions and implementation notes |
| `public/` | Static assets |

Empty directories contain `.gitkeep` files so Git preserves the intended structure. Route placeholders do not create HTTP endpoints until a `route.ts` or `page.tsx` is added. `(auth)` and `(dashboard)` are organizational route groups, not access controls.

Keep domain logic outside route handlers. Mark privileged server modules with `import "server-only"` when implementing them. Use `@/` imports for files under `src/`. Zod and the server-only guard package are installed for future modules; Supabase SDKs are deferred until integration work begins.

## Deployment

The application is intended for Vercel, with Supabase providing the data platform. No Express server or separate frontend/backend projects are needed. Deployment and external services are not configured by this starter.
