import { getDb } from "../database/connection.js";
import type { Food, FoodSearchResult, MealChannel } from "../types/domain.js";

type FoodRow = {
  food_id: number;
  food_name: string;
  food_unit_type: string;
  meal_channel: MealChannel;
  category: string | null;
  price_krw: number;
  calories_kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
};

type FoodLookupRow = {
  food_id: number;
  name: string;
};

export type FoodSearchInput = {
  q?: string;
  exact?: boolean;
  mealChannel?: MealChannel;
  limit?: number;
  offset?: number;
  ids?: number[];
  names?: string[];
};

function activeFoodClause() {
  return getDb().dialect === "postgres" ? "is_active IS TRUE" : "is_active = 1";
}

function selectFoodRowsSql() {
  return `
    SELECT
      food_id,
      food_name,
      food_unit_type,
      meal_channel,
      category,
      price_krw,
      calories_kcal,
      protein_g,
      fat_g,
      carbs_g
    FROM foods
  `;
}

function uniqueNumbers(values: number[] = []) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function uniqueTexts(values: string[] = []) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function addLookupValue(map: Map<number, string[]>, row: FoodLookupRow) {
  const values = map.get(row.food_id) ?? [];
  values.push(row.name);
  map.set(row.food_id, values);
}

function foodRowToDomain(row: FoodRow, tagMap: Map<number, string[]>, allergenMap: Map<number, string[]>): Food {
  return {
    id: row.food_id,
    name: row.food_name,
    unitType: row.food_unit_type,
    mealChannel: row.meal_channel,
    category: row.category,
    priceKrw: row.price_krw,
    caloriesKcal: row.calories_kcal,
    proteinG: row.protein_g,
    fatG: row.fat_g,
    carbsG: row.carbs_g,
    tags: tagMap.get(row.food_id) ?? [],
    allergens: allergenMap.get(row.food_id) ?? [],
  };
}

async function mapFoods(rows: FoodRow[]): Promise<Food[]> {
  if (!rows.length) return [];

  const db = getDb();
  const foodIds = rows.map((row) => row.food_id);
  const placeholders = foodIds.map(() => "?").join(", ");
  const [tags, allergens] = await Promise.all([
    db.all<FoodLookupRow>(
      `
        SELECT ft.food_id, t.tag_name AS name
        FROM food_tag_map ft
        JOIN tags t ON t.tag_id = ft.tag_id
        WHERE ft.food_id IN (${placeholders})
        ORDER BY ft.food_id, t.tag_name
      `,
      foodIds,
    ),
    db.all<FoodLookupRow>(
      `
        SELECT fa.food_id, a.allergen_name AS name
        FROM food_allergens fa
        JOIN allergens a ON a.allergen_id = fa.allergen_id
        WHERE fa.food_id IN (${placeholders})
        ORDER BY fa.food_id, a.allergen_name
      `,
      foodIds,
    ),
  ]);

  const tagMap = new Map<number, string[]>();
  const allergenMap = new Map<number, string[]>();
  tags.forEach((row) => addLookupValue(tagMap, row));
  allergens.forEach((row) => addLookupValue(allergenMap, row));

  return rows.map((row) => foodRowToDomain(row, tagMap, allergenMap));
}

async function mapFood(row: FoodRow): Promise<Food> {
  const [food] = await mapFoods([row]);
  return food;
}

export async function listFoods() {
  const rows = await getDb().all<FoodRow>(`
    ${selectFoodRowsSql()}
    WHERE ${activeFoodClause()}
    ORDER BY meal_channel, food_name
  `);
  return mapFoods(rows);
}

