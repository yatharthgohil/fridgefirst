import { AppShell } from "@/components";
import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/server/auth/session";
import { listPantry } from "@/server/modules/pantry/service";
import { contractToUiItem } from "@/features/pantry";
import type { PantryItem } from "@/features/pantry/types";

export const metadata = { title: "Dashboard | FridgeFirst" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { error } = await searchParams;
  const fullName: unknown = user.user_metadata?.full_name;
  const email = user.email ?? "";

  let initialPantryItems: PantryItem[] | null = null;
  let initialPantryError: string | null = null;

  try {
    const { items: serverItems } = await listPantry();
    initialPantryItems = serverItems
      .filter((item) => (item.status === undefined || item.status === "active") && item.quantity > 0)
      .map(contractToUiItem);
  } catch (err) {
    initialPantryError = err instanceof Error ? err.message : "Failed to load pantry items";
  }

  return (
    <>
      {error === "signout" && (
        <p role="alert" className="p-4 text-sm text-red-700">
          We couldn&rsquo;t sign you out. Please try again.
        </p>
      )}
      <AppShell
        key={user.id}
        authenticatedUserId={user.id}
        initialUser={{
          name: typeof fullName === "string" && fullName.trim() ? fullName : email,
          email,
        }}
        onSignOut={signOut}
        initialPantryItems={initialPantryItems}
        initialPantryError={initialPantryError}
      />
    </>
  );
}
