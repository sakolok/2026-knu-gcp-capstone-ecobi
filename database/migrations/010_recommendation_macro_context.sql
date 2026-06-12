ALTER TABLE recommendation_runs
  ADD COLUMN context_remaining_carbs_g REAL CHECK (context_remaining_carbs_g IS NULL OR context_remaining_carbs_g >= 0);

ALTER TABLE recommendation_runs
  ADD COLUMN context_remaining_protein_g REAL CHECK (context_remaining_protein_g IS NULL OR context_remaining_protein_g >= 0);

ALTER TABLE recommendation_runs
  ADD COLUMN context_remaining_fat_g REAL CHECK (context_remaining_fat_g IS NULL OR context_remaining_fat_g >= 0);

ALTER TABLE recommendation_runs
  ADD COLUMN target_meal_carbs_g REAL CHECK (target_meal_carbs_g IS NULL OR target_meal_carbs_g >= 0);

ALTER TABLE recommendation_runs
  ADD COLUMN target_meal_protein_g REAL CHECK (target_meal_protein_g IS NULL OR target_meal_protein_g >= 0);

ALTER TABLE recommendation_runs
  ADD COLUMN target_meal_fat_g REAL CHECK (target_meal_fat_g IS NULL OR target_meal_fat_g >= 0);
