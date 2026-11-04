export type TimelineStepType = "active" | "passive" | "parallel" | "cleanup";

export interface TimelineStep {
  time: string;
  duration: string;
  title: string;
  detail: string;
  type: TimelineStepType;
}

export interface PantryDeduction {
  ingredient: string;
  quantity: string;
  unit: string;
}
