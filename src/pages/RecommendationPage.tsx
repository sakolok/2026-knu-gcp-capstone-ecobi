import { useEffect, useState } from "react";
import { FaIcon } from "../components/common/FaIcon";
import { RecommendationCard } from "../components/recommendation/RecommendationCard";
import { SegmentedControl } from "../components/common/SegmentedControl";
import { getRecommendations, selectRecommendation } from "../services/ecobiService";
import type { MealType, Recommendation } from "../types/domain";

type RecommendationPageProps = {
  initialRecommendations: Recommendation[];
  onChanged: () => Promise<void>;
};

export function RecommendationPage({ initialRecommendations, onChanged }: RecommendationPageProps) {
  const [mealType, setMealType] = useState<MealType>("dinner");
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setRecommendations(initialRecommendations);
  }, [initialRecommendations]);

  async function refresh(nextMealType = mealType) {
    setRecommendations(await getRecommendations(nextMealType));
  }

  async function changeMealType(nextMealType: MealType) {
    setMealType(nextMealType);
    await refresh(nextMealType);
  }

  async function saveSelection(id: number) {
    await selectRecommendation(id);
    setMessage("추천 선택을 저장했습니다. 팀원의 AI 알고리즘은 adapter만 교체하면 연결됩니다.");
    await onChanged();
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <span className="kicker">식단 추천</span>
        <h1>목표, 예산, 단백질 기준으로 바로 고릅니다</h1>
        <p>현재는 seed/rule 기반 추천이며, AI 알고리즘은 recommendation adapter로 연결할 수 있습니다.</p>
      </section>

      <div className="toolbar-row">
        <SegmentedControl
          label="추천 식사 유형"
          value={mealType}
          onChange={(value) => void changeMealType(value)}
          options={[
            { label: "점심", value: "lunch" },
            { label: "저녁", value: "dinner" },
            { label: "간식", value: "snack" },
          ]}
        />
        <button type="button" className="secondary-action" onClick={() => void refresh()}>
          <FaIcon name="refresh" size={16} />
          새로고침
        </button>
      </div>

      {message ? <p className="inline-message">{message}</p> : null}

      <section className="content-section recommendation-hero">
        <div className="section-heading compact">
          <div>
            <span className="kicker">가장 추천</span>
            <h2>지금 먹기 좋은 후보</h2>
          </div>
          <FaIcon name="magic" size={21} />
        </div>
        <div className="recommendation-grid">
          {recommendations.map((recommendation) => (
            <RecommendationCard key={recommendation.id} recommendation={recommendation} onSelect={(id) => void saveSelection(id)} />
          ))}
        </div>
      </section>
    </div>
  );
}
