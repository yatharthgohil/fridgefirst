"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileNav } from "./MobileNav";
import { Icon } from "./Icon";

import {
  PantryView,
  OverviewView,
  ActivityView,
  PantryFormModal,
  PantryDeleteModal,
  createFixturePantryApi,
  createHttpPantryApi,
  FixturePantryApi,
  contractToUiItem,
  PantryItem,
  initialPantryItems,
  initialActivityEvents,
  ActivityEvent,
  calculateExpirationMeta,
  InventoryAdjustControls,
  RecentActivityPanel,
  createFixtureInventoryApi,
  createHttpInventoryApi,
  toFixtureItem,
  withUpdatedQuantity,
  historyEntryToActivityEvent,
  formatDelta,
  operationLabel,
  ExpirationStatus,
  PantryFilterBar,
  PantryNoMatches,
  usePantryFilters,
  DEFAULT_PANTRY_FILTERS,
  type PantryFilterState,
  getExpirationInfo,
  withFixtureExpiration,
  applyFixtureExpirationEdit,
  expirationFixtureItems,
  PantryApi,
  PantryApiError,
  InventoryApi,
} from "@/features/pantry";
import type { InventoryAdjustmentResponse } from "@/contracts/inventory";
import type { PantryCreateRequest, PantryUpdateRequest } from "@/contracts/pantry";

import {
  RecipesView,
  RecipeDetailModal,
  RecipePreferencesModal,
  RecipePreferences,
  suggestedRecipes,
  defaultRecipePreferences,
} from "@/features/recipes";

import {
  DeductionsModal,
  PantryDeduction,
} from "@/features/cooking";

import {
  ScanUploadModal,
  ScanReviewModal,
  DetectedGrocery,
  initialDetectedGroceries,
} from "@/features/scans";

import {
  AccountSettingsModal,
  ProfileEditModal,
  UserProfile,
  OnboardingWizard,
  type OnboardingData,
} from "@/features/account";

// Fixture stand-in for items loaded from the API with expiration metadata attached.
const initialItems: PantryItem[] = [...initialPantryItems, ...expirationFixtureItems].map((item) =>
  withFixtureExpiration(item)
);