export async function searchFoods(input: FoodSearchInput = {}): Promise<FoodSearchResult> {
  const db = getDb();
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const offset = Math.max(input.offset ?? 0, 0);
  const query = input.q?.trim() ?? "";
  const ids = uniqueNumbers(input.ids);
  const names = uniqueTexts(input.names).slice(0, 30);
  const whereClauses = [activeFoodClause()];
  const params: Array<string | number> = [];

  if (input.mealChannel) {
    whereClauses.push("meal_channel = ?");
    params.push(input.mealChannel);
  }

  if (query && input.exact) {
    whereClauses.push("LOWER(food_name) = ?");
    params.push(query.toLowerCase());
  } else if (query) {
    const likeQuery = `%${query.toLowerCase()}%`;
    whereClauses.push(
      `(
        LOWER(food_name) LIKE ?
        OR LOWER(COALESCE(category, '')) LIKE ?
        OR EXISTS (
          SELECT 1
          FROM food_tag_map search_ft
          JOIN tags search_t ON search_t.tag_id = search_ft.tag_id
          WHERE search_ft.food_id = foods.food_id
            AND LOWER(search_t.tag_name) LIKE ?
        )
      )`,
    );
    params.push(likeQuery, likeQuery, likeQuery);
  }

  const preferenceClauses: string[] = [];
  if (ids.length) {
    preferenceClauses.push(`food_id IN (${ids.map(() => "?").join(", ")})`);
    params.push(...ids);
  }
  if (names.length) {
    preferenceClauses.push(`(${names.map(() => "LOWER(food_name) LIKE ?").join(" OR ")})`);
    params.push(...names.map((name) => `%${name.toLowerCase()}%`));
  }
  if (preferenceClauses.length) {
    whereClauses.push(`(${preferenceClauses.join(" OR ")})`);
  }

  const orderParams: Array<string | number> = [];
  const orderSql = query
    ? `
      ORDER BY
        CASE
          WHEN LOWER(food_name) = ? THEN 0
          WHEN LOWER(food_name) LIKE ? THEN 1
          ELSE 2
        END,
        protein_g DESC,
        price_krw ASC,
        food_name
    `
    : `
      ORDER BY
        protein_g DESC,
        price_krw ASC,
        food_name
    `;
  if (query) {
    orderParams.push(query.toLowerCase(), `${query.toLowerCase()}%`);
  }

  const rows = await db.all<FoodRow>(
    `
      ${selectFoodRowsSql()}
      WHERE ${whereClauses.join(" AND ")}
      ${orderSql}
      LIMIT ? OFFSET ?
    `,
    [...params, ...orderParams, limit + 1, offset],
  );
  const items = await mapFoods(rows.slice(0, limit));

  return {
    items,
    limit,
    offset,
    hasMore: rows.length > limit,
    query: query || null,
    mealChannel: input.mealChannel ?? null,
  };
}

export async function getFood(foodId: number) {
  const row = await getDb().get<FoodRow>(`${selectFoodRowsSql()} WHERE food_id = ? AND ${activeFoodClause()}`, [foodId]);
  return row ? mapFood(row) : null;
}

export async function createManualFood(input: {
  foodName: string;
  mealChannel?: MealChannel;
  priceKrw: number;
  caloriesKcal: number;
  proteinG?: number;
  fatG?: number;
  carbsG?: number;
}) {
  const db = getDb();
  const variableAmountValue = db.dialect === "postgres" ? "TRUE" : "1";
  const result = await db.run(
    `
      INSERT INTO foods (
        food_name, food_unit_type, meal_channel, category, serving_unit_label,
        price_krw, calories_kcal, protein_g, fat_g, carbs_g, is_variable_amount, source_label
      )
      VALUES (?, 'serving_menu', ?, '직접 입력', '1인분', ?, ?, ?, ?, ?, ${variableAmountValue}, 'manual-api')
      ${db.dialect === "postgres" ? "RETURNING food_id" : ""}
    `,
    [
      input.foodName,
      input.mealChannel ?? "home_meal",
      input.priceKrw,
      input.caloriesKcal,
      input.proteinG ?? 0,
      input.fatG ?? 0,
      input.carbsG ?? 0,
    ],
  );
  return result.lastInsertRowid ? getFood(result.lastInsertRowid) : null;
}
