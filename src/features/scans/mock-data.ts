import { DetectedGrocery } from "./types";

export const initialDetectedGroceries: DetectedGrocery[] = [
  { id: 1, name: "Baby spinach", quantity: "1", unit: "bag", location: "Fridge", expirationDate: "2025-05-26", confidence: 98, icon: "leaf", selected: true },
  { id: 2, name: "Greek yogurt", quantity: "1", unit: "tub", location: "Fridge", expirationDate: "2025-05-29", confidence: 96, icon: "yogurt", selected: true },
  { id: 3, name: "Broccoli", quantity: "2", unit: "head", location: "Fridge", expirationDate: "2025-05-27", confidence: 94, icon: "broccoli", selected: true },
  { id: 4, name: "Chickpeas", quantity: "2", unit: "can", location: "Pantry", expirationDate: "2026-05-19", confidence: 91, icon: "chickpeas", selected: true },
  { id: 5, name: "Green apples", quantity: "4", unit: "item", location: "Counter", expirationDate: "2025-06-01", confidence: 76, icon: "apple", selected: true },
];
