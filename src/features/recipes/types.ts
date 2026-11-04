export interface Recipe {
  id: number;
  name: string;
  description: string;
  time: number;
  match: number;
  servings: number;
  uses: string[];
  missing: string[];
  urgency: string;
  image: string;
}

export interface RecipePreferences {
  minCookTime: number;
  maxCookTime: number;
  minServings: number;
  maxServings: number;
  preferredFoods: string[];
  dietaryNeeds: string[];
  excludedFoods: string[];
  availableEquipment: string[];
}
