"use client";

import React, { useState, useMemo } from "react";
import { Button, Icon } from "@/components";
import { Recipe, RecipePreferences } from "./types";

export interface RecipesViewProps {
  recipes: Recipe[];
  preferences: RecipePreferences;
  onOpenPreferences: () => void;
  onSelectRecipe: (recipeId: number) => void;
  pantryCount?: number;
}

export function RecipesView({
  recipes,
  preferences,
  onOpenPreferences,
  onSelectRecipe,
  pantryCount,
}: RecipesViewProps) {
  const [recipeFilter, setRecipeFilter] = useState("All");
  const isPantryEmpty = pantryCount !== undefined && pantryCount === 0;

  const filteredRecipes = useMemo(() => {
    return recipes.filter((recipe) => {
      if (recipeFilter === "Under 30 min") return recipe.time <= 30;
      if (recipeFilter === "90%+ match") {
        if (isPantryEmpty) return false;
        return recipe.match >= 90;
      }
      if (recipeFilter === "No shopping") {
        if (isPantryEmpty) return false;
        return recipe.missing.length === 0;
      }
      return true;
    });
  }, [recipes, recipeFilter, isPantryEmpty]);

  return (
    <section className="all-recipes">
      <div className="recipes-page-header">
        <div>
          <span className="eyebrow">PANTRY-POWERED</span>
          <h1>Suggested recipes</h1>
          <p>Ranked by what needs using first, what you have, and how much time you’ve got.</p>
        </div>
        <div className="recipe-preferences">
          <span>
            <Icon name="clock" size={16} /> {preferences.minCookTime}–{preferences.maxCookTime} min
          </span>
          <span>
            <Icon name="users" size={16} /> {preferences.minServings}–{preferences.maxServings} servings
          </span>
          <Button variant="secondary" onClick={onOpenPreferences}>
            Edit preferences
          </Button>
        </div>
      </div>

      <div className="recipe-filter-bar">
        <div className="inventory-tabs">
          {["All", "Under 30 min", "90%+ match", "No shopping"].map((name) => (
            <Button
              key={name}
              variant="ghost"
              className={recipeFilter === name ? "selected" : ""}
              onClick={() => setRecipeFilter(name)}
            >
              {name}
            </Button>
          ))}
        </div>
        <span>
          {isPantryEmpty
            ? `${filteredRecipes.length} suggested recipes to explore`
            : `${filteredRecipes.length} recipes ranked for your pantry`}
        </span>
      </div>

      {filteredRecipes.length > 0 ? (
        <div className="recipe-catalog">
          {filteredRecipes.map((recipe, index) => (
            <article
              className={`catalog-card ${index === 0 && recipeFilter === "All" ? "featured" : ""}`}
              key={recipe.id}
            >
              <div className="catalog-image">
                <img src={recipe.image} alt={recipe.name} />
                <span className="catalog-rank">
                  {index === 0 ? (isPantryEmpty ? "FEATURED" : "TOP PICK") : `#${index + 1}`}
                </span>
                <span className="catalog-match">
                  <Icon name="sparkle" size={13} /> {isPantryEmpty ? "Suggested" : `${recipe.match}% match`}
                </span>
              </div>
              <div className="catalog-content">
                <div className="catalog-urgency">{recipe.urgency}</div>
                <h2>{recipe.name}</h2>
                <p>{recipe.description}</p>
                <div className="catalog-uses">
                  <span>USES</span>
                  {recipe.uses.map((ingredient) => (
                    <strong key={ingredient}>{ingredient}</strong>
                  ))}
                </div>
                <div className="catalog-meta">
                  <span>
                    <Icon name="clock" size={16} /> {recipe.time} min
                  </span>
                  <span>
                    <Icon name="users" size={16} /> {recipe.servings} servings
                  </span>
                </div>
                <div className="catalog-footer">
                  <div
                    className={
                      isPantryEmpty
                        ? "missing-items neutral"
                        : recipe.missing.length
                        ? "missing-items"
                        : "all-covered"
                    }
                  >
                    {isPantryEmpty ? (
                      <>
                        <span>Key ingredients</span>
                        <strong>{recipe.uses.join(", ")}</strong>
                      </>
                    ) : recipe.missing.length ? (
                      <>
                        <span>Missing</span>
                        <strong>{recipe.missing.join(", ")}</strong>
                      </>
                    ) : (
                      <>
                        <Icon name="check" size={14} />
                        <strong>You have everything</strong>
                      </>
                    )}
                  </div>
                  <Button onClick={() => onSelectRecipe(recipe.id)}>
                    View recipe <Icon name="arrow" size={16} />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="recipe-empty">
          <span>
            <Icon name="recipes" size={24} />
          </span>
          <h2>
            {isPantryEmpty && (recipeFilter === "90%+ match" || recipeFilter === "No shopping")
              ? "Your pantry is empty"
              : "No recipes match those filters"}
          </h2>
          <p>
            {isPantryEmpty && (recipeFilter === "90%+ match" || recipeFilter === "No shopping")
              ? "Add items to your pantry to calculate pantry matches and find meals you can make without shopping."
              : "Try widening your time or pantry-match filters."}
          </p>
          <Button variant="secondary" onClick={() => setRecipeFilter("All")}>
            {isPantryEmpty && (recipeFilter === "90%+ match" || recipeFilter === "No shopping")
              ? "Show all recipes"
              : "Clear filters"}
          </Button>
        </div>
      )}
    </section>
  );
}
