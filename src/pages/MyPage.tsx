import { FormEvent, useState } from "react";
import { FaIcon } from "../components/common/FaIcon";
import { MetricCard } from "../components/common/MetricCard";
import { SegmentedControl } from "../components/common/SegmentedControl";
import { updateGoal } from "../services/ecobiService";
import type { GoalType, UserProfile } from "../types/domain";
import { formatKcal, formatWon, goalLabel } from "../utils/format";

type MyPageProps = {
  profile: UserProfile;
  onChanged: () => Promise<void>;
};

export function MyPage({ profile, onChanged }: MyPageProps) {
  const [goalType, setGoalType] = useState<GoalType>(profile.goalType);
  const [message, setMessage] = useState<string | null>(null);

  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await updateGoal({
      goalType,
      targetWeightKg: Number(form.get("targetWeightKg")),
      targetCaloriesKcal: Number(form.get("targetCaloriesKcal")),
      targetCalorieDeltaKcal: goalType === "cut" ? -300 : goalType === "bulk" ? 250 : 0,
      weeklyBudgetKrw: Number(form.get("weeklyBudgetKrw")),
    });
    setMessage("목표 기준을 업데이트했습니다.");
    await onChanged();
  }

  return (
    <div className="page-stack">
      <section className="page-header profile-header">
        <span className="kicker">마이</span>
        <h1>{profile.displayName}님의 기준</h1>
        <p>추천은 아래 목표, 예산, 활동량을 기준으로 계산됩니다.</p>
      </section>

      <section className="summary-grid">
        <MetricCard label="목표" value={goalLabel(profile.goalType)} helper={`${profile.currentWeightKg.toFixed(1)}kg → ${profile.targetWeightKg.toFixed(1)}kg`} />
        <MetricCard label="하루 목표" value={formatKcal(profile.targetCaloriesKcal)} helper="식단 계획용 추정치" tone="yellow" />
        <MetricCard label="주간 예산" value={formatWon(profile.weeklyBudgetKrw)} helper="추천 예산 기준" tone="green" />
      </section>

      <section className="content-section">
        <div className="section-heading compact">
          <div>
            <span className="kicker">계산 기준</span>
            <h2>BMR/TDEE 추정치</h2>
          </div>
          <FaIcon name="calculator" size={20} />
        </div>
        <div className="detail-grid">
          <span>성별 / 나이</span>
          <strong>
            {profile.sex === "female" ? "여자" : "남자"} · {profile.ageYearsSnapshot}세
          </strong>
          <span>신장</span>
          <strong>{profile.heightCm}cm</strong>
          <span>BMR</span>
          <strong>{formatKcal(profile.bmrKcal)}</strong>
          <span>TDEE</span>
          <strong>{formatKcal(profile.tdeeKcal)}</strong>
        </div>
        <p className="estimate-note">의학적 진단이 아니라 식비와 식사 추천을 맞추기 위한 계획 기준입니다.</p>
      </section>

      <section className="content-section">
        <div className="section-heading compact">
          <div>
            <span className="kicker">선호 정보</span>
            <h2>추천에 반영되는 신호</h2>
          </div>
          <FaIcon name="heartbeat" size={20} />
        </div>
        <div className="preference-grid">
          <article>
            <strong>선호 음식</strong>
            <p>{profile.preferredFoods.join(", ") || "없음"}</p>
          </article>
          <article>
            <strong>비선호 음식</strong>
            <p>{profile.dislikedFoods.join(", ") || "없음"}</p>
          </article>
          <article>
            <strong>알레르기</strong>
            <p>{profile.allergies.join(", ") || "없음"}</p>
          </article>
        </div>
      </section>

      <form className="form-panel" onSubmit={submitGoal}>
        <div className="form-title">
          <FaIcon name="check-circle-o" size={18} />
          <strong>목표 수정</strong>
        </div>
        <SegmentedControl
          label="목표 선택"
          value={goalType}
          onChange={setGoalType}
          options={[
            { label: "유지", value: "maintain" },
            { label: "감량", value: "cut" },
            { label: "증량", value: "bulk" },
          ]}
        />
        <label>
          <span>목표 체중 kg</span>
          <input name="targetWeightKg" type="number" step="0.1" defaultValue={profile.targetWeightKg} />
        </label>
        <label>
          <span>하루 목표 kcal</span>
          <input name="targetCaloriesKcal" type="number" defaultValue={profile.targetCaloriesKcal} />
        </label>
        <label>
          <span>주간 식비 예산</span>
          <input name="weeklyBudgetKrw" type="number" defaultValue={profile.weeklyBudgetKrw} />
        </label>
        <button className="primary-action" type="submit">
          <FaIcon name="credit-card" size={17} />
          기준 저장
        </button>
      </form>
      {message ? <p className="inline-message">{message}</p> : null}
    </div>
  );
}
