import React from "react";

export type FoodArtType = "leaf" | "yogurt" | "broccoli" | "chickpeas" | "apple" | string;

export const foodArtRecord: Record<string, React.ReactNode> = {
  leaf: (
    <>
      <span className="leaf leaf-one" />
      <span className="leaf leaf-two" />
      <span className="stem" />
    </>
  ),
  yogurt: (
    <>
      <span className="yogurt-lid" />
      <span className="yogurt-cup">Y</span>
    </>
  ),
  broccoli: (
    <>
      <span className="broccoli-crown">•••</span>
      <span className="broccoli-stem" />
    </>
  ),
  chickpeas: (
    <>
      <span className="can-top" />
      <span className="can-body">•••</span>
    </>
  ),
  apple: (
    <>
      <span className="apple-fruit" />
      <span className="apple-leaf" />
    </>
  ),
};

export interface FoodArtProps {
  icon: FoodArtType;
  className?: string;
}

export function FoodArt({ icon, className = "food-icon" }: FoodArtProps) {
  const content = foodArtRecord[icon] || foodArtRecord.leaf;
  return <span className={className}>{content}</span>;
}
