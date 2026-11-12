"use client";

import { useRouter } from "next/navigation";
import { LandingView } from "@/features/landing";

export default function HomePage() {
  const router = useRouter();
  const openLogin = () => router.push("/login");

  return <LandingView onGetStarted={openLogin} onSignIn={openLogin} />;
}
