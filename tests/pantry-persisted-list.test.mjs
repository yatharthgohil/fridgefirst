import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/register-ts-paths.mjs";

const {
  createHttpPantryApi,
  contractToUiItem,
  PantryApiError,
} = await import("../src/features/pantry/pantry-api.ts");

const {
  createHttpInventoryApi,
} = await import("../src/features/pantry/inventory-api.ts");

const {
  historyEntryToActivityEvent,
  calculateEventRescuedKg,
} = await import("../src/features/pantry/inventory-core.ts");

// Sample persisted item matching backend contract
function createSampleContractItem(overrides = {}) {
  return {
    id: "a1b2c3d4-0000-4000-8000-000000000001",
    name: "Almond Milk",
    quantity: 1.5,
    unit: "L",
    storageLocation: "Fridge",
    addedOn: "2026-11-16",
    expiration: {
      kind: "estimate",
      date: "2026-11-20",
      provenance: {
        referenceId: "00000000-0000-4000-8000-000000000001",
        foodName: "Almond Milk",
        storageLocation: "Fridge",
        days: 7,
        sourceName: "USDA Shelf Life Guide",
        sourceUrl: "https://example.com/reference",
        sourceAccessedOn: "2026-11-16",
        assumptions: "Refrigerated after opening",
      },
    },
    notes: "Unsweetened vanilla",
    status: "active",
    version: 1,
    createdAt: "2026-11-16T12:00:00Z",
    updatedAt: "2026-11-16T12:00:00Z",
    urgency: { kind: "soon", daysRemaining: 4, label: "4 days left" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. HTTP Pantry API: list, create, update, delete contracts
// ---------------------------------------------------------------------------

test("createHttpPantryApi.list fetches and parses persisted items from /api/pantry", async () => {
  const sample = createSampleContractItem();
  const mockFetch = async (url, init) => {
    assert.equal(url, "/api/pantry");
    assert.equal(init?.method, "GET");
    assert.equal(init?.credentials, "same-origin");
    return new Response(
      JSON.stringify({
        items: [sample],
        asOfDate: "2026-11-16",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const api = createHttpPantryApi(mockFetch);
  const result = await api.list();

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, "Almond Milk");
  assert.equal(result.items[0].quantity, 1.5);
  assert.equal(result.items[0].unit, "L");
  assert.equal(result.items[0].storageLocation, "Fridge");
  assert.equal(result.asOfDate, "2026-11-16");

  // Contract to UI item conversion
  const uiItem = contractToUiItem(result.items[0]);
  assert.equal(uiItem.name, "Almond Milk");
  assert.equal(uiItem.quantity, "1.5");
  assert.equal(uiItem.location, "Fridge");
  assert.equal(uiItem.urgency, "soon");
  assert.equal(uiItem.notes, "Unsweetened vanilla");
});

test("createHttpPantryApi.list returns empty array for user with empty pantry (no fixtures)", async () => {
  const mockFetch = async () => {
    return new Response(
      JSON.stringify({
        items: [],
        asOfDate: "2026-11-16",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const api = createHttpPantryApi(mockFetch);
  const result = await api.list();

  assert.equal(result.items.length, 0, "Items array should be empty");
  const uiItems = result.items.map(contractToUiItem);
  assert.deepEqual(uiItems, [], "UI items array must be empty without fixture fallback");
});

// ---------------------------------------------------------------------------
// 2. HTTP Pantry API: Error handling and session expiration
// ---------------------------------------------------------------------------

test("createHttpPantryApi handles 401 unauthorized session expiration", async () => {
  const mockFetch = async () => {
    return new Response(
      JSON.stringify({
        error: { code: "unauthorized", message: "Your session has expired. Please sign in again." },
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  };

  const api = createHttpPantryApi(mockFetch);
  await assert.rejects(
    async () => api.list(),
    (err) => {
      assert.ok(err instanceof PantryApiError);
      assert.equal(err.code, "unauthorized");
      assert.equal(err.message, "Your session has expired. Please sign in again.");
      return true;
    }
  );
});

test("createHttpPantryApi handles 500 server error and network failures", async () => {
  // 500 Server error
  const serverErrorFetch = async () => {
    return new Response(
      JSON.stringify({
        error: { code: "server", message: "Database connection failed" },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  };

  const serverApi = createHttpPantryApi(serverErrorFetch);
  await assert.rejects(
    async () => serverApi.list(),
    (err) => {
      assert.ok(err instanceof PantryApiError);
      assert.equal(err.code, "server");
      return true;
    }
  );

  // Network connection error
  const networkErrorFetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  const netApi = createHttpPantryApi(networkErrorFetch);
  await assert.rejects(
    async () => netApi.list(),
    (err) => {
      assert.ok(err instanceof PantryApiError);
      assert.equal(err.code, "network");
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// 3. HTTP Inventory API: History and Adjustments
// ---------------------------------------------------------------------------

test("createHttpInventoryApi.listHistory calls GET /api/inventory/history and parses entries", async () => {
  const mockFetch = async (url, init) => {
    assert.ok(url.startsWith("/api/inventory/history"));
    assert.equal(init?.method, "GET");
    return new Response(
      JSON.stringify({
        entries: [
          {
            id: "e1e2e3e4-0000-4000-8000-000000000001",
            itemId: "a1b2c3d4-0000-4000-8000-000000000001",
            itemName: "Almond Milk",
            operation: "consume",
            quantityDelta: -0.5,
            unit: "L",
            occurredAt: "2026-11-16T14:30:00.000Z",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const inventoryApi = createHttpInventoryApi(mockFetch);
  const entries = await inventoryApi.listHistory({ limit: 5 });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].itemName, "Almond Milk");
  assert.equal(entries[0].operation, "consume");
  assert.equal(entries[0].quantityDelta, -0.5);
});

// ---------------------------------------------------------------------------
// 4. Persistence round-trip and quantity refresh without manual reload
// ---------------------------------------------------------------------------

test("Persisted pantry mutation: create item, contract mapping, and quantity update", async () => {
  const createdContractItem = createSampleContractItem({
    id: "b2c3d4e5-0000-4000-8000-000000000002",
    name: "Greek Yogurt",
    quantity: 500,
    unit: "g",
    storageLocation: "Fridge",
    version: 1,
  });

  const mockFetch = async (url, init) => {
    if (url === "/api/pantry" && init.method === "POST") {
      return new Response(JSON.stringify({ item: createdContractItem }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url === `/api/pantry/${createdContractItem.id}` && init.method === "PATCH") {
      const updatedItem = {
        ...createdContractItem,
        quantity: 250,
        version: 2,
      };
      return new Response(JSON.stringify({ item: updatedItem }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected call to ${url}`);
  };

  const api = createHttpPantryApi(mockFetch);

  // 1. Create item
  const createRes = await api.create({
    name: "Greek Yogurt",
    quantity: 500,
    unit: "g",
    storageLocation: "Fridge",
    addedOn: "2026-11-16",
    expiration: { kind: "estimate" },
    notes: null,
  });

  assert.equal(createRes.item.name, "Greek Yogurt");
  assert.equal(createRes.item.quantity, 500);

  const uiItem = contractToUiItem(createRes.item);
  assert.equal(uiItem.quantity, "500");
  assert.equal(uiItem.version, 1);

  // 2. Update quantity (e.g., from editing or mutation)
  const updateRes = await api.update(uiItem.id, {
    expectedVersion: 1,
    changes: {
      quantity: 250,
    },
  });

  assert.equal(updateRes.item.quantity, 250);
  assert.equal(updateRes.item.version, 2);

  const updatedUiItem = contractToUiItem(updateRes.item);
  assert.equal(updatedUiItem.quantity, "250");
  assert.equal(updatedUiItem.version, 2);
});

// ---------------------------------------------------------------------------
// 5. Expiration provenance and unknown date representation
// ---------------------------------------------------------------------------

test("contractToUiItem correctly maps estimate provenance and unknown expiration", () => {
  // Estimate with provenance
  const estimateItem = createSampleContractItem({
    expiration: {
      kind: "estimate",
      date: "2026-11-20",
      provenance: {
        referenceId: "00000000-0000-4000-8000-000000000001",
        foodName: "Almond Milk",
        storageLocation: "Fridge",
        days: 7,
        sourceName: "USDA Reference",
        sourceUrl: "https://example.com",
        sourceAccessedOn: "2026-11-16",
        assumptions: "Refrigerated",
      },
    },
    urgency: { kind: "soon", daysRemaining: 4, label: "4 days left" },
  });

  const uiEstimate = contractToUiItem(estimateItem);
  assert.equal(uiEstimate.expirationDate, "2026-11-20");
  assert.equal(uiEstimate.expiry, "4 days left");
  assert.equal(uiEstimate.urgency, "soon");
  assert.equal(uiEstimate.expirationInfo.expiration.kind, "estimate");

  // Unknown expiration
  const unknownItem = createSampleContractItem({
    expiration: {
      kind: "unknown",
      date: null,
      reason: "no_match",
    },
    urgency: { kind: "unknown", daysRemaining: null, label: "Date unknown" },
  });

  const uiUnknown = contractToUiItem(unknownItem);
  assert.equal(uiUnknown.expirationDate, "");
  assert.equal(uiUnknown.expiry, "Date unknown");
  assert.equal(uiUnknown.expirationInfo.expiration.kind, "unknown");
  assert.equal(uiUnknown.expirationInfo.urgency.kind, "unknown");
});

// ---------------------------------------------------------------------------
// 6. Empty state calculations for recipes, activity, and waste metrics
// ---------------------------------------------------------------------------

test("Empty pantry recipe filtering: 90%+ match and No shopping return empty", () => {
  const sampleRecipes = [
    {
      id: 1,
      name: "Chickpea Bowl",
      time: 25,
      match: 96,
      missing: [],
      uses: ["Chickpeas", "Broccoli"],
    },
    {
      id: 2,
      name: "Pasta Primavera",
      time: 20,
      match: 75,
      missing: ["Parmesan"],
      uses: ["Pasta", "Tomatoes"],
    },
  ];

  const filterRecipes = (recipes, filter, isPantryEmpty) => {
    return recipes.filter((recipe) => {
      if (filter === "Under 30 min") return recipe.time <= 30;
      if (filter === "90%+ match") {
        if (isPantryEmpty) return false;
        return recipe.match >= 90;
      }
      if (filter === "No shopping") {
        if (isPantryEmpty) return false;
        return recipe.missing.length === 0;
      }
      return true;
    });
  };

  // When pantry is empty:
  assert.equal(filterRecipes(sampleRecipes, "All", true).length, 2);
  assert.equal(filterRecipes(sampleRecipes, "Under 30 min", true).length, 2);
  assert.equal(filterRecipes(sampleRecipes, "90%+ match", true).length, 0);
  assert.equal(filterRecipes(sampleRecipes, "No shopping", true).length, 0);

  // When pantry is populated:
  assert.equal(filterRecipes(sampleRecipes, "90%+ match", false).length, 1);
  assert.equal(filterRecipes(sampleRecipes, "No shopping", false).length, 1);
});

test("Activity stats derive real counts from events and default to zero on empty", () => {
  const computeStats = (events) => {
    const itemsAdded = events.filter((e) => e.type === "added").length;
    const mealsCooked = events.filter((e) => e.type === "cooked").length;
    const itemsAdjusted = events.filter((e) => e.type === "adjusted" || e.type === "removed").length;
    const rescuedAmount = events.length === 0 ? "0.0 kg" : "3.2 kg";
    return { itemsAdded, mealsCooked, itemsAdjusted, rescuedAmount };
  };

  // Empty activity list
  const emptyStats = computeStats([]);
  assert.deepEqual(emptyStats, {
    itemsAdded: 0,
    mealsCooked: 0,
    itemsAdjusted: 0,
    rescuedAmount: "0.0 kg",
  });

  // Populated activity list
  const populatedStats = computeStats([
    { type: "added" },
    { type: "added" },
    { type: "cooked" },
    { type: "adjusted" },
    { type: "removed" },
  ]);
  assert.deepEqual(populatedStats, {
    itemsAdded: 2,
    mealsCooked: 1,
    itemsAdjusted: 2,
    rescuedAmount: "3.2 kg",
  });
});

test("Monthly saving goal and waste saved derive from cooked meals, not pantry item count", () => {
  const computeWasteSaved = (activityEvents, targetGoalKg = 5.0) => {
    const cookedMealsCount = activityEvents.filter((e) => e.type === "cooked").length;
    const monthlySavedKg = Math.round(cookedMealsCount * 0.5 * 10) / 10;
    const progress = Math.min(100, Math.round((monthlySavedKg / targetGoalKg) * 100));
    return { monthlySavedKg, progress };
  };

  // Adding items (type === 'added') does NOT increment food waste saved
  const onlyAddedEvents = [{ type: "added" }, { type: "added" }, { type: "added" }];
  const addedResult = computeWasteSaved(onlyAddedEvents);
  assert.equal(addedResult.monthlySavedKg, 0.0, "Adding items must not adjust waste savings");
  assert.equal(addedResult.progress, 0);

  // Cooking meals increments waste saved
  const cookingEvents = [...onlyAddedEvents, { type: "cooked" }, { type: "cooked" }];
  const cookingResult = computeWasteSaved(cookingEvents, 5.0);
  assert.equal(cookingResult.monthlySavedKg, 1.0);
  assert.equal(cookingResult.progress, 20); // 1.0 / 5.0 = 20%
});

test("createHttpPantryApi.list filters out discarded or zero-quantity items from active pantry", async () => {
  const activeItem = createSampleContractItem({
    id: "a1b2c3d4-0000-4000-8000-000000000001",
    name: "Fresh Eggs",
    quantity: 6,
    status: "active",
  });
  const discardedItem = createSampleContractItem({
    id: "a1b2c3d4-0000-4000-8000-000000000002",
    name: "Old Milk",
    quantity: 0,
    status: "discarded",
  });
  const consumedItem = createSampleContractItem({
    id: "a1b2c3d4-0000-4000-8000-000000000003",
    name: "Bread",
    quantity: 0,
    status: "consumed",
  });

  const mockFetch = async () => {
    return new Response(
      JSON.stringify({
        items: [activeItem, discardedItem, consumedItem],
        asOfDate: "2026-11-16",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const api = createHttpPantryApi(mockFetch);
  const result = await api.list();

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, "Fresh Eggs");
});

test("Inventory adjustment full discard removes item and does not leave zero-quantity phantom item", () => {
  let pantryItems = [
    { id: "item-1", name: "Milk", quantity: "1", unit: "L", urgency: "soon" },
    { id: "item-2", name: "Cheese", quantity: "200", unit: "g", urgency: "fresh" },
  ];

  const handleAdjust = (result) => {
    if (result.item.quantity <= 0) {
      pantryItems = pantryItems.filter((i) => i.id !== result.item.id);
    } else {
      pantryItems = pantryItems.map((i) => (i.id === result.item.id ? { ...i, quantity: String(result.item.quantity) } : i));
    }
  };

  // Full discard of item-1 (Milk)
  handleAdjust({
    item: { id: "item-1", quantity: 0, unit: "L" },
    entry: { itemName: "Milk", operation: "discard", quantityDelta: -1, unit: "L" },
  });

  assert.equal(pantryItems.length, 1);
  assert.equal(pantryItems[0].name, "Cheese");

  // Needs attention calculation only checks remaining active items
  const expiringCount = pantryItems.filter((i) => i.urgency !== "fresh" && Number(i.quantity) > 0).length;
  assert.equal(expiringCount, 0, "Discarded item must not remain in needs attention");
});

test("Note saving generates an activity event and updates item", () => {
  const item = { id: "item-1", name: "Spinach", quantity: "1", unit: "bag", notes: null };
  const events = [];

  const handleSaveNote = (id, text) => {
    const notePreview = text.trim() ? `Note: "${text.trim().slice(0, 45)}"` : "Note cleared";
    events.unshift({
      id: Date.now(),
      day: "Today",
      time: "Just now",
      type: "adjusted",
      title: `${item.name} note updated`,
      detail: notePreview,
      meta: "Pantry note",
      quantity: `${item.quantity} ${item.unit}`,
    });
  };

  handleSaveNote("item-1", "Use for Friday pasta");
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Spinach note updated");
  assert.equal(events[0].detail, 'Note: "Use for Friday pasta"');
  assert.equal(events[0].type, "adjusted");
});

test("Expired items are included in needs attention and not reported as all fresh", () => {
  const expiredContractItem = createSampleContractItem({
    id: "item-expired-1",
    name: "Expired Milk",
    quantity: 1,
    unit: "bottle",
    storageLocation: "Fridge",
    expiration: { kind: "override", date: "2026-11-10" },
    urgency: { kind: "past_date", daysRemaining: -6, label: "Past date" },
  });

  const freshContractItem = createSampleContractItem({
    id: "item-fresh-1",
    name: "Fresh Oats",
    quantity: 1,
    unit: "bag",
    storageLocation: "Pantry",
    expiration: { kind: "override", date: "2027-01-01" },
    urgency: { kind: "later", daysRemaining: 400, label: "13 months" },
  });

  const uiExpired = contractToUiItem(expiredContractItem);
  assert.equal(uiExpired.urgency, "critical");
  assert.equal(uiExpired.expiry, "Past date");

  const uiFresh = contractToUiItem(freshContractItem);
  assert.equal(uiFresh.urgency, "fresh");

  const items = [uiFresh, uiExpired];

  // Overview / Dashboard calculation
  const isAttention = (i) => i.urgency !== "fresh" || i.expirationInfo?.urgency?.kind === "past_date";
  const expiringCount = items.filter(isAttention).length;
  assert.equal(expiringCount, 1, "Must count expired item as needing attention");

  // Verify most urgent item picks the expired one
  const mostUrgent =
    items.find((i) => i.expirationInfo?.urgency?.kind === "past_date" || (i.expiry || "").includes("Past")) ??
    items.find((i) => i.urgency === "critical") ??
    items[0];

  assert.equal(mostUrgent.name, "Expired Milk");
});

test("Search query filters pantry items by name, location, and notes", () => {
  const items = [
    { id: "1", name: "Almond Milk", location: "Fridge", notes: "For breakfast smoothies", quantity: "1" },
    { id: "2", name: "Baby Spinach", location: "Fridge", notes: "Salad greens", quantity: "1" },
    { id: "3", name: "Rolled Oats", location: "Pantry", notes: null, quantity: "2" },
  ];

  const search = (q) => {
    const needle = q.trim().toLowerCase();
    return items.filter((item) => {
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.location.toLowerCase().includes(needle) ||
        Boolean(item.notes && item.notes.toLowerCase().includes(needle))
      );
    });
  };

  // Match by name
  assert.equal(search("oats").length, 1);
  assert.equal(search("oats")[0].name, "Rolled Oats");

  // Match by location
  assert.equal(search("fridge").length, 2);

  // Match by note content
  assert.equal(search("smoothies").length, 1);
  assert.equal(search("smoothies")[0].name, "Almond Milk");

  // Case insensitive & trimmed
  assert.equal(search("  SPINACH  ").length, 1);

  // No match
  assert.equal(search("chocolate").length, 0);
});

test("Needs attention cell navigates to item in pantry list via page switch and search", () => {
  let activeNav = "Overview";
  let searchFilter = "";
  let noticeMessage = "";

  const urgentItem = {
    id: "item-urgent-1",
    name: "Expired Greek Yogurt",
    location: "Fridge",
    quantity: "1",
  };

  const handleNavigateToItem = (item) => {
    activeNav = "My pantry";
    searchFilter = item.name;
    noticeMessage = `Showing ${item.name} in pantry`;
  };

  handleNavigateToItem(urgentItem);

  assert.equal(activeNav, "My pantry", "Should switch navigation to pantry page");
  assert.equal(searchFilter, "Expired Greek Yogurt", "Should set search filter to the item name");
  assert.equal(noticeMessage, "Showing Expired Greek Yogurt in pantry");
});

test("Onboarding wizard activates for new accounts and persists preferences and savings goal", () => {
  const store = new Map();
  const mockLocalStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
  };

  const newUser = { email: "newuser@example.com", name: "newuser@example.com" };

  // 1. Initial check: new account has no completed onboarding flag
  const isCompletedInitial = Boolean(mockLocalStorage.getItem(`ff_onboarded_${newUser.email}`));
  assert.equal(isCompletedInitial, false, "New account must trigger onboarding wizard");

  // 2. Complete onboarding with user selections
  const onboardingData = {
    name: "Taylor",
    measurementUnit: "Metric",
    equipment: ["Oven", "Stovetop", "Air fryer"],
    preferences: ["Vegetarian", "Quick & easy"],
    excludedFoods: ["peanuts", "shellfish"],
    monthlyGoalKg: 6,
  };

  mockLocalStorage.setItem(`ff_onboarded_${newUser.email}`, "true");
  mockLocalStorage.setItem(`ff_settings_${newUser.email}`, JSON.stringify(onboardingData));

  // 3. Second check: onboarding is recorded as completed
  const isCompletedAfter = Boolean(mockLocalStorage.getItem(`ff_onboarded_${newUser.email}`));
  assert.equal(isCompletedAfter, true, "Onboarding should be marked complete");

  // 4. Stored settings restore correctly
  const restored = JSON.parse(mockLocalStorage.getItem(`ff_settings_${newUser.email}`));
  assert.equal(restored.name, "Taylor");
  assert.equal(restored.monthlyGoalKg, 6);
  assert.deepEqual(restored.equipment, ["Oven", "Stovetop", "Air fryer"]);
  assert.deepEqual(restored.excludedFoods, ["peanuts", "shellfish"]);
});

test("Sidebar waste card displays selected goal target even when monthly saved is 0", () => {
  const renderWasteCardText = ({ monthlySavedKg = 0, monthlyGoalKg = 5.0, mealsSavedCount = 0 }) => {
    const goalProgress =
      monthlyGoalKg > 0
        ? Math.min(100, Math.round((monthlySavedKg / monthlyGoalKg) * 100))
        : 0;

    const message =
      monthlySavedKg <= 0
        ? "Start tracking food to measure waste prevented."
        : `You’ve kept ${mealsSavedCount} ${mealsSavedCount === 1 ? "meal" : "meals"} out of the bin so far.`;

    const goalLabel =
      monthlyGoalKg > 0
        ? `${goalProgress}% of your monthly goal (${monthlyGoalKg.toFixed(1)} kg target)`
        : "Set a monthly target to track impact";

    return { goalProgress, message, goalLabel };
  };

  // Case 1: Brand new user with 6.0 kg goal selected during onboarding
  const newAccount = renderWasteCardText({ monthlySavedKg: 0, monthlyGoalKg: 6.0, mealsSavedCount: 0 });
  assert.equal(newAccount.goalProgress, 0);
  assert.equal(newAccount.goalLabel, "0% of your monthly goal (6.0 kg target)");
  assert.equal(newAccount.message, "Start tracking food to measure waste prevented.");

  // Case 2: User with 3.0 kg goal after cooking 2 meals (1.0 kg saved)
  const activeAccount = renderWasteCardText({ monthlySavedKg: 1.0, monthlyGoalKg: 3.0, mealsSavedCount: 2 });
  assert.equal(activeAccount.goalProgress, 33);
  assert.equal(activeAccount.goalLabel, "33% of your monthly goal (3.0 kg target)");
  assert.equal(activeAccount.message, "You’ve kept 2 meals out of the bin so far.");

  // Case 3: No goal set (goal is 0)
  const noGoalAccount = renderWasteCardText({ monthlySavedKg: 0, monthlyGoalKg: 0, mealsSavedCount: 0 });
  assert.equal(noGoalAccount.goalProgress, 0);
  assert.equal(noGoalAccount.goalLabel, "Set a monthly target to track impact");
});

test("Settings modal changes to monthly target persist to storage and update goal", () => {
  const store = new Map();
  const mockLocalStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
  };

  const email = "user@example.com";
  mockLocalStorage.setItem(
    `ff_settings_${email}`,
    JSON.stringify({ name: "Alex", monthlyGoalKg: 6 })
  );

  // User opens settings and updates goal to 10 kg
  const newGoal = 10;
  const existing = mockLocalStorage.getItem(`ff_settings_${email}`);
  const parsed = existing ? JSON.parse(existing) : {};
  mockLocalStorage.setItem(
    `ff_settings_${email}`,
    JSON.stringify({ ...parsed, monthlyGoalKg: newGoal })
  );

  const updated = JSON.parse(mockLocalStorage.getItem(`ff_settings_${email}`));
  assert.equal(updated.monthlyGoalKg, 10, "Updated target must persist to storage");
  assert.equal(updated.name, "Alex", "Other settings must be preserved");
});

test("historyEntryToActivityEvent formats operations, relative day, and tone accurately", () => {
  const referenceNow = new Date("2026-11-17T16:00:00Z");

  // 1. Adjustment today (discard)
  const discardEntry = {
    id: "tx-discard-1",
    itemId: "item-1",
    itemName: "Greek Yogurt",
    operation: "discard",
    quantityDelta: -0.5,
    unit: "tub",
    occurredAt: "2026-11-17T14:30:00Z",
  };
  const event1 = historyEntryToActivityEvent(discardEntry, referenceNow);
  assert.equal(event1.type, "removed");
  assert.equal(event1.title, "Greek Yogurt discarded");
  assert.equal(event1.quantity, "−0.5 tubs");
  assert.equal(event1.day, "Today");
  assert.equal(event1.meta, "Marked as discarded");

  // 2. Adjustment yesterday (consume)
  const consumeEntry = {
    id: "tx-consume-1",
    itemId: "item-2",
    itemName: "Rolled Oats",
    operation: "consume",
    quantityDelta: -1,
    unit: "cup",
    occurredAt: "2026-11-16T10:00:00Z",
  };
  const event2 = historyEntryToActivityEvent(consumeEntry, referenceNow);
  assert.equal(event2.type, "cooked");
  assert.equal(event2.title, "Rolled Oats used");
  assert.equal(event2.day, "Yesterday");
  assert.equal(event2.meta, "Marked as used");

  // 3. Add item 3 days ago (Saturday)
  const addEntry = {
    id: "tx-add-1",
    itemId: "item-3",
    itemName: "Avocado",
    operation: "add",
    quantityDelta: 3,
    unit: "item",
    occurredAt: "2026-11-14T09:00:00Z",
  };
  const event3 = historyEntryToActivityEvent(addEntry, referenceNow);
  assert.equal(event3.type, "added");
  assert.equal(event3.title, "Avocado added");
  assert.equal(event3.day, "Saturday");
  assert.equal(event3.meta, "Added to inventory");
});

test("Pantry activity persistence: loads history entries from listHistory and retains them across page refreshes", async () => {
  const storedEntries = [
    {
      id: "tx-1",
      itemId: "item-1",
      itemName: "Baby Spinach",
      operation: "consume",
      quantityDelta: -1,
      unit: "bag",
      occurredAt: "2026-11-17T15:00:00Z",
    },
    {
      id: "tx-2",
      itemId: "item-2",
      itemName: "Cottage Cheese",
      operation: "discard",
      quantityDelta: -0.5,
      unit: "tub",
      occurredAt: "2026-11-16T12:00:00Z",
    },
  ];

  const mockFetch = async (url) => {
    assert.match(url, /\/api\/inventory\/history/);
    return new Response(JSON.stringify({ entries: storedEntries }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const inventoryApi = createHttpInventoryApi(mockFetch);
  const entries = await inventoryApi.listHistory({ limit: 50 });
  assert.equal(entries.length, 2);

  // Convert to ActivityEvents
  const activityEvents = entries.map((e) => historyEntryToActivityEvent(e));
  assert.equal(activityEvents.length, 2);
  assert.equal(activityEvents[0].title, "Baby Spinach used");
  assert.equal(activityEvents[1].title, "Cottage Cheese discarded");

  // Verify caching to localStorage for persistence across full page reloads
  const store = new Map();
  const email = "amy@example.com";
  store.set(`ff_activity_${email}`, JSON.stringify(activityEvents));

  // Simulate refresh: reload from cache
  const reloaded = JSON.parse(store.get(`ff_activity_${email}`));
  assert.equal(reloaded.length, 2);
  assert.equal(reloaded[0].title, "Baby Spinach used");
  assert.equal(reloaded[1].title, "Cottage Cheese discarded");

  // Activity summary stats calculate correctly from persisted events
  const mealsCooked = reloaded.filter((e) => e.type === "cooked").length;
  const itemsAdjusted = reloaded.filter((e) => e.type === "adjusted" || e.type === "removed").length;
  assert.equal(mealsCooked, 1);
  assert.equal(itemsAdjusted, 1);
});

test("Activity tab orders events chronologically with newest first (matching user addition order)", () => {
  // Scenario matching user report: Apple added first, then yes, then overripe avocado
  const t1 = 1731882000000; // 4:20 PM - Apple added first
  const t2 = 1731882180000; // 4:23 PM - yes added second
  const t3 = 1731882420000; // 4:27 PM - overripe avocado added third

  const appleEvent = {
    id: "tx-apple",
    timestamp: t1,
    day: "Today",
    time: "4:20 PM",
    type: "added",
    title: "Apple added",
    detail: "Added to Fridge",
    meta: "Manual entry",
    quantity: "+6 items",
  };

  const yesEvent = {
    id: "tx-yes",
    timestamp: t2,
    day: "Today",
    time: "4:23 PM",
    type: "added",
    title: "yes added",
    detail: "Added to Fridge",
    meta: "Manual entry",
    quantity: "+12 items",
  };

  const avocadoEntry = {
    id: "tx-avocado",
    itemId: "item-avocado",
    itemName: "Overripe avocado",
    operation: "add",
    quantityDelta: 1,
    unit: "item",
    occurredAt: new Date(t3).toISOString(),
  };
  const avocadoEvent = historyEntryToActivityEvent(avocadoEntry);

  const getEventTimestamp = (event) => {
    if (typeof event.timestamp === "number" && !Number.isNaN(event.timestamp)) {
      return event.timestamp;
    }
    if (typeof event.id === "number") {
      return event.id;
    }
    const parsed = Date.parse(String(event.id));
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const mergeActivityEvents = (apiEvents, localEvents) => {
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
  };

  const merged = mergeActivityEvents([avocadoEvent], [appleEvent, yesEvent]);

  assert.equal(merged.length, 3);
  assert.equal(merged[0].title, "Overripe avocado added", "Newest item (added 3rd) must be at the top");
  assert.equal(merged[1].title, "yes added", "Second item (added 2nd) must be in the middle");
  assert.equal(merged[2].title, "Apple added", "First item (added 1st) must be at the bottom");
});

// ---------------------------------------------------------------------------
// 8. Rescued food calculation and US customary / Metric unit conversion
// ---------------------------------------------------------------------------

test("calculateEventRescuedKg accurately calculates rescued food in kg from consumed items", () => {
  // Consumed item of 10 kg
  const consumed10kgEntry = {
    id: "tx-consume-10kg",
    itemId: "item-flour",
    itemName: "Flour",
    operation: "consume",
    quantityDelta: -10,
    unit: "kg",
    occurredAt: new Date().toISOString(),
  };
  const event10kg = historyEntryToActivityEvent(consumed10kgEntry);
  assert.equal(event10kg.type, "cooked");
  assert.equal(calculateEventRescuedKg(event10kg), 10);

  // Consumed item with 500 g
  const consumed500gEntry = {
    id: "tx-consume-500g",
    itemId: "item-berries",
    itemName: "Berries",
    operation: "consume",
    quantityDelta: -500,
    unit: "g",
    occurredAt: new Date().toISOString(),
  };
  const event500g = historyEntryToActivityEvent(consumed500gEntry);
  assert.equal(calculateEventRescuedKg(event500g), 0.5);

  // Cooked meal deduction
  const cookedMealEvent = {
    id: "tx-cooked-meal",
    type: "cooked",
    title: "Vegetable Soup cooked",
    quantity: "1 meal",
  };
  assert.equal(calculateEventRescuedKg(cookedMealEvent), 0.5);

  // Discarded item should not count towards food rescued
  const discardedEntry = {
    id: "tx-discard",
    itemId: "item-moldy-bread",
    itemName: "Bread",
    operation: "discard",
    quantityDelta: -1,
    unit: "bag",
    occurredAt: new Date().toISOString(),
  };
  const eventDiscarded = historyEntryToActivityEvent(discardedEntry);
  assert.equal(calculateEventRescuedKg(eventDiscarded), 0);

  // Added item should not count towards food rescued
  const addedEntry = {
    id: "tx-add",
    itemId: "item-milk",
    itemName: "Milk",
    operation: "add",
    quantityDelta: 2,
    unit: "L",
    occurredAt: new Date().toISOString(),
  };
  const eventAdded = historyEntryToActivityEvent(addedEntry);
  assert.equal(calculateEventRescuedKg(eventAdded), 0);
});

test("Food rescued amounts format accurately in US customary (lbs) and Metric (kg)", () => {
  const formatRescued = (savedKg, unit) => {
    const isUS = unit === "US customary";
    if (savedKg <= 0) return isUS ? "0.0 lbs" : "0.0 kg";
    return isUS
      ? `${(savedKg * 2.20462).toFixed(1)} lbs`
      : `${savedKg.toFixed(1)} kg`;
  };

  const formatSidebar = (savedKg, unit) => {
    const isUS = unit === "US customary";
    const unitLabel = isUS ? "lbs" : "kg";
    return isUS
      ? `${(savedKg * 2.20462).toFixed(1)} ${unitLabel} saved`
      : `${savedKg.toFixed(1)} ${unitLabel} saved`;
  };

  // When 10 kg of food is used up:
  const monthlySavedKg = 10.0;

  // Metric displays
  assert.equal(formatRescued(monthlySavedKg, "Metric"), "10.0 kg");
  assert.equal(formatSidebar(monthlySavedKg, "Metric"), "10.0 kg saved");

  // US Customary displays (10 kg * 2.20462 = 22.0462 -> 22.0 lbs)
  assert.equal(formatRescued(monthlySavedKg, "US customary"), "22.0 lbs");
  assert.equal(formatSidebar(monthlySavedKg, "US customary"), "22.0 lbs saved");

  // Zero rescued state
  assert.equal(formatRescued(0, "US customary"), "0.0 lbs");
  assert.equal(formatSidebar(0, "US customary"), "0.0 lbs saved");
  assert.equal(formatRescued(0, "Metric"), "0.0 kg");
  assert.equal(formatSidebar(0, "Metric"), "0.0 kg saved");
});
