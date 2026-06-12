CREATE INDEX IF NOT EXISTS foods_active_channel_name_idx
  ON foods(meal_channel, food_name)
  WHERE is_active = 1;

CREATE INDEX IF NOT EXISTS foods_active_name_idx
  ON foods(food_name)
  WHERE is_active = 1;

CREATE INDEX IF NOT EXISTS food_tag_map_food_id_idx
  ON food_tag_map(food_id);

CREATE INDEX IF NOT EXISTS food_allergens_food_id_idx
  ON food_allergens(food_id);
