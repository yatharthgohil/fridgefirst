"use client";

import React, { useState } from "react";
import { LandingView } from "@/features/landing";
import { OnboardingWizard, OnboardingData } from "@/features/account";
import { AppShell } from "@/components";

export default function HomePage() {
  const [view, setView] = useState<"landing" | "onboarding" | "app">("landing");
  const [user, setUser] = useState({ name: "Alex Johnson", email: "alex@example.com" });

  const handleOnboardingComplete = (data: OnboardingData) => {
    setUser({
      name: data.name || "Alex Johnson",
      email: "alex@example.com",
    });
    setView("app");
  };

  if (view === "app") {
    return (
      <AppShell
        initialUser={user}
        onSignOut={() => setView("landing")}
      />
    );
  }

  if (view === "onboarding") {
    return (
      <OnboardingWizard
        initialName=""
        onComplete={handleOnboardingComplete}
        onCancel={() => setView("landing")}
      />
    );
  }

  return (
    <LandingView
      onGetStarted={() => setView("onboarding")}
      onSignIn={() => setView("app")}
    />
  );
}
