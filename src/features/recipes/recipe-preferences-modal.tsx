"use client";

import React, { useState } from "react";
import { Modal, Button, Icon } from "@/components";
import { RecipePreferences } from "./types";
import { defaultRecipePreferences } from "./mock-data";

export interface RecipePreferencesModalProps {
  isOpen: boolean;
  preferences: RecipePreferences;
  onClose: () => void;
  onSave: (preferences: RecipePreferences) => void;
}

export function RecipePreferencesModal({
  isOpen,
  preferences: initialPreferences,
  onClose,
  onSave,
}: RecipePreferencesModalProps) {
  const [preferences, setPreferences] = useState<RecipePreferences>({ ...initialPreferences });
  const [excludeInput, setExcludeInput] = useState("");

  const toggleArrayItem = (key: "preferredFoods" | "dietaryNeeds" | "availableEquipment", item: string) => {
    setPreferences((prev) => {
      const current = prev[key];
      const next = current.includes(item)
        ? current.filter((x) => x !== item)
        : [...current, item];
      return { ...prev, [key]: next };
    });
  };

  const addExcludedFood = () => {
    const trimmed = excludeInput.trim();
    if (!trimmed) return;
    if (!preferences.excludedFoods.includes(trimmed)) {
      setPreferences((prev) => ({
        ...prev,
        excludedFoods: [...prev.excludedFoods, trimmed],
      }));
    }
    setExcludeInput("");
  };

  const removeExcludedFood = (food: string) => {
    setPreferences((prev) => ({
      ...prev,
      excludedFoods: prev.excludedFoods.filter((f) => f !== food),
    }));
  };

  const handleReset = () => {
    setPreferences({ ...defaultRecipePreferences });
  };

  const handleSave = () => {
    onSave(preferences);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="preferences-modal"
      titleId="preferences-title"
    >
      <header className="preferences-header">
        <div>
          <span className="review-step">
            <Icon name="settings" size={15} /> Recipe profile
          </span>
          <h2 id="preferences-title">Edit cooking preferences</h2>
          <p>We’ll use these preferences when ranking recipes for your pantry.</p>
        </div>
        <Button variant="icon" onClick={onClose} aria-label="Close preferences">
          <Icon name="close" />
        </Button>
      </header>

      <div className="preferences-scroll">
        <section className="preference-section">
          <div className="preference-section-heading">
            <span className="preference-icon">
              <Icon name="clock" size={18} />
            </span>
            <div>
              <strong>Cooking time range</strong>
              <p>Only suggest recipes that fit the time you usually have.</p>
            </div>
          </div>
          <div className="range-fields">
            <label>
              <span>Minimum</span>
              <select
                value={preferences.minCookTime}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    minCookTime: Math.min(Number(e.target.value), prev.maxCookTime),
                  }))
                }
              >
                {[5, 10, 15, 20, 30].map((val) => (
                  <option value={val} key={val}>
                    {val} min
                  </option>
                ))}
              </select>
            </label>
            <span>to</span>
            <label>
              <span>Maximum</span>
              <select
                value={preferences.maxCookTime}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    maxCookTime: Math.max(Number(e.target.value), prev.minCookTime),
                  }))
                }
              >
                {[20, 30, 45, 60, 90].map((val) => (
                  <option value={val} key={val}>
                    {val} min
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="preference-section">
          <div className="preference-section-heading">
            <span className="preference-icon">
              <Icon name="users" size={18} />
            </span>
            <div>
              <strong>Serving size range</strong>
              <p>Recipes can still be scaled before you start cooking.</p>
            </div>
          </div>
          <div className="range-fields">
            <label>
              <span>Minimum</span>
              <select
                value={preferences.minServings}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    minServings: Math.min(Number(e.target.value), prev.maxServings),
                  }))
                }
              >
                {[1, 2, 3, 4].map((val) => (
                  <option value={val} key={val}>
                    {val} {val === 1 ? "serving" : "servings"}
                  </option>
                ))}
              </select>
            </label>
            <span>to</span>
            <label>
              <span>Maximum</span>
              <select
                value={preferences.maxServings}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    maxServings: Math.max(Number(e.target.value), prev.minServings),
                  }))
                }
              >
                {[2, 4, 6, 8].map((val) => (
                  <option value={val} key={val}>
                    {val} servings
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="preference-section preference-wide">
          <div className="preference-section-heading">
            <span className="preference-icon">
              <Icon name="recipes" size={18} />
            </span>
            <div>
              <strong>Preferred types of food</strong>
              <p>Choose as many as you like. These improve ranking, but don’t hide other matches.</p>
            </div>
          </div>
          <div className="preference-chips">
            {[
              "Quick & easy",
              "Mediterranean",
              "Asian-inspired",
              "Comfort food",
              "Soups & stews",
              "Bowls",
              "Breakfast",
            ].map((value) => (
              <Button
                key={value}
                variant="ghost"
                className={preferences.preferredFoods.includes(value) ? "selected" : ""}
                onClick={() => toggleArrayItem("preferredFoods", value)}
              >
                {preferences.preferredFoods.includes(value) && (
                  <Icon name="check" size={13} />
                )}
                {value}
              </Button>
            ))}
          </div>
        </section>

        <section className="preference-section preference-wide">
          <div className="preference-section-heading">
            <span className="preference-icon">
              <Icon name="sparkle" size={18} />
            </span>
            <div>
              <strong>Dietary needs</strong>
              <p>Recipes that don’t meet selected needs will be excluded.</p>
            </div>
          </div>
          <div className="preference-chips">
            {[
              "Vegetarian",
              "Vegan",
              "Gluten-free",
              "Dairy-free",
              "High-protein",
              "Low-sodium",
            ].map((value) => (
              <Button
                key={value}
                variant="ghost"
                className={preferences.dietaryNeeds.includes(value) ? "selected" : ""}
                onClick={() => toggleArrayItem("dietaryNeeds", value)}
              >
                {preferences.dietaryNeeds.includes(value) && (
                  <Icon name="check" size={13} />
                )}
                {value}
              </Button>
            ))}
          </div>
        </section>

        <section className="preference-section preference-wide">
          <div className="preference-section-heading">
            <span className="preference-icon exclude">
              <Icon name="minus" size={18} />
            </span>
            <div>
              <strong>Foods to exclude</strong>
              <p>Add allergies, intolerances, or ingredients you simply don’t enjoy.</p>
            </div>
          </div>
          <div className="exclusion-input">
            <input
              value={excludeInput}
              onChange={(e) => setExcludeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addExcludedFood();
                }
              }}
              placeholder="e.g. shellfish, cilantro"
            />
            <Button variant="secondary" onClick={addExcludedFood}>
              Add
            </Button>
          </div>
          <div className="exclusion-tags">
            {preferences.excludedFoods.map((food) => (
              <span key={food}>
                {food}
                <Button
                  variant="ghost"
                  onClick={() => removeExcludedFood(food)}
                  aria-label={`Remove ${food}`}
                >
                  <Icon name="close" size={12} />
                </Button>
              </span>
            ))}
          </div>
        </section>

        <section className="preference-section preference-wide">
          <div className="preference-section-heading">
            <span className="preference-icon">
              <Icon name="settings" size={18} />
            </span>
            <div>
              <strong>Available equipment</strong>
              <p>We won’t suggest recipes that require equipment you don’t have.</p>
            </div>
          </div>
          <div className="preference-chips">
            {["Oven", "Stovetop", "Microwave", "Air fryer", "Blender", "Slow cooker"].map(
              (value) => (
                <Button
                  key={value}
                  variant="ghost"
                  className={preferences.availableEquipment.includes(value) ? "selected" : ""}
                  onClick={() => toggleArrayItem("availableEquipment", value)}
                >
                  {preferences.availableEquipment.includes(value) && (
                    <Icon name="check" size={13} />
                  )}
                  {value}
                </Button>
              )
            )}
          </div>
        </section>
      </div>

      <footer className="preferences-footer">
        <Button variant="ghost" onClick={handleReset}>
          Reset defaults
        </Button>
        <div>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save preferences</Button>
        </div>
      </footer>
    </Modal>
  );
}
