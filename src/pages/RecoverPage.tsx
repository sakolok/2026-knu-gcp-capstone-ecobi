import { FaIcon } from "../components/common/FaIcon";
import { MetricCard } from "../components/common/MetricCard";
import { RecommendationCard } from "../components/recommendation/RecommendationCard";
import type { DashboardSummary, Recommendation } from "../types/domain";
import { formatKcal, formatWon } from "../utils/format";

type RecoverPageProps = {
  dashboard: DashboardSummary;
  recommendations: Recommendation[];
};

export function RecoverPage({ dashboard, recommendations }: RecoverPageProps) {
  const overSpendRisk = Math.max(0, dashboard.weeklyMeals.spentMoneyKrw + 18000 - dashboard.profile.weeklyBudgetKrw);

  return (
    <div className="page-stack">
      <section className="page-header">
        <span className="kicker">회복</span>
        <h1>외식이 있어도 이번 주 예산 안으로 돌아옵니다</h1>
      </section>

      <section className="recover-flow">
        <article>
          <FaIcon name="krw" size={22} />
          <span>예상 외식비</span>
          <strong>{formatWon(18000)}</strong>
        </article>
        <article>
          <FaIcon name="road" size={22} />
          <span>조정 필요</span>
          <strong>{overSpendRisk ? formatWon(overSpendRisk) : "없음"}</strong>
        </article>
        <article>
          <FaIcon name="check-circle-o" size={22} />
          <span>회복 기준</span>
          <strong>저녁 7천원대</strong>
        </article>
      </section>

      <section className="summary-grid">
        <MetricCard label="이번 주 섭취" value={formatKcal(dashboard.weeklyMeals.caloriesKcal)} helper="기록 합계" />
        <MetricCard label="주간 지출" value={formatWon(dashboard.weeklyMeals.spentMoneyKrw)} helper="현재 기록 기준" tone="green" />
        <MetricCard label="남은 예산" value={formatWon(dashboard.today.remainingBudgetKrw)} helper="추천 기준" tone="blue" />
      </section>

      <section className="content-section">
        <div className="section-heading compact">
          <div>
            <span className="kicker">회복 식단</span>
            <h2>단백질은 유지하고 지출만 낮추기</h2>
          </div>
        </div>
        <div className="recommendation-grid">
          {recommendations.slice(0, 2).map((recommendation) => (
            <RecommendationCard key={recommendation.id} recommendation={recommendation} />
          ))}
        </div>
      </section>
    </div>
  );
}
