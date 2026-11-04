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
  PantryItem,
  initialPantryItems,
  initialActivityEvents,
  ActivityEvent,
  calculateExpirationMeta,
} from "@/features/pantry";

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
  const [items, setItems] = useState<PantryItem[]>(initialPantryItems);
  const [activity, setActivity] = useState<ActivityEvent[]>(initialActivityEvents);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [user, setUser] = useState<UserProfile>(initialUser);
  const [preferences, setPreferences] = useState<RecipePreferences>(defaultRecipePreferences);

  // Modal open states
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

  // Handlers
  const handleSavePantryItem = (updated: PantryItem) => {
    const meta = calculateExpirationMeta(updated.expirationDate);
    setItems((curr) =>
      curr.map((item) =>
        item.id === updated.id
          ? { ...updated, expiry: meta.expiry, urgency: meta.urgency }
          : item
      )
    );
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
    flashNotice(`${itemToRemove.name} removed from pantry`);
  };

  const handleUpdateNote = (id: number, text: string) => {
    setNotes((prev) => ({ ...prev, [id]: text }));
  };

  const handlePhotosSelected = (_files: FileList | null) => {
    setUploadOpen(false);
    setReviewOpen(true);
  };

  const handleConfirmDetectedItems = (confirmed: DetectedGrocery[]) => {
    const newPantryEntries: PantryItem[] = confirmed.map((det, idx) => {
      const meta = calculateExpirationMeta(det.expirationDate);
      return {
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
      };
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
              onAddGroceries={() => setUploadOpen(true)}
              onEditItem={(item) => setEditingItem(item)}
              onDeleteItem={(item) => setPendingRemoval(item)}
              notes={notes}
              onUpdateNote={handleUpdateNote}
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

      <PantryEditModal
        item={editingItem}
        isOpen={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        onSave={handleSavePantryItem}
      />

      <PantryRemoveModal
        item={pendingRemoval}
        isOpen={Boolean(pendingRemoval)}
        onClose={() => setPendingRemoval(null)}
        onConfirmRemove={handleRemovePantryItem}
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