function getEventTimestamp(event: ActivityEvent): number {
  if (typeof event.timestamp === "number" && !Number.isNaN(event.timestamp)) {
    return event.timestamp;
  }
  if (typeof event.id === "number") {
    return event.id;
  }
  const parsed = Date.parse(String(event.id));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function mergeActivityEvents(apiEvents: ActivityEvent[], localEvents: ActivityEvent[]): ActivityEvent[] {
  const seenIds = new Set(apiEvents.map((e) => String(e.id)));
  const seenTitles = new Set(apiEvents.map((e) => `${e.title.toLowerCase()}|${e.type}`));
  const uniqueLocal = localEvents.filter(
    (e) => !seenIds.has(String(e.id)) && !seenTitles.has(`${e.title.toLowerCase()}|${e.type}`)
  );
  return [...apiEvents, ...uniqueLocal].sort((a, b) => {
    const diff = getEventTimestamp(b) - getEventTimestamp(a);
    if (diff !== 0) return diff;
    return String(b.id).localeCompare(String(a.id));
  });
}


export interface AppShellProps {
  initialUser?: UserProfile;
  onSignOut?: () => void;
  initialPantryItems?: PantryItem[] | null;
  initialPantryError?: string | null;
  pantryApi?: PantryApi;
  inventoryApi?: InventoryApi;
}

export function AppShell({
  initialUser = { name: "Alex Johnson", email: "alex@example.com" },
  onSignOut,
  initialPantryItems,
  initialPantryError,
  pantryApi: injectedPantryApi,
  inventoryApi: injectedInventoryApi,
}: AppShellProps) {
  // Navigation & search state
  const router = useRouter();
  const [activeNav, setActiveNav] = useState("Overview");
  const [query, setQuery] = useState("");

  // Core data states
  const [items, setItems] = useState<PantryItem[]>(() => {
    if (initialPantryItems !== undefined && initialPantryItems !== null) {
      return initialPantryItems;
    }
    if (Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
      return [];
    }
    return initialItems;
  });
  const [activity, setActivity] = useState<ActivityEvent[]>(() => {
    if (initialPantryItems !== undefined || Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
      return [];
    }
    return initialActivityEvents;
  });
  const [notes, setNotes] = useState<Record<string | number, string>>({});
  const [user, setUser] = useState<UserProfile>(initialUser);
  const [preferences, setPreferences] = useState<RecipePreferences>(defaultRecipePreferences);
  const [monthlyGoalKg, setMonthlyGoalKg] = useState<number>(5.0);

  // Loading, error, and session states
  const [loadError, setLoadError] = useState<string | null>(initialPantryError ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(
    () => initialPantryItems === undefined && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
  const [isUnauthorized, setIsUnauthorized] = useState<boolean>(() => {
    return Boolean(initialPantryError && initialPantryError.toLowerCase().includes("session"));
  });

  // Modal open states
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [detectedGroceriesState] = useState<DetectedGrocery[]>(initialDetectedGroceries);

  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PantryItem | null>(null);

  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [showDeductions, setShowDeductions] = useState(false);
  const [deductions, setDeductions] = useState<PantryDeduction[]>([]);

  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<UserProfile | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [forceShowOnboarding, setForceShowOnboarding] = useState(false);

  const showOnboarding =
    forceShowOnboarding ||
    (isMounted &&
      !onboardingDismissed &&
      Boolean(initialUser?.email) &&
      (typeof window !== "undefined"
        ? !localStorage.getItem(`ff_onboarded_${initialUser?.email || "anonymous"}`)
        : false));

  // Pantry CRUD API: uses HTTP endpoints when connected to Supabase, in-memory fixtures otherwise.
  const [pantryApi] = useState<PantryApi>(() => {
    if (injectedPantryApi) return injectedPantryApi;
    return typeof window !== "undefined" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
      ? createHttpPantryApi()
      : createFixturePantryApi({ items: initialPantryItems ?? initialItems });
  });

  // Inventory API for consume/discard + history. Uses HTTP endpoints when connected to Supabase.
  const [inventoryApi] = useState<InventoryApi>(() => {
    if (injectedInventoryApi) return injectedInventoryApi;
    return typeof window !== "undefined" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
      ? createHttpInventoryApi()
      : createFixtureInventoryApi({ items: (initialPantryItems ?? initialItems).map(toFixtureItem) });
  });
  const [activityRefresh, setActivityRefresh] = useState(0);

  // Retry / reload action for request failures or expired sessions
  const handleRetryLoad = async () => {
    setIsLoading(true);
    setLoadError(null);
    setIsUnauthorized(false);
    try {
      const res = await pantryApi.list();
      const activeItems = res.items
        .filter((item) => (item.status === undefined || item.status === "active") && item.quantity > 0)
        .map(contractToUiItem);
      setItems(activeItems);
    } catch (err) {
      if (err instanceof PantryApiError && err.code === "unauthorized") {
        setIsUnauthorized(true);
        setLoadError(err.message || "Your session has expired. Please sign in again.");
      } else {
        setLoadError(err instanceof Error ? err.message : "Failed to load pantry items. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // When live database is connected and items weren't preloaded by SSR, load real items from GET /api/pantry
  useEffect(() => {
    if (initialPantryItems !== undefined) return;
    let cancelled = false;
    if (typeof window !== "undefined" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
      pantryApi
        .list()
        .then((res) => {
          if (!cancelled && res.items) {
            const activeItems = res.items
              .filter((item) => (item.status === undefined || item.status === "active") && item.quantity > 0)
              .map(contractToUiItem);
            setItems(activeItems);
            setLoadError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            if (err instanceof PantryApiError && err.code === "unauthorized") {
              setIsUnauthorized(true);
              setLoadError(err.message || "Your session has expired. Please sign in again.");
            } else {
              setLoadError(err instanceof Error ? err.message : "Failed to load pantry items.");
            }
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [pantryApi, initialPantryItems]);

  // Fixture only: mirror mock add/edit/delete into inventory history and pantry store.
  useEffect(() => {
    if ("syncItems" in inventoryApi) {
      (inventoryApi as unknown as { syncItems: (items: ReturnType<typeof toFixtureItem>[]) => void }).syncItems(
        items.map(toFixtureItem)
      );
    }
    if ("syncItems" in pantryApi) {
      (pantryApi as FixturePantryApi).syncItems(items);
    }
  }, [inventoryApi, pantryApi, items]);

  // Toast notice
  const [notice, setNotice] = useState<string | null>(null);

  const flashNotice = (msg: string) => {
    setNotice(msg);
  };

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Restore client-stored preferences, goal, onboarded status, and activity after hydration
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsMounted(true);
      const email = initialUser?.email;
      if (!email || typeof window === "undefined") return;
      try {
        const saved = localStorage.getItem(`ff_settings_${email}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.monthlyGoalKg && typeof parsed.monthlyGoalKg === "number") {
            setMonthlyGoalKg(parsed.monthlyGoalKg);
          }
          if (parsed.name && typeof parsed.name === "string" && parsed.name.trim()) {
            setUser((prev) => ({ ...prev, name: parsed.name.trim() }));
          }
          if (parsed.equipment || parsed.preferences || parsed.excludedFoods) {
            setPreferences((prev) => ({
              ...prev,
              availableEquipment: parsed.equipment || prev.availableEquipment,
              dietaryNeeds: parsed.preferences || prev.dietaryNeeds,
              excludedFoods: parsed.excludedFoods || prev.excludedFoods,
            }));
          }
        }
        const cachedActivity = localStorage.getItem(`ff_activity_${email}`);
        if (cachedActivity) {
          const parsedActivity = JSON.parse(cachedActivity);
          if (Array.isArray(parsedActivity) && parsedActivity.length > 0) {
            setActivity(parsedActivity);
          }
        }
      } catch {
        // Ignore corrupt JSON in localStorage
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [initialUser?.email]);

  // Sync persisted inventory history from the API into activity state
  useEffect(() => {
    let cancelled = false;
    inventoryApi
      .listHistory({ limit: 50 })
      .then((entries) => {
        if (cancelled) return;
        const apiEvents = entries.map((entry) => historyEntryToActivityEvent(entry));
        setActivity((curr) => {
          const merged = mergeActivityEvents(apiEvents, curr);
          const email = user?.email || initialUser?.email;
          if (email && typeof window !== "undefined") {
            try {
              localStorage.setItem(`ff_activity_${email}`, JSON.stringify(merged));
            } catch {}
          }
          return merged;
        });
      })
      .catch(() => {
        // Fallback to local activity on network error
      });
    return () => {
      cancelled = true;
    };
  }, [inventoryApi, activityRefresh, user?.email, initialUser?.email]);

  // Persist local activity events to storage on change
  useEffect(() => {
    if (!isMounted) return;
    const email = user?.email || initialUser?.email;
    if (!email || typeof window === "undefined") return;
    try {
      localStorage.setItem(`ff_activity_${email}`, JSON.stringify(activity));
    } catch {}
  }, [activity, isMounted, user?.email, initialUser?.email]);

  const handleOnboardingComplete = (data: OnboardingData) => {
    const updatedUser = {
      ...user,
      name: data.name || user.name,
    };
    setUser(updatedUser);
    if (data.monthlyGoalKg) {
      setMonthlyGoalKg(data.monthlyGoalKg);
    }
    setPreferences((prev) => ({
      ...prev,
      availableEquipment: data.equipment,
      dietaryNeeds: data.preferences,
      excludedFoods: data.excludedFoods,
    }));
    const email = user?.email || "anonymous";
    localStorage.setItem(`ff_onboarded_${email}`, "true");
    localStorage.setItem(
      `ff_settings_${email}`,
      JSON.stringify({
        name: data.name,
        monthlyGoalKg: data.monthlyGoalKg,
        measurementUnit: data.measurementUnit,
        equipment: data.equipment,
        preferences: data.preferences,
        excludedFoods: data.excludedFoods,
      })
    );
    setOnboardingDismissed(true);
    setForceShowOnboarding(false);
    flashNotice(`Welcome to FridgeFirst, ${data.name || "friend"}!`);
  };

  const handleOnboardingCancel = () => {
    const email = user?.email || "anonymous";
    localStorage.setItem(`ff_onboarded_${email}`, "true");
    setOnboardingDismissed(true);
    setForceShowOnboarding(false);
  };

  // Selected recipe object
  const selectedRecipe = suggestedRecipes.find((r) => r.id === selectedRecipeId) || null;

  // Pantry list filters/sort (kept here so they persist across navigation).
  const pantryFilters = usePantryFilters(items);

  // Search & filter synchronization
  const handleSearchChange = (newQuery: string) => {
    setQuery(newQuery);
    pantryFilters.setFilters((prev) => ({ ...prev, query: newQuery }));
  };

  const handlePantryFiltersChange = (nextFilters: PantryFilterState) => {
    if (nextFilters.query !== query) {
      setQuery(nextFilters.query);
    }
    pantryFilters.setFilters(nextFilters);
  };

  const handlePantryFiltersClear = () => {
    setQuery("");
    pantryFilters.clear();
  };

  const handleTopbarSubmitSearch = () => {
    if (activeNav !== "My pantry") {
      setActiveNav("My pantry");
    }
  };

  const handleNavigateToItem = (item: PantryItem) => {
    setActiveNav("My pantry");
    pantryFilters.setFilters({
      ...DEFAULT_PANTRY_FILTERS,
      query: item.name,
      sort: pantryFilters.filters.sort,
    });
    setQuery(item.name);
    flashNotice(`Showing ${item.name} in pantry`);
  };

  const renderExpiration = (item: PantryItem) => (
    <ExpirationStatus item={item} info={getExpirationInfo(item)} onEditItem={setEditingItem} />
  );

  // Handlers
  const handleInventoryAdjusted = (result: InventoryAdjustmentResponse) => {
    // Server-confirmed quantity is authoritative.
    const isDepleted = result.item.quantity <= 0;
    if (isDepleted) {
      // If the item was consumed or discarded completely, remove it from the active pantry list.
      setItems((curr) => curr.filter((item) => String(item.id) !== result.item.id));
      setNotes((prev) => {
        const copy = { ...prev };
        delete copy[result.item.id];
        return copy;
      });
    } else {
      // Otherwise update displayed quantity and synchronize version with the server
      setItems((curr) =>
        curr.map((item) => {
          if (String(item.id) !== result.item.id) return item;
          const updated = withUpdatedQuantity(item, result.item.quantity);
          return {
            ...updated,
            version: (item.version ?? 1) + 1,
          };
        })
      );
    }
    if (!result.replayed) {
      setActivity((curr) => [historyEntryToActivityEvent(result.entry), ...curr]);
    }
    setActivityRefresh((n) => n + 1);
    flashNotice(
      `${result.entry.itemName}: ${operationLabel(result.entry.operation).toLowerCase()} ${formatDelta(
        result.entry.quantityDelta,
        result.entry.unit
      ).replace(/^[+−]/, "")}`
    );
  };

  const handleAddPantryItem = async (request: PantryCreateRequest) => {
    try {
      const response = await pantryApi.create(request);
      const createdItem = contractToUiItem(response.item);
      setItems((curr) => [createdItem, ...curr]);
      if (createdItem.notes) {
        setNotes((prev) => ({ ...prev, [createdItem.id]: createdItem.notes! }));
      }
      const now = Date.now();
      setActivity((curr) => [
        {
          id: now,
          timestamp: now,
          day: "Today",
          time: "Just now",
          type: "added",
          title: `${createdItem.name} added`,
          detail: `Added to ${createdItem.location}`,
          meta: "Manual entry",
          quantity: formatDelta(Number(createdItem.quantity), createdItem.unit),
        },
        ...curr,
      ]);
      setActivityRefresh((n) => n + 1);
      flashNotice(`${createdItem.name} added to pantry`);
    } catch (err) {
      if (err instanceof PantryApiError && err.code === "unauthorized") {
        setIsUnauthorized(true);
        setLoadError(err.message || "Your session has expired. Please sign in again.");
      }
      throw err;
    }
  };

  const handleEditPantryItem = async (itemId: string, request: PantryUpdateRequest) => {
    try {
      const target = items.find((i) => String(i.id) === itemId);
      const response = await pantryApi.update(itemId, request);
      const updatedContract = response.item;
      setItems((curr) =>
        curr.map((item) => {
          if (String(item.id) !== itemId) return item;
          const converted = contractToUiItem(updatedContract);
          return {
            ...item,
            ...converted,
            id: item.id,
            icon: item.icon || converted.icon,
          };
        })
      );
      if (updatedContract.notes !== undefined) {
        setNotes((prev) => ({ ...prev, [itemId]: updatedContract.notes || "" }));
      }

      const quantityChanged = request.changes.quantity !== undefined && target && String(request.changes.quantity) !== String(target.quantity);
      const locationChanged = request.changes.storageLocation !== undefined && target && request.changes.storageLocation !== target.location;

      let detail = "Details updated in pantry";
      if (quantityChanged && locationChanged && target) {
        detail = `Quantity changed from ${target.quantity} ${target.unit} to ${updatedContract.quantity} ${updatedContract.unit} and moved to ${updatedContract.storageLocation}`;
      } else if (quantityChanged && target) {
        detail = `Quantity changed from ${target.quantity} ${target.unit} to ${updatedContract.quantity} ${updatedContract.unit}`;
      } else if (locationChanged && target) {
        detail = `Storage changed from ${target.location} to ${updatedContract.storageLocation}`;
      }

      const now = Date.now();
      setActivity((curr) => [
        {
          id: now,
          timestamp: now,
          day: "Today",
          time: "Just now",
          type: "adjusted",
          title: `${updatedContract.name} adjusted`,
          detail,
          meta: "Manual adjustment",
          quantity: `${updatedContract.quantity} ${updatedContract.unit}`,
        },
        ...curr,
      ]);

      setActivityRefresh((n) => n + 1);
      flashNotice(`${updatedContract.name} updated`);
    } catch (err) {
      if (err instanceof PantryApiError && err.code === "unauthorized") {
        setIsUnauthorized(true);
        setLoadError(err.message || "Your session has expired. Please sign in again.");
      }
      throw err;
    }
  };

  const handleDeletePantryItem = async (itemId: string, expectedVersion: number) => {
    try {
      await pantryApi.delete(itemId, { expectedVersion });
      const target = items.find((i) => String(i.id) === itemId);
      setItems((curr) => curr.filter((item) => String(item.id) !== itemId));
      setNotes((prev) => {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      });
      if (target) {
        const now = Date.now();
        setActivity((curr) => [
          {
            id: now,
            timestamp: now,
            day: "Today",
            time: "Just now",
            type: "removed",
            title: `${target.name} removed`,
            detail: `Removed from ${target.location}`,
            meta: "Manual adjustment",
            quantity: formatDelta(-Number(target.quantity), target.unit),
          },
          ...curr,
        ]);
      }
      setActivityRefresh((n) => n + 1);
      flashNotice(`${target?.name || "Item"} removed from pantry`);
    } catch (err) {
      if (err instanceof PantryApiError && err.code === "unauthorized") {
        setIsUnauthorized(true);
        setLoadError(err.message || "Your session has expired. Please sign in again.");
      }
      throw err;
    }
  };

  const _handleSavePantryItem = (updated: PantryItem) => {
    const meta = calculateExpirationMeta(updated.expirationDate);
    setItems((curr) =>
      curr.map((item) =>
        item.id === updated.id
          ? applyFixtureExpirationEdit(item, { ...updated, expiry: meta.expiry, urgency: meta.urgency })
          : item
      )
    );
    setActivityRefresh((n) => n + 1);
    flashNotice(`${updated.name} updated`);
  };
  void _handleSavePantryItem;

  const _handleRemovePantryItem = (itemToRemove: PantryItem) => {
    setItems((curr) => curr.filter((item) => item.id !== itemToRemove.id));
    setActivity((curr) => [
      {
        id: Date.now(),
        day: "Today",
        time: "Just now",
        type: "removed",
        title: `${itemToRemove.name} removed`,
        detail: `Removed from ${itemToRemove.location}`,
        meta: "Manual adjustment",
        quantity: `−${itemToRemove.quantity} ${itemToRemove.unit}`,
      },
      ...curr,
    ]);
    setActivityRefresh((n) => n + 1);
    flashNotice(`${itemToRemove.name} removed from pantry`);
  };
  void _handleRemovePantryItem;

  const handleUpdateNote = (id: string | number, text: string) => {
    setNotes((prev) => ({ ...prev, [id]: text }));
    setItems((curr) =>
      curr.map((item) =>
        String(item.id) === String(id) ? { ...item, notes: text } : item
      )
    );
  };

  const handleSaveNote = async (id: string | number, text: string) => {
    const target = items.find((i) => String(i.id) === String(id));
    if (!target) return;

    const previousNote = notes[id] !== undefined ? notes[id] : (target.notes ?? target.note ?? "");
    if (text.trim() === (previousNote || "").trim()) {
      return;
    }

    try {
      const response = await pantryApi.update(String(id), {
        expectedVersion: target.version ?? 1,
        changes: { notes: text },
      });
      const updatedContract = response.item;
      setItems((curr) =>
        curr.map((item) =>
          String(item.id) === String(id)
            ? { ...item, notes: text, version: updatedContract.version }
            : item
        )
      );
      setNotes((prev) => ({ ...prev, [id]: text }));

      const notePreview = text.trim()
        ? `Note: "${text.trim().slice(0, 45)}${text.trim().length > 45 ? "…" : ""}"`
        : "Note cleared";

      const now = Date.now();
      setActivity((curr) => [
        {
          id: now,
          timestamp: now,
          day: "Today",
          time: "Just now",
          type: "adjusted",
          title: `${target.name} note updated`,
          detail: notePreview,
          meta: "Pantry note",
          quantity: `${target.quantity} ${target.unit}`,
        },
        ...curr,
      ]);

      setActivityRefresh((n) => n + 1);
      flashNotice(`Note saved for ${target.name}`);
    } catch (err) {
      if (err instanceof PantryApiError && err.code === "unauthorized") {
        setIsUnauthorized(true);
        setLoadError(err.message || "Your session has expired. Please sign in again.");
      } else {
        flashNotice(`Could not save note: ${err instanceof Error ? err.message : "Error"}`);
      }
    }
  };

  const handleReloadLatestItem = async (targetItem: PantryItem): Promise<PantryItem | null> => {
    try {
      const res = await pantryApi.list();
      const activeItems = res.items
        .filter((i) => (i.status === undefined || i.status === "active") && i.quantity > 0)
        .map(contractToUiItem);
      setItems(activeItems);
      const fresh = activeItems.find((i) => String(i.id) === String(targetItem.id));
      if (!fresh) {
        flashNotice(`${targetItem.name} is no longer in your pantry`);
        return null;
      }
      return fresh;
    } catch {
      return null;
    }
  };

  const handlePhotosSelected = () => {
    setUploadOpen(false);
    setReviewOpen(true);
  };

  const handleConfirmDetectedItems = (confirmed: DetectedGrocery[]) => {
    const newPantryEntries: PantryItem[] = confirmed.map((det, idx) => {
      const meta = calculateExpirationMeta(det.expirationDate);
      return withFixtureExpiration({
        id: Date.now() + idx,
        name: det.name,
        quantity: det.quantity,
        unit: det.unit,
        location: det.location,
        expirationDate: det.expirationDate,
        expiry: meta.expiry,
        urgency: meta.urgency,
        icon: det.icon,
        amount: 100,
        added: "Just now",
      });
    });

    setItems((curr) => [...newPantryEntries, ...curr]);
    const now = Date.now();
    setActivity((curr) => [
      {
        id: now,
        timestamp: now,
        day: "Today",
        time: "Just now",
        type: "added",
        title: `${confirmed.length} groceries added`,
        detail: confirmed.map((c) => c.name).join(", "),
        meta: "From grocery photo",
        quantity: `+${confirmed.length} items`,
      },
      ...curr,
    ]);

    setReviewOpen(false);
    setActivityRefresh((n) => n + 1);
    flashNotice(`${confirmed.length} groceries added to pantry`);
  };

  const handleOpenRecipe = (recipeId: number) => {
    setSelectedRecipeId(recipeId);
  };

  const handleMarkCooked = () => {
    if (!selectedRecipe) return;
    const initialDeds: PantryDeduction[] = selectedRecipe.uses.map((ing) => ({
      ingredient: ing,
      quantity: "1",
      unit: "portion",
    }));
    setDeductions(initialDeds);
    setShowDeductions(true);
  };

  const handleConfirmDeductions = (confirmedDeds: PantryDeduction[]) => {
    setShowDeductions(false);
    setSelectedRecipeId(null);
    const now = Date.now();
    setActivity((curr) => [
      {
        id: now,
        timestamp: now,
        day: "Today",
        time: "Just now",
        type: "cooked",
        title: `${selectedRecipe?.name || "Recipe"} cooked`,
        detail: confirmedDeds.map((d) => d.ingredient).join(", ") + " updated",
        meta: `${confirmedDeds.length} pantry deductions confirmed`,
        quantity: "1 meal",
      },
      ...curr,
    ]);
    setActivityRefresh((n) => n + 1);
    flashNotice("Pantry updated after cooking");
  };

  const cookedMealsCount = activity.filter((e) => e.type === "cooked").length;
  // Food waste saved is tracked when meals are cooked (approx. 0.5 kg prevented per meal)
  const monthlySavedKg = Math.round(cookedMealsCount * 0.5 * 10) / 10;

  if (showOnboarding) {
    return (
      <OnboardingWizard
        initialName={user?.name && !user.name.includes("@") ? user.name : ""}
        onComplete={handleOnboardingComplete}
        onCancel={handleOnboardingCancel}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeNav={activeNav}
        onNavigate={setActiveNav}
        pantryCount={items.length}
        recipesCount={suggestedRecipes.length}
        monthlySavedKg={monthlySavedKg}
        monthlyGoalKg={monthlyGoalKg}
        mealsSavedCount={cookedMealsCount}
        user={user}
        onOpenSettings={() => setSettingsOpen(true)}
        onSignOut={onSignOut}
      />

      <main className="main-content">
        <Topbar
          query={query}
          onQueryChange={handleSearchChange}
          onSubmitSearch={handleTopbarSubmitSearch}
          onOpenUpload={() => setUploadOpen(true)}
        />

        <div
          className={`page ${
            activeNav === "My pantry"
              ? "pantry-page"
              : activeNav === "Recipes"
              ? "recipes-page"
              : activeNav === "Activity"
              ? "activity-page"
              : ""
          }`}
        >
          {activeNav === "My pantry" ? (
            <PantryView
              items={items}
              searchQuery={query}
              onSearchChange={handleSearchChange}
              recipesCount={suggestedRecipes.length}
              isLoading={isLoading}
              loadError={loadError}
              isUnauthorized={isUnauthorized}
              onRetry={handleRetryLoad}
              onSignIn={() => {
                if (onSignOut) {
                  onSignOut();
                } else {
                  router.push("/login");
                }
              }}
              onAddItem={() => setAddOpen(true)}
              onAddGroceries={() => setUploadOpen(true)}
              onEditItem={(item) => setEditingItem(item)}
              onDeleteItem={(item) => setPendingRemoval(item)}
              notes={notes}
              onUpdateNote={handleUpdateNote}
              onSaveNote={handleSaveNote}
              renderItemActions={(item) => (
                <InventoryAdjustControls
                  item={item}
                  api={inventoryApi}
                  onAdjusted={handleInventoryAdjusted}
                />
              )}
              renderExpiration={renderExpiration}
              listControls={{
                toolbar: (
                  <PantryFilterBar
                    filters={pantryFilters.filters}
                    onChange={handlePantryFiltersChange}
                    counts={pantryFilters.counts}
                    shown={pantryFilters.visibleItems.length}
                    total={pantryFilters.total}
                  />
                ),
                items: pantryFilters.visibleItems,
                empty: <PantryNoMatches onClear={handlePantryFiltersClear} />,
              }}
            />
          ) : activeNav === "Recipes" ? (
            <RecipesView
              recipes={suggestedRecipes}
              preferences={preferences}
              pantryCount={items.length}
              onOpenPreferences={() => setPreferencesOpen(true)}
              onSelectRecipe={handleOpenRecipe}
            />
          ) : activeNav === "Activity" ? (
            <ActivityView events={activity} />
          ) : (
            <OverviewView
              userName={user.name.split(" ")[0]}
              items={items}
              searchQuery={query}
              onOpenRecipe={handleOpenRecipe}
              onNavigate={setActiveNav}
              onNavigateToItem={handleNavigateToItem}
              onEditItem={(item) => setEditingItem(item)}
              onNotice={flashNotice}
              renderExpiration={renderExpiration}
              activityPanel={
                <RecentActivityPanel
                  api={inventoryApi}
                  refreshToken={activityRefresh}
                  onViewAll={() => setActiveNav("Activity")}
                />
              }
            />
          )}
        </div>
      </main>

      <MobileNav activeNav={activeNav} onNavigate={setActiveNav} />

      {/* Modals */}
      <ScanUploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onPhotosSelected={handlePhotosSelected}
      />

      <ScanReviewModal
        isOpen={reviewOpen}
        detectedItems={detectedGroceriesState}
        onClose={() => setReviewOpen(false)}
        onChooseDifferentPhoto={() => {
          setReviewOpen(false);
          setUploadOpen(true);
        }}
        onConfirm={handleConfirmDetectedItems}
      />

      <PantryFormModal
        isOpen={addOpen}
        mode="add"
        onClose={() => setAddOpen(false)}
        onSubmitAdd={handleAddPantryItem}
      />

      <PantryFormModal
        isOpen={Boolean(editingItem)}
        mode="edit"
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSubmitEdit={handleEditPantryItem}
        onReloadLatest={handleReloadLatestItem}
      />

      <PantryDeleteModal
        item={pendingRemoval}
        isOpen={Boolean(pendingRemoval)}
        onClose={() => setPendingRemoval(null)}
        onConfirmDelete={handleDeletePantryItem}
        onReloadLatest={handleReloadLatestItem}
      />

      <RecipeDetailModal
        recipe={selectedRecipe}
        isOpen={Boolean(selectedRecipe)}
        onClose={() => setSelectedRecipeId(null)}
        onMarkCooked={handleMarkCooked}
      />

      <DeductionsModal
        isOpen={showDeductions}
        deductions={deductions}
        onClose={() => setShowDeductions(false)}
        onConfirm={handleConfirmDeductions}
      />

      <RecipePreferencesModal
        isOpen={preferencesOpen}
        preferences={preferences}
        onClose={() => setPreferencesOpen(false)}
        onSave={(newPrefs) => {
          setPreferences(newPrefs);
          flashNotice("Recipe preferences saved");
        }}
      />

      <AccountSettingsModal
        isOpen={settingsOpen}
        profile={user}
        onClose={() => setSettingsOpen(false)}
        onEditProfileClick={() => {
          setSettingsOpen(false);
          setProfileDraft({ ...user });
        }}
        onSaveNotice={flashNotice}
        monthlyGoalKg={monthlyGoalKg}
        onGoalChange={(newGoal) => {
          setMonthlyGoalKg(newGoal);
          const email = user?.email || initialUser?.email || "anonymous";
          try {
            const existing = localStorage.getItem(`ff_settings_${email}`);
            const parsed = existing ? JSON.parse(existing) : {};
            localStorage.setItem(
              `ff_settings_${email}`,
              JSON.stringify({ ...parsed, monthlyGoalKg: newGoal })
            );
          } catch {}
          flashNotice(`Monthly target updated to ${newGoal.toFixed(1)} kg`);
        }}
        onRetakeOnboarding={() => {
          setSettingsOpen(false);
          setForceShowOnboarding(true);
        }}
      />

      <ProfileEditModal
        isOpen={Boolean(profileDraft)}
        profile={profileDraft || user}
        onClose={() => setProfileDraft(null)}
        onSave={(updated) => {
          setUser(updated);
          flashNotice("Profile updated");
        }}
      />

      {notice && (
        <div className="toast">
          <span>
            <Icon name="check" size={16} />
          </span>
          {notice}
        </div>
      )}
    </div>
  );
}
