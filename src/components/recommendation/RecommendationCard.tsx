import { FaIcon } from "../common/FaIcon";
import { FoodThumbnail } from "../common/FoodThumbnail";
import type { Recommendation } from "../../types/domain";
import { formatKcal, formatWon, mealTypeLabel } from "../../utils/format";

type RecommendationCardProps = {
  recommendation: Recommendation;
  onSelect?: (id: number) => void;
};

export function RecommendationCard({ recommendation, onSelect }: RecommendationCardProps) {
  return (
    <article className="recommendation-card">
      <div className="recommendation-main">
        <FoodThumbnail channel={recommendation.mealChannel} category={recommendation.items[0]?.foodName} />
        <div>
          <span>{mealTypeLabel(recommendation.mealType)}</span>
          <h3>{recommendation.name}</h3>
          <p>{recommendation.reason}</p>
        </div>
      </div>
      <div className="recommendation-metrics">
        <span>{formatWon(recommendation.totalPriceKrw)}</span>
        <span>{formatKcal(recommendation.totalCaloriesKcal)}</span>
        <span>단백질 {recommendation.totalProteinG}g</span>
      </div>
      <div className="recommendation-reason">
        <FaIcon name="info-circle" size={16} />
        <span>{recommendation.goalFit}</span>
      </div>
      <div className="tag-row">
        {recommendation.tags.slice(0, 4).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      {onSelect ? (
        <button type="button" className="primary-action" onClick={() => onSelect(recommendation.id)}>
          <FaIcon name="check" size={17} />
          선택 저장
        </button>
      ) : null}
    </article>
  );
}
