import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components";
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
    <div className="welcome-site">
      <header className="welcome-nav">
        <Link href="/" className="welcome-brand" aria-label="FridgeFirst">
          <img className="brand-logo" src="/fridgefirst-leaves.png" alt="" />
          <strong>FridgeFirst</strong>
        </Link>
        <div>
          <Link
            href="/"
            className="button button-secondary"
            style={{ fontSize: "11px", padding: "7px 13px", gap: "6px" }}
          >
            <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
              <Icon name="arrow" size={13} />
            </span>
            <span>Back to home</span>
          </Link>
        </div>
      </header>

      <main className="auth-page">
        <section aria-labelledby="login-heading" className="auth-card login-card">
          <div
            className="auth-icon"
            style={{ width: "54px", height: "54px", borderRadius: "16px", marginBottom: "16px" }}
          >
            <img
              src="/fridgefirst-leaves.png"
              alt="FridgeFirst Logo"
              style={{ width: "36px", height: "36px", objectFit: "contain" }}
            />
          </div>

          <span
            className="eyebrow"
            style={{ display: "block", marginBottom: "6px" }}
          >
            WELCOME TO FRIDGEFIRST
          </span>

          <h1
            id="login-heading"
            style={{
              fontFamily: '"Fraunces", serif',
              fontSize: "28px",
              lineHeight: 1.2,
              margin: "0 0 10px",
              letterSpacing: "-.02em",
              color: "var(--ink)",
            }}
          >
            Cook what you have.
          </h1>

          <p
            style={{
              color: "var(--muted)",
              fontSize: "13px",
              lineHeight: 1.55,
              margin: "0 auto 24px",
              maxWidth: "320px",
            }}
          >
            Sign in to access your pantry, rescue expiring groceries, and build smarter meals.
          </p>

          {error && (
            <p
              role="alert"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 14px",
                marginBottom: "20px",
                borderRadius: "10px",
                background: "var(--red-soft)",
                color: "var(--red)",
                border: "1px solid #f3d4cc",
                fontSize: "12px",
                textAlign: "left",
                lineHeight: 1.4,
              }}
            >
              <Icon name="alert" size={16} />
              <span>Sign-in wasn’t completed. Please try again with Google.</span>
            </p>
          )}

          <GoogleSignIn configured={Boolean(getSupabaseConfig())} />

          <p
            className="auth-switch"
            style={{ margin: "22px 0 0", paddingTop: "16px", color: "var(--muted)", fontSize: "11px" }}
          >
            New here? Your first sign-in creates your account.
          </p>

          <div
            style={{
              marginTop: "20px",
              paddingTop: "16px",
              borderTop: "1px solid var(--line)",
              display: "flex",
              justifyContent: "center",
              gap: "18px",
              fontSize: "10px",
              color: "var(--muted)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <span style={{ display: "inline-flex", color: "var(--green)" }}>
                <Icon name="check" size={13} />
              </span>
              <span>Free to use</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <span style={{ display: "inline-flex", color: "var(--green)" }}>
                <Icon name="check" size={13} />
              </span>
              <span>No credit card</span>
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
