import { FaIcon } from "../components/common/FaIcon";
import { MetricCard } from "../components/common/MetricCard";
import { MealList } from "../components/meals/MealList";
import { RecommendationCard } from "../components/recommendation/RecommendationCard";
import { WeightChart } from "../components/weight/WeightChart";
import type { DashboardSummary } from "../types/domain";
import { formatKcal, formatWon, goalLabel } from "../utils/format";

type DashboardPageProps = {
  dashboard: DashboardSummary;
};

export function DashboardPage({ dashboard }: DashboardPageProps) {
  const weightDelta = dashboard.weight.changeFromPreviousKg;
  const weightDeltaText = weightDelta === null ? "첫 기록" : `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}kg`;

  return (
    <div className="page-stack">
      <section className="hero-panel weight-first">
        <div className="section-heading">
          <div>
            <span className="kicker">나의 변화</span>
            <h1>{dashboard.profile.displayName}님, 오늘 잘 가고 있어요</h1>
          </div>
          <span className="goal-pill">
            <FaIcon name="bullseye" size={15} />
            {goalLabel(dashboard.profile.goalType)}
          </span>
        </div>

        <div className="weight-overview">
          <div className="weight-number">
            <span>현재 체중</span>
            <strong>
              {dashboard.weight.currentWeightKg.toFixed(1)}
              <small>kg</small>
            </strong>
            <p>
              목표 {dashboard.weight.targetWeightKg.toFixed(1)}kg · 최근 {dashboard.weight.latestRecordedAt?.slice(0, 10) ?? "-"}
            </p>
          </div>
          <div className="weight-stats">
            <MetricCard label="최근 변화" value={weightDeltaText} helper="이전 기록 대비" tone="green" />
            <MetricCard label="목표 달성률" value={`${dashboard.weight.progressRate}%`} helper="시작 체중 기준" tone="blue" />
          </div>
        </div>
        <WeightChart points={dashboard.weight.chart} />
      </section>

      <section className="summary-grid">
        <MetricCard
          label="오늘 섭취"
          value={formatKcal(dashboard.today.caloriesKcal)}
          helper={`남은 ${formatKcal(dashboard.today.remainingCaloriesKcal)}`}
          tone="yellow"
        />
        <MetricCard
          label="이번 주 잔액"
          value={formatWon(dashboard.today.remainingBudgetKrw)}
          helper={`사용 ${formatWon(dashboard.weeklyMeals.spentMoneyKrw)}`}
          tone="green"
        />
        <MetricCard label="단백질" value={`${dashboard.today.proteinG}g`} helper="오늘 누적" tone="blue" />
      </section>

      <section className="content-section">
        <div className="section-heading compact">
          <div>
            <span className="kicker">오늘의 식단</span>
            <h2>최근 기록과 이어서 보기</h2>
          </div>
          <FaIcon name="calendar-o" size={20} />
        </div>
        <MealList meals={dashboard.today.meals} />
      </section>

      <section className="content-section">
        <div className="section-heading compact">
          <div>
            <span className="kicker">식단 추천</span>
            <h2>저녁 후보</h2>
          </div>
          <FaIcon name="credit-card" size={20} />
        </div>
        <div className="recommendation-grid">
          {dashboard.recommendations.slice(0, 2).map((recommendation) => (
            <RecommendationCard key={recommendation.id} recommendation={recommendation} />
          ))}
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading compact">
          <div>
            <span className="kicker">주간 흐름</span>
            <h2>식비와 섭취 패턴</h2>
          </div>
          <FaIcon name="line-chart" size={20} />
        </div>
        <div className="week-strip">
          {dashboard.weeklyMeals.byDate.map((day) => (
            <article key={day.date}>
              <span>{day.date.slice(5).replace("-", ".")}</span>
              <strong>{day.summary.mealCount}</strong>
              <small>{formatKcal(day.summary.caloriesKcal)}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
