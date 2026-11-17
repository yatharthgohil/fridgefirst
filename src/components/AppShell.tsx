"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileNav } from "./MobileNav";
import { Icon } from "./Icon";

import {
  PantryView,
  OverviewView,
  ActivityView,
  PantryEditModal,
  PantryRemoveModal,
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
  toFixtureItem,
  withUpdatedQuantity,
  historyEntryToActivityEvent,
  formatDelta,
  operationLabel,
  ExpirationStatus,
  PantryFilterBar,
  PantryNoMatches,
  usePantryFilters,
  getExpirationInfo,
  withFixtureExpiration,
  applyFixtureExpirationEdit,
  expirationFixtureItems,
} from "@/features/pantry";
import type { InventoryAdjustmentResponse } from "@/contracts/inventory";
import type { PantryCreateRequest, PantryUpdateRequest } from "@/contracts/pantry";

import {
  RecipesView,
  RecipeDetailModal,
  RecipePreferencesModal,
  Recipe,
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
} from "@/features/account";

// Fixture stand-in for items loaded from the API with expiration metadata attached.
const initialItems: PantryItem[] = [...initialPantryItems, ...expirationFixtureItems].map((item) =>
  withFixtureExpiration(item)
);

export interface AppShellProps {
  initialUser?: UserProfile;
  onSignOut?: () => void;
}

