"use client";

import React, { useState } from "react";
import { Button, Icon } from "@/components";

export interface OnboardingData {
  name: string;
  measurementUnit: "Metric" | "US customary";
  equipment: string[];
  preferences: string[];
  excludedFoods: string[];
  monthlyGoalKg: number;
}

export interface OnboardingWizardProps {
  initialName?: string;
  onComplete: (data: OnboardingData) => void;
  onCancel?: () => void;
}

export function OnboardingWizard({
  initialName = "",
  onComplete,
  onCancel,
}: OnboardingWizardProps) {
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboarding, setOnboarding] = useState({
    name: initialName,
    measurementUnit: "Metric" as "Metric" | "US customary",
    equipment: ["Oven", "Stovetop"],
    preferences: ["Quick & easy"],
    excludedFoods: "",
    goal: "medium",
  });

  const toggleEquipment = (tool: string) => {
    setOnboarding((curr) => ({
      ...curr,
      equipment: curr.equipment.includes(tool)
        ? curr.equipment.filter((t) => t !== tool)
        : [...curr.equipment, tool],
    }));
  };

  const togglePreference = (pref: string) => {
    setOnboarding((curr) => ({
      ...curr,
      preferences: curr.preferences.includes(pref)
        ? curr.preferences.filter((p) => p !== pref)
        : [...curr.preferences, pref],
    }));
  };

  const finishOnboarding = () => {
    const goalKg =
      onboarding.goal === "low" ? 3 : onboarding.goal === "high" ? 10 : 6;
    onComplete({
      name: onboarding.name.trim(),
      measurementUnit: onboarding.measurementUnit,
      equipment: onboarding.equipment,
      preferences: onboarding.preferences,
      excludedFoods: onboarding.excludedFoods
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      monthlyGoalKg: goalKg,
    });
  };

  return (
    <div className="welcome-site">
      <main className="auth-page">
        <Button
          variant="ghost"
          className="auth-back"
          onClick={() =>
            onboardingStep > 1
              ? setOnboardingStep((s) => s - 1)
              : onCancel?.()
          }
        >
          <Icon name="arrow" size={16} />{" "}
          {onboardingStep > 1 ? "Previous step" : "Back"}
        </Button>

        <section className="auth-card onboarding-card">
          <div className="onboarding-progress">
            <div>
              <span>YOUR SETUP</span>
              <strong>Step {onboardingStep} of 3</strong>
            </div>
            <div className="onboarding-progress-track">
              <span style={{ width: `${(onboardingStep / 3) * 100}%` }} />
            </div>
          </div>

          {onboardingStep === 1 && (
            <div className="onboarding-step">
              <span className="auth-icon">
                <Icon name="users" size={22} />
              </span>
              <span className="eyebrow">LET’S GET TO KNOW YOU</span>
              <h1>Make FridgeFirst yours</h1>
              <p>
                Your name and measurement preference help personalize quantities,
                goals, and reminders.
              </p>
              <label className="onboarding-field">
                <span>Name</span>
                <input
                  value={onboarding.name}
                  onChange={(e) =>
                    setOnboarding({ ...onboarding, name: e.target.value })
                  }
                  placeholder="What should we call you?"
                  autoFocus
                />
              </label>
              <div className="onboarding-question">
                <span>Measurements</span>
                <div className="onboarding-choice-grid two">
                  {(["Metric", "US customary"] as const).map((unit) => (
                    <Button
                      type="button"
                      variant="ghost"
                      className={
                        onboarding.measurementUnit === unit ? "selected" : ""
                      }
                      onClick={() =>
                        setOnboarding({ ...onboarding, measurementUnit: unit })
                      }
                      key={unit}
                    >
                      <Icon
                        name={
                          onboarding.measurementUnit === unit
                            ? "check"
                            : "settings"
                        }
                        size={15}
                      />
                      <span>
                        <strong>
                          {unit === "Metric" ? "Metric" : "US units"}
                        </strong>
                        <small>
                          {unit === "Metric" ? "kg, g, mL" : "lb, oz, cups"}
                        </small>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {onboardingStep === 2 && (
            <div className="onboarding-step">
              <span className="auth-icon">
                <Icon name="recipes" size={22} />
              </span>
              <span className="eyebrow">YOUR KITCHEN & TASTES</span>
              <h1>What works for you?</h1>
              <p>Choose everything that applies. You can update these preferences later.</p>
              <div className="onboarding-question">
                <span>Tools in your kitchen</span>
                <div className="onboarding-chips">
                  {[
                    "Oven",
                    "Stovetop",
                    "Microwave",
                    "Air fryer",
                    "Blender",
                    "Slow cooker",
                  ].map((tool) => (
                    <Button
                      type="button"
                      variant="ghost"
                      className={
                        onboarding.equipment.includes(tool) ? "selected" : ""
                      }
                      onClick={() => toggleEquipment(tool)}
                      key={tool}
                    >
                      {onboarding.equipment.includes(tool) && (
                        <Icon name="check" size={12} />
                      )}
                      {tool}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="onboarding-question">
                <span>Food preferences</span>
                <div className="onboarding-chips">
                  {[
                    "Quick & easy",
                    "Vegetarian",
                    "High-protein",
                    "Mediterranean",
                    "Comfort food",
                    "Plant-forward",
                  ].map((preference) => (
                    <Button
                      type="button"
                      variant="ghost"
                      className={
                        onboarding.preferences.includes(preference)
                          ? "selected"
                          : ""
                      }
                      onClick={() => togglePreference(preference)}
                      key={preference}
                    >
                      {onboarding.preferences.includes(preference) && (
                        <Icon name="check" size={12} />
                      )}
                      {preference}
                    </Button>
                  ))}
                </div>
              </div>
              <label className="onboarding-field">
                <span>Foods to avoid</span>
                <input
                  value={onboarding.excludedFoods}
                  onChange={(e) =>
                    setOnboarding({ ...onboarding, excludedFoods: e.target.value })
                  }
                  placeholder="e.g. peanuts, mushrooms, shellfish"
                />
                <small>Separate multiple foods with commas.</small>
              </label>
            </div>
          )}

          {onboardingStep === 3 && (
            <div className="onboarding-step">
              <span className="auth-icon">
                <Icon name="sparkle" size={22} />
              </span>
              <span className="eyebrow">SET A MONTHLY GOAL</span>
              <h1>How much food will you save?</h1>
              <p>Start with a realistic target. Every ingredient used before it spoils counts.</p>
              <div className="goal-options">
                {[
                  {
                    id: "low",
                    name: "A gentle start",
                    kg: 3,
                    description: "A few ingredients each week",
                  },
                  {
                    id: "medium",
                    name: "Build a habit",
                    kg: 6,
                    description: "A balanced monthly target",
                  },
                  {
                    id: "high",
                    name: "Waste less champion",
                    kg: 10,
                    description: "For a busy, stocked kitchen",
                  },
                ].map((goal) => (
                  <Button
                    type="button"
                    variant="ghost"
                    className={onboarding.goal === goal.id ? "selected" : ""}
                    onClick={() =>
                      setOnboarding({ ...onboarding, goal: goal.id })
                    }
                    key={goal.id}
                  >
                    <span className="goal-check">
                      <Icon name="check" size={13} />
                    </span>
                    <span>
                      <strong>{goal.name}</strong>
                      <small>{goal.description}</small>
                    </span>
                    <b>
                      {onboarding.measurementUnit === "Metric"
                        ? `${goal.kg} kg`
                        : `${Math.round(goal.kg * 2.20462)} lbs`}
                    </b>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="onboarding-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                onboardingStep > 1
                  ? setOnboardingStep((s) => s - 1)
                  : onCancel?.()
              }
            >
              Back
            </Button>
            {onboardingStep < 3 ? (
              <Button
                type="button"
                disabled={onboardingStep === 1 && !onboarding.name.trim()}
                onClick={() => setOnboardingStep((s) => s + 1)}
              >
                Continue <Icon name="arrow" size={16} />
              </Button>
            ) : (
              <Button type="button" onClick={finishOnboarding}>
                Finish setup <Icon name="check" size={16} />
              </Button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
