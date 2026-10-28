import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Dashboard | FridgeFirst" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-white p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <span className="text-sm font-semibold text-emerald-800">FridgeFirst</span>
        <div className="flex flex-wrap items-center gap-4">
          <span className="break-all text-sm text-slate-600">{user.email}</span>
          <form action={signOut}><button className="button" type="submit">Sign out</button></form>
        </div>
      </header>
      {error === "signout" && <p role="alert" className="mt-6 text-sm text-red-700">We couldn’t sign you out. Please try again.</p>}
      <section className="mx-auto flex max-w-lg flex-col items-center py-32 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard placeholder for now</h1>
        <p className="mt-3 text-sm text-slate-600">You’re signed in. Your dashboard is coming soon.</p>
      </section>
    </main>
  );
}
