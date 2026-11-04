import { StorageLocation } from "@/features/pantry/types";

export interface DetectedGrocery {
  id: number;
  name: string;
  quantity: string;
  unit: string;
  location: StorageLocation;
  expirationDate: string;
  confidence: number;
  icon: string;
  selected: boolean;
}
