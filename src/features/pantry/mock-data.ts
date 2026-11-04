import { PantryItem, UnitOption, ActivityEvent } from "./types";

export const initialPantryItems: PantryItem[] = [
  { id: 1, name: "Baby spinach", quantity: "1", unit: "bag", location: "Fridge", expirationDate: "2025-05-19", expiry: "Use today", urgency: "critical", icon: "leaf", amount: 82, added: "May 13" },
  { id: 2, name: "Greek yogurt", quantity: "0.75", unit: "tub", location: "Fridge", expirationDate: "2025-05-21", expiry: "2 days left", urgency: "soon", icon: "yogurt", amount: 64, added: "May 12" },
  { id: 3, name: "Broccoli", quantity: "2", unit: "head", location: "Fridge", expirationDate: "2025-05-22", expiry: "3 days left", urgency: "soon", icon: "broccoli", amount: 74, added: "May 16" },
  { id: 4, name: "Chickpeas", quantity: "2", unit: "can", location: "Pantry", expirationDate: "2026-01-19", expiry: "8 months", urgency: "fresh", icon: "chickpeas", amount: 100, added: "May 10" },
  { id: 5, name: "Green apples", quantity: "4", unit: "item", location: "Counter", expirationDate: "2025-05-24", expiry: "5 days left", urgency: "fresh", icon: "apple", amount: 100, added: "May 17" },
  { id: 6, name: "Plain yogurt", quantity: "1", unit: "tub", location: "Fridge", expirationDate: "2025-05-25", expiry: "6 days left", urgency: "fresh", icon: "yogurt", amount: 92, added: "May 18" },
  { id: 7, name: "Kale", quantity: "1", unit: "bunch", location: "Fridge", expirationDate: "2025-05-23", expiry: "4 days left", urgency: "soon", icon: "leaf", amount: 88, added: "May 17" },
  { id: 8, name: "Cannellini beans", quantity: "3", unit: "can", location: "Pantry", expirationDate: "2026-04-19", expiry: "11 months", urgency: "fresh", icon: "chickpeas", amount: 100, added: "Apr 28" },
  { id: 9, name: "Red apples", quantity: "3", unit: "item", location: "Counter", expirationDate: "2025-05-26", expiry: "7 days left", urgency: "fresh", icon: "apple", amount: 75, added: "May 15" },
  { id: 10, name: "Frozen broccoli", quantity: "1", unit: "bag", location: "Freezer", expirationDate: "2025-09-19", expiry: "4 months", urgency: "fresh", icon: "broccoli", amount: 56, added: "Apr 22" },
  { id: 11, name: "Coconut yogurt", quantity: "2", unit: "cup", location: "Fridge", expirationDate: "2025-05-28", expiry: "9 days left", urgency: "fresh", icon: "yogurt", amount: 100, added: "May 18" },
  { id: 12, name: "Arugula", quantity: "0.5", unit: "bag", location: "Fridge", expirationDate: "2025-05-20", expiry: "Use tomorrow", urgency: "critical", icon: "leaf", amount: 46, added: "May 14" },
];

export const unitOptions: UnitOption[] = [
  { value: "item", label: "item(s)" },
  { value: "portion", label: "portion(s)" },
  { value: "bag", label: "bag(s)" },
  { value: "tub", label: "tub(s)" },
  { value: "head", label: "head(s)" },
  { value: "can", label: "can(s)" },
  { value: "bunch", label: "bunch(es)" },
  { value: "cup", label: "cup(s)" },
  { value: "tsp", label: "tsp" },
  { value: "tbsp", label: "tbsp" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "mL", label: "mL" },
  { value: "L", label: "L" },
];

export const initialActivityEvents: ActivityEvent[] = [
  { id: 1, day: "Today", time: "2:14 PM", type: "added", title: "4 groceries added", detail: "Baby spinach, Greek yogurt, Broccoli, Chickpeas", meta: "From grocery photo", quantity: "+4 items" },
  { id: 2, day: "Today", time: "12:32 PM", type: "adjusted", title: "Greek yogurt adjusted", detail: "Quantity changed from 1 tub to ¾ tub", meta: "Manual adjustment", quantity: "−¼ tub" },
  { id: 3, day: "Yesterday", time: "7:18 PM", type: "cooked", title: "Tomato pasta cooked", detail: "Tomatoes, pasta, spinach, garlic, and Parmesan updated", meta: "5 pantry deductions confirmed", quantity: "1 meal" },
  { id: 4, day: "Yesterday", time: "9:06 AM", type: "added", title: "Green apples added", detail: "Added 4 apples to Counter storage", meta: "Added manually", quantity: "+4 items" },
  { id: 5, day: "Saturday", time: "6:42 PM", type: "removed", title: "Milk discarded", detail: "Expired milk removed from the fridge", meta: "Marked as discarded", quantity: "−0.3 L" },
  { id: 6, day: "Saturday", time: "1:20 PM", type: "cooked", title: "Kale & white bean soup cooked", detail: "Kale and cannellini bean quantities updated", meta: "2 pantry deductions confirmed", quantity: "4 servings" },
  { id: 7, day: "Friday", time: "5:10 PM", type: "added", title: "Weekly groceries added", detail: "Kale, yogurt, apples, arugula, and 3 more items", meta: "From 2 grocery photos", quantity: "+7 items" },
  { id: 8, day: "Thursday", time: "8:45 PM", type: "adjusted", title: "Broccoli moved", detail: "Storage changed from Fridge to Freezer", meta: "Manual adjustment", quantity: "1 bag" },
  { id: 9, day: "Wednesday", time: "7:02 PM", type: "cooked", title: "Chickpea stir-fry cooked", detail: "Broccoli, chickpeas, and rice updated", meta: "3 pantry deductions confirmed", quantity: "3 servings" },
  { id: 10, day: "Tuesday", time: "8:30 AM", type: "removed", title: "Bananas consumed", detail: "Three ripe bananas removed from inventory", meta: "Marked as consumed", quantity: "−3 items" },
];
