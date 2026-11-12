"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignIn({ configured }: { configured: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch {
      setError("We couldn’t start Google sign-in. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={signIn}
        disabled={!configured || pending}
        className="button w-full"
      >
        <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
          <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.8-3.5 6.1-8.6 6.1-14.9Z" />
          <path fill="#34A853" d="M24 44c5.4 0 9.9-1.8 13.2-4.8l-6.6-5c-1.8 1.2-4 1.9-6.6 1.9-5.2 0-9.6-3.5-11.2-8.2H6v5.2A20 20 0 0 0 24 44Z" />
          <path fill="#FBBC05" d="M12.8 27.9a12 12 0 0 1 0-7.8v-5.2H6a20 20 0 0 0 0 18.2l6.8-5.2Z" />
          <path fill="#EA4335" d="M24 11.9c2.9 0 5.5 1 7.5 2.9l5.6-5.6A19 19 0 0 0 24 4 20 20 0 0 0 6 14.9l6.8 5.2c1.6-4.7 6-8.2 11.2-8.2Z" />
        </svg>
        {pending ? "Connecting to Google…" : "Continue with Google"}
      </button>
      {!configured && (
        <p role="status" className="text-sm leading-6 text-slate-600">
          Sign-in isn’t available yet. Please check back soon.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
