import { AppShell } from "@/components";
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
  const fullName: unknown = user.user_metadata.full_name;
  const email = user.email ?? "";

  return (
    <>
      {error === "signout" && (
        <p role="alert" className="p-4 text-sm text-red-700">
          We couldn&rsquo;t sign you out. Please try again.
        </p>
      )}
      <AppShell
        initialUser={{
          name: typeof fullName === "string" && fullName.trim() ? fullName : email,
          email,
        }}
        onSignOut={signOut}
      />
    </>
  );
}
