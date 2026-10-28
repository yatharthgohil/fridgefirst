# FridgeFirst

Next.js App Router application using TypeScript, Tailwind CSS, and Supabase Auth. The home page is intentionally blank except for a Log in / Sign up button. Google sign-in creates an account or logs in an existing user, then redirects to a protected dashboard placeholder.

See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for product scope, architecture, and implementation decisions.

## Local development

Use Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. `GET /api/health` returns `{"status":"ok"}` to confirm HTTP routing works; it does not check external services.

The pages render without environment variables, but Google sign-in is disabled until Supabase is configured. Keep credentials out of Git.

## Supabase and Google setup

1. Create or select a Supabase project. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project's Connect dialog. Never use a service-role or secret key in a public variable.
2. In Google Cloud, configure your OAuth consent screen and create a **Web application** OAuth client. Add `http://localhost:3000` and your production origin to its authorized JavaScript origins. Add the Supabase callback URL shown in the Google provider settings (normally `https://<project-ref>.supabase.co/auth/v1/callback`) to its authorized redirect URIs. If Google's app is in testing mode, add your Google account as a test user.
3. In **Supabase → Authentication → Sign In / Providers → Google**, enable Google and save the Google client ID and client secret. Leave new user signup enabled so a first Google sign-in creates the account. Google secrets belong in Supabase, not in this repository.
4. In **Supabase → Authentication → URL Configuration**, set the Site URL to your production origin (or `http://localhost:3000` for local development). Add `http://localhost:3000/auth/callback` and `https://<your-production-domain>/auth/callback` to the allowed redirect URLs.
5. Restart the development server after editing `.env.local`. Set the same public environment variables in Vercel before building/deploying.

See the official [Google provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [server-side authentication guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

Supabase Auth persists accounts and Google identities in its managed `auth.users` and `auth.identities` tables. No separate profile table or SQL migration is needed for this placeholder. Pantry tables and storage buckets will be added with their features.

### Authentication flow and verification

- `/` → **Log in / Sign up** → `/login` → **Continue with Google** → Google consent → `/auth/callback` → `/dashboard`.
- The callback exchanges the OAuth code for a cookie-based Supabase session. The Next.js proxy refreshes session cookies, and the dashboard verifies the user with Supabase Auth on the server.
- A signed-out visitor opening `/dashboard` is redirected to `/login`; a signed-in visitor opening `/login` is redirected to `/dashboard`.
- **Sign out** ends the current browser session and returns to `/`. Opening `/dashboard` afterward must redirect to `/login` again.
- Cancelled or failed OAuth attempts return to the login page with a retry message. Missing project configuration disables sign-in without exposing credentials or bypassing authentication.

After configuring the provider, verify the flow above with a real Google account, refresh the dashboard to check persistence, then sign out and verify the protected route again. Browser cookies are required, and OAuth must finish in the browser that started it.

## Commands

```sh
npm run lint
npm run typecheck
npm run build
npm start
```

`npm start` runs the production app after a successful build.

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
| `supabase/migrations/` | Future product database migrations (Auth manages its own user tables) |
| `supabase/seed/` | Future shelf-life reference data |
| `docs/` | Project decisions and implementation notes |
| `public/` | Static assets |

Empty directories contain `.gitkeep` files so Git preserves the intended structure. Route placeholders do not create HTTP endpoints until a `route.ts` or `page.tsx` is added. `(auth)` and `(dashboard)` are organizational route groups, not access controls.

Keep domain logic outside route handlers. Mark privileged server modules with `import "server-only"`. Use `@/` imports for files under `src/`. Supabase browser/server clients live in `src/lib/supabase/`; session authorization helpers live in `src/server/auth/`. Each future protected data operation must verify authorization independently.

## Deployment

The application is intended for Vercel, with Supabase providing the data platform. No Express server or separate frontend/backend projects are needed. External project/provider setup is required as described above; deployment is not configured in this repository.
