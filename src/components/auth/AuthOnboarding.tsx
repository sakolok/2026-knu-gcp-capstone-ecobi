import { FormEvent, useMemo, useState } from "react";
import { completeOnboarding, login, signup, type AuthSession, type OnboardingInput } from "../../services/ecobiService";
import type { GoalType, MealChannel } from "../../types/domain";
import { formatWon } from "../../utils/format";
import { writeStoredAuthSession } from "../../api/client";

type Props = {
  initialSession: AuthSession | null;
  onComplete: (session: AuthSession) => void;
};

type Draft = OnboardingInput & {
  dislikedText: string;
};

type BodyNumberKey = "heightCm" | "weightKg" | "targetWeightKg";
type BodyNumberInputs = Record<BodyNumberKey, string>;

type StepKey =
  | "displayName"
  | "birthDate"
  | "sex"
  | "heightCm"
  | "weightGoals"
  | "goalType"
  | "activityLevel"
  | "dietType"
  | "mealTimes"
  | "allergies"
  | "dislikedFoods"
  | "budgetChannels";

const steps: Array<{ key: StepKey; group: string; title: string; helper: string }> = [
  { key: "displayName", group: "기본 정보", title: "어떻게 불러드릴까요?", helper: "대시보드와 기록 화면에서 사용할 이름을 입력해요." },
  { key: "birthDate", group: "기본 정보", title: "나이 계산용 생년월일", helper: "목표 칼로리를 계산할 때만 사용합니다." },
  { key: "sex", group: "기본 정보", title: "성별 선택", helper: "기초대사량 계산 기준을 맞추기 위해 필요해요." },
  { key: "heightCm", group: "몸 기준", title: "키 입력", helper: "현재 몸무게와 함께 목표 칼로리를 계산합니다." },
  { key: "weightGoals", group: "몸 기준", title: "현재와 목표 몸무게", helper: "처음 시작할 몸무게와 목표를 함께 저장합니다." },
  { key: "goalType", group: "목표", title: "목표 선택", helper: "감량, 유지, 증량 중 하나를 선택해요." },
  { key: "activityLevel", group: "목표", title: "평소 활동량", helper: "하루 기준 칼로리를 현실적으로 맞추기 위해 필요해요." },
  { key: "budgetChannels", group: "식비 기준", title: "주간 예산과 식사 방식", helper: "추천 식단의 가격과 구매 경로를 맞춥니다." },
];

const goalOptions: Array<{ id: GoalType; label: string; helper: string }> = [
  { id: "maintain", label: "체중 유지", helper: "현재 리듬을 무리 없이 유지" },
  { id: "cut", label: "감량", helper: "하루 약 300kcal 낮게 계획" },
  { id: "bulk", label: "증량", helper: "하루 약 250kcal 높게 계획" },
];

const activityOptions: Array<{ id: OnboardingInput["activityLevel"]; label: string; helper: string }> = [
  { id: "sedentary", label: "거의 앉아서 생활", helper: "대부분 앉아서 보내요" },
  { id: "light", label: "가벼운 활동", helper: "짧은 산책이나 이동이 있어요" },
  { id: "moderate", label: "주 3~5회 운동", helper: "규칙적으로 운동해요" },
  { id: "active", label: "운동량이 많음", helper: "운동이나 활동이 많은 편이에요" },
];

const dietOptions = ["균형 건강식", "체지방 감량", "근력 운동식", "키토 식단"];
const allergyOptions = ["없음", "우유", "계란", "밀", "땅콩", "해산물", "대두", "복숭아"];
const channelOptions: Array<{ id: MealChannel; label: string }> = [
  { id: "convenience_store", label: "편의점" },
  { id: "cafeteria", label: "외식" },
  { id: "home_meal", label: "집밥" },
  { id: "delivery", label: "배달" },
];

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function parseBirthDateParts(value?: string) {
  if (!value) return { year: "", month: "", day: "" };
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return { year: "", month: "", day: "" };
  return { year: String(year), month: String(month), day: String(day) };
}

function buildBirthDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function isValidBirthDate(value: string) {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return false;
  const [year, month, day] = parts;
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return false;
  const today = new Date();
  const minDate = addYears(today, -120);
  return parsed <= today && parsed >= minDate;
}

function createInitialDraft(session: AuthSession | null): Draft {
  const displayName = session?.displayName && session.displayName !== "사용자" ? session.displayName : "";
  return {
    displayName,
    birthDate: "",
    sex: "female",
    heightCm: 160,
    weightKg: 55,
    targetWeightKg: 51,
    goalType: "cut",
    activityLevel: "light",
    dietType: "균형 건강식",
    mealTimes: {
      breakfast: "08:00",
      lunch: "12:00",
      dinner: "18:00",
    },
    allergies: ["없음"],
    dislikedFoods: [],
    dislikedText: "",
    weeklyBudgetKrw: 75000,
    availableMealChannels: ["home_meal"],
  };
}

function formatBodyNumberInput(value: number) {
  return Number(value.toFixed(1)).toString();
}

function createBodyNumberInputs(draft: Draft): BodyNumberInputs {
  return {
    heightCm: formatBodyNumberInput(draft.heightCm),
    weightKg: formatBodyNumberInput(draft.weightKg),
    targetWeightKg: formatBodyNumberInput(draft.targetWeightKg),
  };
}

function isBodyNumberInRange(rawValue: string, min: number, max: number) {
  const value = Number(rawValue);
  return rawValue.trim() !== "" && Number.isFinite(value) && value >= min && value <= max;
}

function normalizeBodyNumberInput(rawValue: string) {
  const numeric = rawValue.replace(/[^\d.]/g, "");
  const [integerPart, ...decimalParts] = numeric.split(".");
  return decimalParts.length ? `${integerPart}.${decimalParts.join("")}` : integerPart;
}

function clampBodyNumber(value: number, min: number, max: number) {
  const nextValue = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
  return Number(nextValue.toFixed(1));
}

function toStoredSession(session: AuthSession) {
  return {
    userId: session.userId,
    email: session.email,
    displayName: session.displayName,
    profileComplete: session.profileComplete,
  };
}

function splitTextList(text: string) {
  return text
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAgeYears(birthDate?: string) {
  if (!birthDate || !isValidBirthDate(birthDate)) return 25;
  const [year, month, day] = birthDate.split("-").map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  const beforeBirthday = today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

function getTargetCalories(draft: Draft) {
  const activityFactor: Record<Draft["activityLevel"], number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    athlete: 1.9,
  };
  const age = getAgeYears(draft.birthDate);
  const bmr = 10 * draft.weightKg + 6.25 * draft.heightCm - 5 * age + (draft.sex === "male" ? 5 : -161);
  const tdee = bmr * activityFactor[draft.activityLevel];
  const delta = draft.goalType === "cut" ? -300 : draft.goalType === "bulk" ? 250 : 0;
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    target: Math.round(tdee + delta),
  };
}

