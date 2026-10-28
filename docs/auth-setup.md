# FridgeFirst authentication setup

The Supabase project **FridgeFirst** (`valnsnmulmzikmpqljfh`, us-east-1) has been created. Its URL and public publishable key are saved in the ignored `.env.local` file for this checkout. No service-role key is used.

The application code is implemented and the build, lint, type checking, signed-out dashboard redirect, and invalid OAuth callback checks pass. Google OAuth setup is complete, and the user confirmed that Google signup works locally on October 28, 2026.

## Setup reference

1. Sign in to [Google Cloud](https://console.cloud.google.com/auth/clients), choose your Google Cloud project, configure its consent screen, and create a **Web application** OAuth client.
2. Set its authorized JavaScript origin to `http://localhost:3000` and its authorized redirect URI to `https://valnsnmulmzikmpqljfh.supabase.co/auth/v1/callback`. Add a test user if the OAuth application is in testing mode.
3. Open [FridgeFirst authentication providers](https://supabase.com/dashboard/project/valnsnmulmzikmpqljfh/auth/providers), enable Google, and save the client ID and client secret from Google Cloud directly in those settings. Do not commit the secret or put it in a public environment variable.
4. Open [FridgeFirst URL configuration](https://supabase.com/dashboard/project/valnsnmulmzikmpqljfh/auth/url-configuration), set the Site URL to `http://localhost:3000`, and add `http://localhost:3000/auth/callback` as an allowed redirect URL.
5. Open [the local app](http://localhost:3000), click **Log in / Sign up**, then **Continue with Google**. Complete Google consent, confirm the dashboard placeholder appears, refresh to verify the session, and sign out. Reopening `/dashboard` must return to login.

When deploying, add the production origin to Google Cloud, add the production `/auth/callback` URL in Supabase, update the Site URL, and configure the two public environment variables before the Vercel build. See [README](../README.md) for the general setup instructions.
