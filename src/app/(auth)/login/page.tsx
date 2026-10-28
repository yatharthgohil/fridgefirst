import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleSignIn } from "@/features/auth/google-sign-in";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getUser } from "@/server/auth/session";

export const metadata = { title: "Log in | FridgeFirst" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getUser()) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section aria-labelledby="login-heading" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm font-semibold text-emerald-800">FridgeFirst</Link>
        <h1 id="login-heading" className="mt-8 text-2xl font-semibold tracking-tight">Welcome to FridgeFirst</h1>
        <p className="mb-8 mt-3 text-sm leading-6 text-slate-600">
          Log in or create an account to get started.
        </p>
        {error && (
          <p role="alert" className="mb-5 text-sm leading-6 text-red-700">
            {error === "signout"
              ? "We couldn’t sign you out. Please try again."
              : "Sign-in wasn’t completed. Please try again with Google."}
          </p>
        )}
        <GoogleSignIn configured={Boolean(getSupabaseConfig())} />
        <p className="mt-6 text-center text-xs leading-5 text-slate-500">
          New here? Your first sign-in creates your account.
        </p>
      </section>
    </main>
  );
}