export function AuthOnboarding({ initialSession, onComplete }: Props) {
  const [session, setSession] = useState<AuthSession | null>(initialSession);
  const [mode, setMode] = useState<"welcome" | "login" | "signup" | "onboarding">(
    initialSession?.profileComplete === false ? "onboarding" : "welcome",
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => createInitialDraft(initialSession));
  const [bodyNumberInputs, setBodyNumberInputs] = useState<BodyNumberInputs>(() => createBodyNumberInputs(createInitialDraft(initialSession)));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const step = steps[stepIndex];
  const progress = useMemo(() => Math.round(((stepIndex + 1) / steps.length) * 100), [stepIndex]);
  const birthDateMax = toDateInputValue(new Date());
  const birthDateMin = toDateInputValue(addYears(new Date(), -120));
  const currentYear = new Date().getFullYear();
  const birthYearOptions = useMemo(() => Array.from({ length: 121 }, (_, index) => currentYear - index), [currentYear]);
  const birthMonthOptions = useMemo(() => Array.from({ length: 12 }, (_, index) => index + 1), []);
  const birthParts = parseBirthDateParts(draft.birthDate);
  const selectedBirthYear = Number(birthParts.year || currentYear - 25);
  const selectedBirthMonth = Number(birthParts.month || 1);
  const birthDayOptions = useMemo(
    () => Array.from({ length: daysInMonth(selectedBirthYear, selectedBirthMonth) }, (_, index) => index + 1),
    [selectedBirthMonth, selectedBirthYear],
  );

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const nextSession = await login({
        loginId: String(form.get("ecobiLoginId") ?? ""),
        password: String(form.get("ecobiPassword") ?? ""),
      });
      writeStoredAuthSession(toStoredSession(nextSession));
      setSession(nextSession);
      const nextDraft = createInitialDraft(nextSession);
      setDraft(nextDraft);
      setBodyNumberInputs(createBodyNumberInputs(nextDraft));
      if (nextSession.profileComplete) onComplete(nextSession);
      else setMode("onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("ecobiSignupPassword") ?? "");
    const passwordConfirm = String(form.get("ecobiSignupPasswordConfirm") ?? "");

    if (password !== passwordConfirm) {
      setBusy(false);
      setError("비밀번호가 서로 다릅니다.");
      return;
    }

    try {
      const nextSession = await signup({
        loginId: String(form.get("ecobiSignupLoginId") ?? ""),
        password,
      });
      writeStoredAuthSession(toStoredSession(nextSession));
      setSession(nextSession);
      const nextDraft = createInitialDraft(nextSession);
      setDraft(nextDraft);
      setBodyNumberInputs(createBodyNumberInputs(nextDraft));
      setStepIndex(0);
      setMode("onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOnboarding() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const nextSession = await completeOnboarding({
        ...draft,
        birthDate: draft.birthDate || undefined,
        displayName: draft.displayName.trim() || session.displayName || "사용자",
        dislikedFoods: splitTextList(draft.dislikedText),
      });
      writeStoredAuthSession(toStoredSession(nextSession));
      onComplete(nextSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : "온보딩 정보를 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  function updateDraft<T extends keyof Draft>(key: T, value: Draft[T]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateBirthDatePart(part: "year" | "month" | "day", value: string) {
    if (!value) {
      updateDraft("birthDate", "");
      return;
    }
    const year = part === "year" ? Number(value) : Number(birthParts.year || currentYear - 25);
    const month = part === "month" ? Number(value) : Number(birthParts.month || 1);
    const maxDay = daysInMonth(year, month);
    const day = part === "day" ? Number(value) : Math.min(Number(birthParts.day || 1), maxDay);
    updateDraft("birthDate", buildBirthDate(year, month, day));
  }

  function updateNumberInput(key: BodyNumberKey, rawValue: string, min: number, max: number) {
    const nextRawValue = normalizeBodyNumberInput(rawValue);
    setBodyNumberInputs((current) => ({ ...current, [key]: nextRawValue }));
    if (isBodyNumberInRange(nextRawValue, min, max)) {
      setDraft((current) => ({ ...current, [key]: Number(Number(nextRawValue).toFixed(1)) }));
    }
  }

  function updateNumberDraft(key: BodyNumberKey, value: number, min: number, max: number) {
    const nextValue = clampBodyNumber(value, min, max);
    setDraft((current) => ({ ...current, [key]: nextValue }));
    setBodyNumberInputs((current) => ({ ...current, [key]: formatBodyNumberInput(nextValue) }));
  }

  function nudgeNumberDraft(key: BodyNumberKey, delta: number, min: number, max: number) {
    updateNumberDraft(key, Number(draft[key]) + delta, min, max);
  }

  function focusedRange(value: number, min: number, max: number, spread: number) {
    return {
      min: Math.max(min, Math.floor(value - spread)),
      max: Math.min(max, Math.ceil(value + spread)),
    };
  }

  function toggleAllergy(value: string) {
    setDraft((current) => {
      if (value === "없음") return { ...current, allergies: ["없음"] };
      const next = new Set(current.allergies.filter((item) => item !== "없음"));
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...current, allergies: next.size ? Array.from(next) : ["없음"] };
    });
  }

  function toggleChannel(value: MealChannel) {
    setDraft((current) => {
      const next = new Set(current.availableMealChannels);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...current, availableMealChannels: next.size ? Array.from(next) : current.availableMealChannels };
    });
  }

  function validateCurrentStep() {
    if (step.key === "displayName" && !draft.displayName.trim()) {
      setError("이름 또는 별명을 입력해 주세요.");
      return false;
    }
    if (step.key === "birthDate") {
      if (!draft.birthDate) {
        setError("생년월일을 선택해 주세요.");
        return false;
      }
      if (!isValidBirthDate(draft.birthDate)) {
        setError("생년월일은 오늘 이전의 올바른 날짜로 입력해 주세요.");
        return false;
      }
    }
    if (step.key === "heightCm" && !isBodyNumberInRange(bodyNumberInputs.heightCm, 120, 230)) {
      setError("키는 120cm부터 230cm 사이로 입력해 주세요.");
      return false;
    }
    if (step.key === "heightCm") {
      updateNumberDraft("heightCm", Number(bodyNumberInputs.heightCm), 120, 230);
    }
    if (
      step.key === "weightGoals" &&
      (!isBodyNumberInRange(bodyNumberInputs.weightKg, 30, 250) || !isBodyNumberInRange(bodyNumberInputs.targetWeightKg, 30, 250))
    ) {
      setError("몸무게는 30kg부터 250kg 사이로 입력해 주세요.");
      return false;
    }
    if (step.key === "weightGoals") {
      updateNumberDraft("weightKg", Number(bodyNumberInputs.weightKg), 30, 250);
      updateNumberDraft("targetWeightKg", Number(bodyNumberInputs.targetWeightKg), 30, 250);
    }
    if (step.key === "budgetChannels") {
      if (!Number.isFinite(draft.weeklyBudgetKrw) || draft.weeklyBudgetKrw < 10000) {
        setError("주간 식비 예산을 10,000원 이상으로 설정해 주세요.");
        return false;
      }
      if (draft.availableMealChannels.length === 0) {
        setError("주로 이용하는 식사 방식을 하나 이상 선택해 주세요.");
        return false;
      }
    }
    setError("");
    return true;
  }

  function renderStepField() {
    if (step.key === "displayName") {
      return (
        <label className="auth-field">
          <span>이름 또는 별명</span>
          <input value={draft.displayName} onChange={(event) => updateDraft("displayName", event.target.value)} placeholder="예: 민아" />
        </label>
      );
    }

    if (step.key === "birthDate") {
      return (
        <div className="auth-date-picker" role="group" aria-label="생년월일 선택">
          <label>
            <span>연도</span>
            <select
              name="birthYear"
              aria-label="생년월일 연도"
              value={birthParts.year}
              onChange={(event) => updateBirthDatePart("year", event.target.value)}
            >
              <option value="">연도</option>
              {birthYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>월</span>
            <select
              name="birthMonth"
              aria-label="생년월일 월"
              value={birthParts.month}
              onChange={(event) => updateBirthDatePart("month", event.target.value)}
            >
              <option value="">월</option>
              {birthMonthOptions.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>일</span>
            <select
              name="birthDay"
              aria-label="생년월일 일"
              value={birthParts.day}
              onChange={(event) => updateBirthDatePart("day", event.target.value)}
            >
              <option value="">일</option>
              {birthDayOptions.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" min={birthDateMin} max={birthDateMax} value={draft.birthDate} readOnly />
        </div>
      );
    }

    if (step.key === "sex") {
      return (
        <div className="auth-choice-grid two">
          {[
            ["female", "여성"],
            ["male", "남성"],
          ].map(([id, label]) => (
            <button className={draft.sex === id ? "selected" : ""} key={id} type="button" onClick={() => updateDraft("sex", id as Draft["sex"])}>
              <strong>{label}</strong>
            </button>
          ))}
        </div>
      );
    }

    if (step.key === "heightCm") {
      const heightRange = focusedRange(draft.heightCm, 120, 230, 25);
      return (
        <div className="auth-number-card height-card">
          <span className="auth-direct-label">숫자로 직접 입력하거나 버튼으로 조절하세요.</span>
          <div className="auth-number-stepper">
            <button type="button" aria-label="키 0.5cm 줄이기" onClick={() => nudgeNumberDraft("heightCm", -0.5, 120, 230)}>
              -
            </button>
            <label>
              <input
                type="text"
                inputMode="decimal"
                value={bodyNumberInputs.heightCm}
                onChange={(event) => updateNumberInput("heightCm", event.target.value, 120, 230)}
              />
              <span>cm</span>
            </label>
            <button type="button" aria-label="키 0.5cm 늘리기" onClick={() => nudgeNumberDraft("heightCm", 0.5, 120, 230)}>
              +
            </button>
          </div>
          <input
            type="range"
            min={heightRange.min}
            max={heightRange.max}
            step="1"
            value={draft.heightCm}
            onChange={(event) => updateNumberDraft("heightCm", Number(event.target.value), 120, 230)}
          />
        </div>
      );
    }

    if (step.key === "weightGoals") {
      return (
        <div className="auth-weight-pair">
          {[
            ["weightKg", "현재 몸무게", "현재 기록"],
            ["targetWeightKg", "목표 몸무게", "목표 기록"],
          ].map(([key, label, caption]) => {
            const draftKey = key as "weightKg" | "targetWeightKg";
            const weightRange = focusedRange(draft[draftKey], 30, 250, 25);
            return (
              <div className="auth-number-card compact" key={key}>
                <span>{caption}</span>
                <div className="auth-number-stepper compact">
                  <button type="button" aria-label={`${label} 0.5kg 줄이기`} onClick={() => nudgeNumberDraft(draftKey, -0.5, 30, 250)}>
                    -
                  </button>
                  <label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={bodyNumberInputs[draftKey]}
                      onChange={(event) => updateNumberInput(draftKey, event.target.value, 30, 250)}
                    />
                    <span>kg</span>
                  </label>
                  <button type="button" aria-label={`${label} 0.5kg 늘리기`} onClick={() => nudgeNumberDraft(draftKey, 0.5, 30, 250)}>
                    +
                  </button>
                </div>
                <input
                  type="range"
                  min={weightRange.min}
                  max={weightRange.max}
                  step="1"
                  value={draft[draftKey]}
                  onChange={(event) => updateNumberDraft(draftKey, Number(event.target.value), 30, 250)}
                  aria-label={label}
                />
                <strong>{label}</strong>
              </div>
            );
          })}
        </div>
      );
    }

    if (step.key === "goalType") {
      return (
        <div className="auth-choice-list">
          {goalOptions.map((option) => (
            <button className={draft.goalType === option.id ? "selected" : ""} key={option.id} type="button" onClick={() => updateDraft("goalType", option.id)}>
              <strong>{option.label}</strong>
              <span>{option.helper}</span>
            </button>
          ))}
        </div>
      );
    }

    if (step.key === "activityLevel") {
      return (
        <div className="auth-choice-list">
          {activityOptions.map((option) => (
            <button
              className={draft.activityLevel === option.id ? "selected" : ""}
              key={option.id}
              type="button"
              onClick={() => updateDraft("activityLevel", option.id)}
            >
              <strong>{option.label}</strong>
              <span>{option.helper}</span>
            </button>
          ))}
        </div>
      );
    }

    if (step.key === "dietType") {
      return (
        <div className="auth-pill-grid">
          {dietOptions.map((option) => (
            <button className={draft.dietType === option ? "selected" : ""} key={option} type="button" onClick={() => updateDraft("dietType", option)}>
              {option}
            </button>
          ))}
        </div>
      );
    }

    if (step.key === "mealTimes") {
      return (
        <div className="auth-time-list">
          {[
            ["breakfast", "아침"],
            ["lunch", "점심"],
            ["dinner", "저녁"],
          ].map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                type="time"
                value={draft.mealTimes[key as keyof Draft["mealTimes"]]}
                onChange={(event) =>
                  updateDraft("mealTimes", {
                    ...draft.mealTimes,
                    [key]: event.target.value,
                  })
                }
              />
            </label>
          ))}
        </div>
      );
    }

    if (step.key === "allergies") {
      return (
        <div className="auth-pill-grid">
          {allergyOptions.map((option) => (
            <button className={draft.allergies.includes(option) ? "selected" : ""} key={option} type="button" onClick={() => toggleAllergy(option)}>
              {option}
            </button>
          ))}
        </div>
      );
    }

    if (step.key === "dislikedFoods") {
      return (
        <label className="auth-field">
          <span>비선호 음식</span>
          <textarea
            value={draft.dislikedText}
            onChange={(event) => updateDraft("dislikedText", event.target.value)}
            placeholder="예: 가지, 생양파, 고수"
          />
        </label>
      );
    }

    const energy = getTargetCalories(draft);

    return (
      <div className="auth-final-field">
        <div className="auth-budget-box">
          <span>주간 식비 예산</span>
          <strong>{formatWon(draft.weeklyBudgetKrw)}</strong>
          <input
            type="range"
            min="30000"
            max="500000"
            step="10000"
            value={draft.weeklyBudgetKrw}
            onChange={(event) => updateDraft("weeklyBudgetKrw", Number(event.target.value))}
          />
        </div>
        <div className="auth-pill-grid">
          {channelOptions.map((option) => (
            <button
              className={draft.availableMealChannels.includes(option.id) ? "selected" : ""}
              key={option.id}
              type="button"
              onClick={() => toggleChannel(option.id)}
            >
            {option.label}
            </button>
          ))}
        </div>
        <div className="auth-estimate-card">
          <span>식단 계획용 추정치</span>
          <dl>
            <div>
              <dt>BMR</dt>
              <dd>{energy.bmr.toLocaleString()}kcal</dd>
            </div>
            <div>
              <dt>TDEE</dt>
              <dd>{energy.tdee.toLocaleString()}kcal</dd>
            </div>
            <div>
              <dt>하루 목표</dt>
              <dd>{energy.target.toLocaleString()}kcal</dd>
            </div>
          </dl>
          <p>의학적 진단이 아니라 식비와 식단 추천을 위한 계획 기준이에요.</p>
        </div>
      </div>
    );
  }

  if (mode === "welcome") {
    return (
      <main className="phone-shell auth-shell welcome-shell" aria-label="Ecobi 시작">
        <section className="auth-welcome-screen">
          <header className="welcome-brand-row" aria-label="Ecobi">
            <span className="welcome-logo" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <strong>ecobi</strong>
          </header>

          <section className="welcome-landing" aria-label="서비스 소개">
            <div className="welcome-macro-visual" aria-label="탄수화물, 단백질, 지방 캐릭터">
              <img className="welcome-character carbs" src="/Img/carbs-fit.png" alt="탄수화물 캐릭터" />
              <img className="welcome-character protein" src="/Img/protein-fit.png" alt="단백질 캐릭터" />
              <img className="welcome-character fat" src="/Img/fat-fit.png" alt="지방 캐릭터" />
            </div>

            <div className="welcome-copy">
              <h1>내 식비에 맞는 오늘 식단</h1>
              <p>예산과 목표에 맞춰 건강한 식단을 추천해드려요.</p>
            </div>
          </section>

          <footer className="welcome-actions">
            <button className="welcome-primary" type="button" onClick={() => setMode("login")}>
              로그인
            </button>
            <button className="welcome-secondary" type="button" onClick={() => setMode("signup")}>
              회원가입
            </button>
          </footer>
        </section>
      </main>
    );
  }

  if (mode === "login") {
    return (
      <main className="phone-shell auth-shell" aria-label="Ecobi 로그인">
        <section className="auth-login-screen">
          <div className="auth-brand">
            <span className="auth-logo">
              <i className="auth-logo-seed" aria-hidden="true" />
              ecobi
            </span>
            <b>에코비</b>
          </div>
          <article className="auth-login-card">
            <h1>로그인</h1>
            <form onSubmit={submitLogin}>
              <label>
                <span>아이디</span>
                <input name="ecobiLoginId" type="text" placeholder="아이디" required autoComplete="username" spellCheck={false} />
              </label>
              <label>
                <span>비밀번호</span>
                <input name="ecobiPassword" type="password" placeholder="비밀번호" required autoComplete="current-password" />
              </label>
              {error ? <p className="auth-error">{error}</p> : null}
              <button className="auth-primary" type="submit" disabled={busy}>
                {busy ? "확인 중" : "로그인"}
              </button>
            </form>
            <button
              className="auth-text-action"
              type="button"
              onClick={() => {
                setError("");
                setMode("signup");
              }}
            >
              회원가입
            </button>
          </article>
        </section>
      </main>
    );
  }

  if (mode === "signup") {
    return (
      <main className="phone-shell auth-shell" aria-label="Ecobi 회원가입">
        <section className="auth-login-screen">
          <div className="auth-brand">
            <span className="auth-logo">
              <i className="auth-logo-seed" aria-hidden="true" />
              ecobi
            </span>
            <b>에코비</b>
          </div>
          <article className="auth-login-card">
            <h1>회원가입</h1>
            <p className="auth-form-hint">아이디와 비밀번호를 만들어요.</p>
            <form onSubmit={submitSignup}>
              <label>
                <span>아이디</span>
                <input name="ecobiSignupLoginId" type="text" placeholder="아이디" required autoComplete="username" spellCheck={false} />
              </label>
              <label>
                <span>비밀번호</span>
                <input name="ecobiSignupPassword" type="password" placeholder="비밀번호" required autoComplete="new-password" />
              </label>
              <label>
                <span>비밀번호 확인</span>
                <input name="ecobiSignupPasswordConfirm" type="password" placeholder="비밀번호 확인" required autoComplete="new-password" />
              </label>
              {error ? <p className="auth-error">{error}</p> : null}
              <button className="auth-primary" type="submit" disabled={busy}>
                {busy ? "가입 중" : "회원가입"}
              </button>
            </form>
            <button
              className="auth-text-action"
              type="button"
              onClick={() => {
                setError("");
                setMode("login");
              }}
            >
              로그인으로 돌아가기
            </button>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="phone-shell auth-shell" aria-label="Ecobi 온보딩">
      <section className="auth-wizard-screen">
        <header className="auth-wizard-top">
          <button type="button" onClick={() => setMode("login")}>
            이전
          </button>
          <span>{step.group}</span>
          <b>
            {stepIndex + 1}/{steps.length}
          </b>
        </header>
        <div className="auth-progress" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </div>

        <article className="auth-question-card">
          <span>{step.group}</span>
          <h1>{step.title}</h1>
          <p>{step.helper}</p>
        </article>

        <div className="auth-field-area">{renderStepField()}</div>

        {error ? <p className="auth-error">{error}</p> : null}

        <footer className={`auth-actions ${stepIndex === 0 ? "single" : ""}`}>
          {stepIndex > 0 ? (
            <button className="auth-secondary" type="button" onClick={() => setStepIndex((current) => Math.max(0, current - 1))}>
              이전
            </button>
          ) : null}
          <button
            className="auth-primary"
            type="button"
            disabled={busy}
            onClick={() => {
              if (!validateCurrentStep()) return;
              if (stepIndex < steps.length - 1) setStepIndex((current) => current + 1);
              else void submitOnboarding();
            }}
          >
            {busy ? "저장 중" : stepIndex === steps.length - 1 ? "저장하고 시작" : "다음"}
          </button>
        </footer>
      </section>
    </main>
  );
}
