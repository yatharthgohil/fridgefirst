"use client";

import React, { useState } from "react";
import { Modal, Button, Icon } from "@/components";
import { SmartTimeline, CookingStatusBar, defaultSmartTimeline } from "@/features/cooking";
import { Recipe } from "./types";
import { recipeStepsRecord } from "./mock-data";

export interface RecipeDetailModalProps {
  recipe: Recipe | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkCooked?: () => void;
}

export function RecipeDetailModal({
  recipe,
  isOpen,
  onClose,
  onMarkCooked,
}: RecipeDetailModalProps) {
  const [cookingStarted, setCookingStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  if (!recipe) return null;

  const steps = recipeStepsRecord[recipe.id] || recipeStepsRecord[1];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="recipe-detail-modal"
      backdropClassName="recipe-backdrop"
      titleId="recipe-detail-title"
    >
      <header className="recipe-detail-header">
        <div className="recipe-detail-photo">
          <img src={recipe.image} alt="" />
        </div>
        <div className="recipe-detail-heading">
          <span className="recipe-detail-kicker">
            <Icon name="sparkle" size={14} /> {recipe.match}% pantry match
          </span>
          <h2 id="recipe-detail-title">{recipe.name}</h2>
          <p>{recipe.description}</p>
          <div className="recipe-detail-meta">
            <span>
              <Icon name="clock" size={16} /> {recipe.time} min total
            </span>
            <span>
              <Icon name="users" size={16} /> {recipe.servings} servings
            </span>
            <span>
              {recipe.missing.length
                ? `${recipe.missing.length} item missing`
                : "No shopping needed"}
            </span>
          </div>
        </div>
        <Button
          variant="icon"
          className="recipe-detail-close"
          onClick={onClose}
          aria-label="Close recipe"
        >
          <Icon name="close" />
        </Button>
      </header>

      {cookingStarted && (
        <CookingStatusBar
          currentStep={1}
          totalSteps={defaultSmartTimeline.length}
          stepTitle="Prep ingredients"
          isPaused={isPaused}
          onTogglePause={() => setIsPaused(!isPaused)}
        />
      )}

      <div className="recipe-detail-scroll">
        <div className="recipe-detail-grid">
          <aside className="ingredients-panel">
            <div className="detail-section-title">
              <span>INGREDIENTS</span>
              <strong>For {recipe.servings}</strong>
            </div>
            <div className="ingredient-list">
              {recipe.uses.map((ingredient, index) => (
                <label key={ingredient}>
                  <input type="checkbox" defaultChecked />
                  <span>
                    <Icon name="check" size={12} />
                  </span>
                  <div>
                    <strong>{ingredient}</strong>
                    <small>
                      {["1 generous portion", "2 cups", "1 cup"][index] || "As needed"}
                    </small>
                  </div>
                </label>
              ))}
              {["Olive oil", "Garlic", "Lemon", "Salt & pepper"].map((ingredient) => (
                <label key={ingredient}>
                  <input type="checkbox" defaultChecked />
                  <span>
                    <Icon name="check" size={12} />
                  </span>
                  <div>
                    <strong>{ingredient}</strong>
                    <small>Pantry staple</small>
                  </div>
                </label>
              ))}
              {recipe.missing.map((ingredient) => (
                <label className="ingredient-missing" key={ingredient}>
                  <input type="checkbox" />
                  <span>
                    <Icon name="plus" size={12} />
                  </span>
                  <div>
                    <strong>{ingredient}</strong>
                    <small>Missing · Add to list</small>
                  </div>
                </label>
              ))}
            </div>
            <div className="equipment-box">
              <span>EQUIPMENT</span>
              <p>Large tray, blender, chef’s knife, cutting board</p>
            </div>
          </aside>

          <div className="plan-content">
            <SmartTimeline
              timeline={defaultSmartTimeline}
              cookingStarted={cookingStarted}
              timeSavedMinutes={9}
            />

            <section className="numbered-instructions">
              <div className="detail-section-title">
                <span>STEP-BY-STEP</span>
                <strong>{steps.length} steps</strong>
              </div>
              {steps.map((step, index) => (
                <article key={step}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>
                      {["Get ready", "Cook", "Build flavor", "Finish & serve"][index] || "Step"}
                    </strong>
                    <p>{step}</p>
                  </div>
                </article>
              ))}
            </section>
          </div>
        </div>
      </div>

      <footer className="recipe-detail-footer">
        <span>
          {cookingStarted
            ? "Your progress is saved automatically"
            : "The smart plan adjusts timers as you cook"}
        </span>
        <div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {cookingStarted ? (
            <Button onClick={onMarkCooked}>
              <Icon name="check" size={17} /> Mark as cooked
            </Button>
          ) : (
            <Button onClick={() => setCookingStarted(true)}>
              Start smart plan <Icon name="arrow" size={17} />
            </Button>
          )}
        </div>
      </footer>
    </Modal>
  );
}
