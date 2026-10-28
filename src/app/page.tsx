import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white p-6 sm:p-8">
      <nav aria-label="Account" className="flex justify-end">
        <Link href="/login" className="button button-primary">
          Log in / Sign up
        </Link>
      </nav>
    </main>
  );
}
