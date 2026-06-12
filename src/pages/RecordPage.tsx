import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { FaIcon } from "../components/common/FaIcon";
import { MetricCard } from "../components/common/MetricCard";
import { SegmentedControl } from "../components/common/SegmentedControl";
import { MealList } from "../components/meals/MealList";
import { WeightChart } from "../components/weight/WeightChart";
import {
  createMeal,
  createWeight,
  deleteMeal,
  deleteWeight,
  getMealSummary,
  listWeights,
} from "../services/ecobiService";
import type { DashboardSummary, Food, MealType, PeriodMealSummary, WeightRecord } from "../types/domain";
import { addDays, formatKcal, formatWon, mealTypeLabel, todayISO } from "../utils/format";

type RecordPageProps = {
  dashboard: DashboardSummary;
  foods: Food[];
  onChanged: () => Promise<void>;
};

type RecordMode = "weight" | "meal";

export function RecordPage({ dashboard, foods, onChanged }: RecordPageProps) {
  const [mode, setMode] = useState<RecordMode>("weight");
  const [weightRecords, setWeightRecords] = useState<WeightRecord[]>([]);
  const [periodStart, setPeriodStart] = useState(addDays(todayISO(), -6));
  const [periodEnd, setPeriodEnd] = useState(todayISO());
  const [periodSummary, setPeriodSummary] = useState<PeriodMealSummary | null>(null);
  const [selectedFoodId, setSelectedFoodId] = useState(foods[0]?.id ?? 0);
  const [mealType, setMealType] = useState<MealType>("dinner");
  const [message, setMessage] = useState<string | null>(null);

  const selectedFood = useMemo(() => foods.find((food) => food.id === selectedFoodId), [foods, selectedFoodId]);

  useEffect(() => {
    if (!selectedFoodId && foods[0]) setSelectedFoodId(foods[0].id);
  }, [foods, selectedFoodId]);

  useEffect(() => {
    void listWeights({ startDate: addDays(todayISO(), -30), endDate: todayISO() }).then(setWeightRecords);
  }, []);

  useEffect(() => {
    void getMealSummary({ startDate: periodStart, endDate: periodEnd }).then(setPeriodSummary);
  }, [periodStart, periodEnd]);

  async function submitWeight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createWeight({
      measuredAt: String(form.get("measuredAt")),
      weightKg: Number(form.get("weightKg")),
      note: String(form.get("note") ?? ""),
      heightCm: dashboard.profile.heightCm,
    });
    setMessage("체중 기록을 저장했습니다.");
    setWeightRecords(await listWeights({ startDate: addDays(todayISO(), -30), endDate: todayISO() }));
    await onChanged();
  }

  async function submitMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFood) return;
    const form = new FormData(event.currentTarget);
    await createMeal({
      foodId: selectedFood.id,
      mealType,
      consumedAt: String(form.get("consumedAt")),
      quantityLabel: "1인분",
      spentMoneyKrw: selectedFood.priceKrw,
    });
    setMessage("식단 기록을 저장했습니다.");
    setPeriodSummary(await getMealSummary({ startDate: periodStart, endDate: periodEnd }));
    await onChanged();
  }

  async function removeWeight(id: number) {
    await deleteWeight(id);
    setWeightRecords(await listWeights({ startDate: addDays(todayISO(), -30), endDate: todayISO() }));
    await onChanged();
  }

  async function removeMeal(id: number) {
    await deleteMeal(id);
    setPeriodSummary(await getMealSummary({ startDate: periodStart, endDate: periodEnd }));
    await onChanged();
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <span className="kicker">기록</span>
        <h1>체중과 식단을 같은 흐름에서 봅니다</h1>
      </section>

      <SegmentedControl
        label="기록 모드"
        value={mode}
        onChange={setMode}
        options={[
          { label: "체중 변화", value: "weight" },
          { label: "식단 기록", value: "meal" },
        ]}
      />

      {message ? <p className="inline-message">{message}</p> : null}

      {mode === "weight" ? (
        <>
          <section className="content-section">
            <div className="section-heading compact">
              <div>
                <span className="kicker">체중 변화</span>
                <h2>주간/월간 흐름</h2>
              </div>
              <FaIcon name="balance-scale" size={20} />
            </div>
            <div className="summary-grid">
              <MetricCard label="현재" value={`${dashboard.weight.currentWeightKg.toFixed(1)}kg`} helper="최근 기록" />
              <MetricCard label="목표" value={`${dashboard.weight.targetWeightKg.toFixed(1)}kg`} helper="사용자 목표" tone="blue" />
              <MetricCard
                label="변화량"
                value={`${dashboard.weight.changeFromStartKg > 0 ? "+" : ""}${dashboard.weight.changeFromStartKg.toFixed(1)}kg`}
                helper="시작 대비"
                tone="green"
              />
            </div>
            <WeightChart points={weightRecords.slice().reverse().map((record) => ({ date: record.date, weightKg: record.weightKg }))} />
          </section>

          <form className="form-panel" onSubmit={submitWeight}>
            <label>
              <span>측정 시간</span>
              <input name="measuredAt" type="datetime-local" defaultValue={`${todayISO()}T08:00`} />
            </label>
            <label>
              <span>체중 kg</span>
              <input name="weightKg" type="number" step="0.1" defaultValue={dashboard.weight.currentWeightKg} />
            </label>
            <label>
              <span>메모</span>
              <input name="note" type="text" defaultValue="아침 공복" />
            </label>
            <button className="primary-action" type="submit">
              <FaIcon name="plus" size={17} />
              체중 저장
            </button>
          </form>

          <section className="content-section">
            <h2>체중 기록</h2>
            <div className="simple-list">
              {weightRecords.map((record) => (
                <article key={record.id}>
                  <div>
                    <span>{record.date}</span>
                    <strong>{record.weightKg.toFixed(1)}kg</strong>
                    <small>{record.note}</small>
                  </div>
                  <button type="button" onClick={() => void removeWeight(record.id)}>
                    삭제
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="content-section">
            <div className="section-heading compact">
              <div>
                <span className="kicker">기간별 조회</span>
                <h2>언제 무엇을 먹었는지 확인</h2>
              </div>
              <FaIcon name="cutlery" size={20} />
            </div>
            <div className="date-filter-row">
              <label>
                시작
                <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
              </label>
              <label>
                종료
                <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
              </label>
            </div>
            {periodSummary ? (
              <>
                <div className="summary-grid">
                  <MetricCard label="기간 섭취" value={formatKcal(periodSummary.caloriesKcal)} helper={`${periodSummary.mealCount}개 기록`} />
                  <MetricCard label="기간 지출" value={formatWon(periodSummary.spentMoneyKrw)} helper="식단 기록 기준" tone="green" />
                  <MetricCard
                    label="하루 평균"
                    value={formatKcal(periodSummary.pattern.averageCaloriesPerDay)}
                    helper={periodSummary.pattern.mostFrequentMealType ? `${mealTypeLabel(periodSummary.pattern.mostFrequentMealType)} 기록이 많아요` : "패턴 없음"}
                    tone="blue"
                  />
                </div>
                <div className="day-summary-list">
                  {periodSummary.byDate.map((day) => (
                    <article key={day.date}>
                      <strong>{day.date}</strong>
                      <span>
                        {day.summary.mealCount}개 · {formatKcal(day.summary.caloriesKcal)} · {formatWon(day.summary.spentMoneyKrw)}
                      </span>
                    </article>
                  ))}
                </div>
                {periodSummary.mealCount ? (
                  <MealList meals={periodSummary.byDate.flatMap((day) => day.meals).reverse()} onDelete={(id) => void removeMeal(id)} />
                ) : (
                  <EmptyState title="기간 내 기록 없음" description="식단을 추가하면 이곳에서 날짜별로 확인할 수 있습니다." />
                )}
              </>
            ) : null}
          </section>

          <form className="form-panel" onSubmit={submitMeal}>
            <label>
              <span>음식</span>
              <select value={selectedFoodId} onChange={(event) => setSelectedFoodId(Number(event.target.value))}>
                {foods.map((food) => (
                  <option key={food.id} value={food.id}>
                    {food.name} · {formatWon(food.priceKrw)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>식사 시간</span>
              <select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}>
                {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((type) => (
                  <option key={type} value={type}>
                    {mealTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>먹은 시간</span>
              <input name="consumedAt" type="datetime-local" defaultValue={`${todayISO()}T18:30`} />
            </label>
            <button className="primary-action" type="submit">
              <FaIcon name="plus" size={17} />
              식단 저장
            </button>
          </form>
        </>
      )}
    </div>
  );
}