export function AppShell({
  initialUser = { name: "Alex Johnson", email: "alex@example.com" },
  onSignOut,
}: AppShellProps) {
  // Navigation & search state
  const [activeNav, setActiveNav] = useState("Overview");
  const [query, setQuery] = useState("");

  // Core data states
  const [items, setItems] = useState<PantryItem[]>(initialItems);
  const [activity, setActivity] = useState<ActivityEvent[]>(initialActivityEvents);
  const [notes, setNotes] = useState<Record<string | number, string>>({});
  const [user, setUser] = useState<UserProfile>(initialUser);
  const [preferences, setPreferences] = useState<RecipePreferences>(defaultRecipePreferences);

  // Modal open states
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [detectedGroceriesState, setDetectedGroceriesState] = useState<DetectedGrocery[]>(initialDetectedGroceries);

  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PantryItem | null>(null);

  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [showDeductions, setShowDeductions] = useState(false);
  const [deductions, setDeductions] = useState<PantryDeduction[]>([]);

  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<UserProfile | null>(null);

  // Pantry CRUD API: uses HTTP endpoints when connected to Supabase, in-memory fixtures otherwise.
  const [pantryApi] = useState(() =>
    typeof window !== "undefined" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
      ? createHttpPantryApi()
      : createFixturePantryApi({ items: initialItems })
  );

  // Inventory API for consume/discard + history. Swap for createHttpInventoryApi()
  // once the atomic inventory endpoints exist; the components don't change.
  const [inventoryApi] = useState(() =>
    createFixtureInventoryApi({ items: initialItems.map(toFixtureItem) })
  );
  const [activityRefresh, setActivityRefresh] = useState(0);

  // When live database is connected, load real items from GET /api/pantry
  useEffect(() => {
    let cancelled = false;
    if (typeof window !== "undefined" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
      pantryApi
        .list()
        .then((res) => {
          if (!cancelled && res.items) {
            setItems(res.items.map(contractToUiItem));
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [pantryApi]);

  // Fixture only: mirror mock add/edit/delete into inventory history and pantry store.
  useEffect(() => {
    inventoryApi.syncItems(items.map(toFixtureItem));
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

  // Selected recipe object
  const selectedRecipe = suggestedRecipes.find((r) => r.id === selectedRecipeId) || null;

  // Pantry list filters/sort (kept here so they persist across navigation).
  const pantryFilters = usePantryFilters(items);

  const renderExpiration = (item: PantryItem) => (
    <ExpirationStatus item={item} info={getExpirationInfo(item)} onEditItem={setEditingItem} />
  );

  // Handlers
  const handleInventoryAdjusted = (result: InventoryAdjustmentResponse) => {
    // Server-confirmed quantity is authoritative.
    setItems((curr) =>
      curr.map((item) =>
        String(item.id) === result.item.id ? withUpdatedQuantity(item, result.item.quantity) : item
      )
    );
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
    const response = await pantryApi.create(request);
    const createdItem = contractToUiItem(response.item);
    setItems((curr) => [createdItem, ...curr]);
    if (createdItem.notes) {
      setNotes((prev) => ({ ...prev, [createdItem.id]: createdItem.notes! }));
    }
    setActivity((curr) => [
      {
        id: Date.now(),
        day: "Today",
        time: "Just now",
        type: "added",
        title: `${createdItem.name} added`,
        detail: `Added to ${createdItem.location}`,
        meta: "Manual entry",
        quantity: `+${createdItem.quantity} ${createdItem.unit}`,
      },
      ...curr,
    ]);
    setActivityRefresh((n) => n + 1);
    flashNotice(`${createdItem.name} added to pantry`);
  };

  const handleEditPantryItem = async (itemId: string, request: PantryUpdateRequest) => {
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

    setActivity((curr) => [
      {
        id: Date.now(),
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
  };

  const handleDeletePantryItem = async (itemId: string, expectedVersion: number) => {
    await pantryApi.delete(itemId, { expectedVersion });
    const target = items.find((i) => String(i.id) === itemId);
    setItems((curr) => curr.filter((item) => String(item.id) !== itemId));
    setNotes((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
    if (target) {
      setActivity((curr) => [
        {
          id: Date.now(),
          day: "Today",
          time: "Just now",
          type: "removed",
          title: `${target.name} removed`,
          detail: `Removed from ${target.location}`,
          meta: "Manual adjustment",
          quantity: `−${target.quantity} ${target.unit}`,
        },
        ...curr,
      ]);
    }
    setActivityRefresh((n) => n + 1);
    flashNotice(`${target?.name || "Item"} removed from pantry`);
  };

  const handleSavePantryItem = (updated: PantryItem) => {
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

  const handleRemovePantryItem = (itemToRemove: PantryItem) => {
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

  const handleUpdateNote = (id: string | number, text: string) => {
    setNotes((prev) => ({ ...prev, [id]: text }));
    setItems((curr) =>
      curr.map((item) =>
        String(item.id) === String(id) ? { ...item, notes: text } : item
      )
    );
  };

  const handlePhotosSelected = (_files: FileList | null) => {
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
    setActivity((curr) => [
      {
        id: Date.now(),
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

  const handleOpenRecipe = (recipeId: number, _startCooking = false) => {
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
    setActivity((curr) => [
      {
        id: Date.now(),
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
    flashNotice("Pantry updated after cooking");
  };

  return (
    <div className="app-shell">
      <Sidebar
        activeNav={activeNav}
        onNavigate={setActiveNav}
        pantryCount={items.length}
        recipesCount={suggestedRecipes.length}
        user={user}
        onOpenSettings={() => setSettingsOpen(true)}
        onSignOut={onSignOut}
      />

      <main className="main-content">
        <Topbar
          query={query}
          onQueryChange={setQuery}
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
              onAddItem={() => setAddOpen(true)}
              onAddGroceries={() => setUploadOpen(true)}
              onEditItem={(item) => setEditingItem(item)}
              onDeleteItem={(item) => setPendingRemoval(item)}
              notes={notes}
              onUpdateNote={handleUpdateNote}
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
                    onChange={pantryFilters.setFilters}
                    counts={pantryFilters.counts}
                    shown={pantryFilters.visibleItems.length}
                    total={pantryFilters.total}
                  />
                ),
                items: pantryFilters.visibleItems,
                empty: <PantryNoMatches onClear={pantryFilters.clear} />,
              }}
            />
          ) : activeNav === "Recipes" ? (
            <RecipesView
              recipes={suggestedRecipes}
              preferences={preferences}
              onOpenPreferences={() => setPreferencesOpen(true)}
              onSelectRecipe={handleOpenRecipe}
            />
          ) : activeNav === "Activity" ? (
            <ActivityView events={activity} />
          ) : (
            <OverviewView
              userName={user.name.split(" ")[0]}
              items={items}
              onOpenRecipe={handleOpenRecipe}
              onNavigate={setActiveNav}
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
        onReloadLatest={(latest) => {
          const fresh = items.find((i) => String(i.id) === String(latest.id));
          if (fresh) setEditingItem(fresh);
        }}
      />

      <PantryDeleteModal
        item={pendingRemoval}
        isOpen={Boolean(pendingRemoval)}
        onClose={() => setPendingRemoval(null)}
        onConfirmDelete={handleDeletePantryItem}
        onReloadLatest={(latest) => {
          const fresh = items.find((i) => String(i.id) === String(latest.id));
          if (fresh) setPendingRemoval(fresh);
        }}
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
