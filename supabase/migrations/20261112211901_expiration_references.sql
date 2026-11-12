-- Shelf-life reference seed from the FoodSafety.gov cold food storage chart.
-- Refrigerator column only, at or below 40 F (4 C). Each row uses the shortest
-- interval the chart gives, and the food name states the preparation state so a
-- generic label such as "chicken" cannot match a state the chart never covered.
-- Rerunning this file converges on the same rows: conflicts on reference_id
-- restore the exact source values. It never touches pantry_items.

insert into public.shelf_life_references (
  reference_id, food_name, storage_location, shelf_life_days,
  source_name, source_url, source_accessed_on, assumptions
)
values
  (
    '5f0e1a20-0000-4000-8000-000000000001',
    'Raw chicken pieces',
    'Fridge',
    1,
    'FoodSafety.gov Cold Food Storage Chart',
    'https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts',
    '2026-11-12',
    'Chart gives 1 to 2 days for chicken or turkey pieces in the refrigerator at or below 40 F (4 C); the shorter interval of 1 day is used. The item addedOn date is the acquisition or preparation date, and the food is assumed to stay continuously refrigerated at or below 4 C. This estimate does not verify that food is safe to eat or still fresh.'
  ),
  (
    '5f0e1a20-0000-4000-8000-000000000002',
    'Raw ground beef',
    'Fridge',
    1,
    'FoodSafety.gov Cold Food Storage Chart',
    'https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts',
    '2026-11-12',
    'Chart gives 1 to 2 days for hamburger and ground meats in the refrigerator at or below 40 F (4 C); the shorter interval of 1 day is used. The item addedOn date is the acquisition or preparation date, and the food is assumed to stay continuously refrigerated at or below 4 C. This estimate does not verify that food is safe to eat or still fresh.'
  ),
  (
    '5f0e1a20-0000-4000-8000-000000000003',
    'Raw eggs in shell',
    'Fridge',
    21,
    'FoodSafety.gov Cold Food Storage Chart',
    'https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts',
    '2026-11-12',
    'Chart gives 3 to 5 weeks for raw eggs in shell in the refrigerator at or below 40 F (4 C); the shorter interval of 3 weeks is used, which is 21 days. The item addedOn date is the acquisition date, and the eggs are assumed to stay continuously refrigerated at or below 4 C. This estimate does not verify that food is safe to eat or still fresh.'
  ),
  (
    '5f0e1a20-0000-4000-8000-000000000004',
    'Hard-cooked eggs',
    'Fridge',
    7,
    'FoodSafety.gov Cold Food Storage Chart',
    'https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts',
    '2026-11-12',
    'Chart gives 1 week for hard-cooked eggs in the refrigerator at or below 40 F (4 C); 1 week is used, which is 7 days. The item addedOn date is the preparation date, and the eggs are assumed to stay continuously refrigerated at or below 4 C. This estimate does not verify that food is safe to eat or still fresh.'
  )
on conflict (reference_id) do update set
  food_name = excluded.food_name,
  storage_location = excluded.storage_location,
  shelf_life_days = excluded.shelf_life_days,
  source_name = excluded.source_name,
  source_url = excluded.source_url,
  source_accessed_on = excluded.source_accessed_on,
  assumptions = excluded.assumptions;
