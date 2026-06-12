import { FoodThumbnail } from "../common/FoodThumbnail";
import type { MealLog } from "../../types/domain";
import { formatKcal, formatWon, mealTypeLabel } from "../../utils/format";

type MealListProps = {
  meals: MealLog[];
  onDelete?: (id: number) => void;
};

export function MealList({ meals, onDelete }: MealListProps) {
  return (
    <div className="meal-log-list">
      {meals.map((meal) => (
        <article className="meal-log-row" key={meal.id}>
          <FoodThumbnail channel={meal.food.mealChannel} category={meal.food.category} />
          <div>
            <span>
              {meal.date} · {mealTypeLabel(meal.mealType)}
            </span>
            <strong>{meal.food.name}</strong>
            <small>
              {formatKcal(meal.caloriesKcal)} · 단백질 {meal.proteinG}g · {formatWon(meal.spentMoneyKrw)}
            </small>
          </div>
          {onDelete ? (
            <button type="button" className="icon-text-button" onClick={() => onDelete(meal.id)}>
              삭제
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}
