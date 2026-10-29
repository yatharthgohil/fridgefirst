import { StorageLocation } from "@/features/pantry/types";

export interface UserProfile {
  name: string;
  email: string;
  password?: string;
}

export interface NotificationSettings {
  expiryAlerts: boolean;
  recipeReminders: boolean;
  inventoryUpdates: boolean;
  weeklySummary: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export interface AccountSettings {
  notifications: NotificationSettings;
  alertTiming: string;
  measurementUnit: "Metric" | "US customary";
  defaultStorage: StorageLocation;
}
