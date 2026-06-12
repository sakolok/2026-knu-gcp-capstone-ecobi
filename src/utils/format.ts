import type { GoalType, MealChannel, MealType } from "../types/domain";

export const won = new Intl.NumberFormat("ko-KR");

export function formatWon(value: number) {
  return `${won.format(Math.round(value))}원`;
}

export function formatKcal(value: number) {
  return `${won.format(Math.round(value))}kcal`;
}

export function formatGram(value: number) {
  return `${Number(value.toFixed(1))}g`;
}

export function mealTypeLabel(value: MealType) {
  return {
    breakfast: "아침",
    lunch: "점심",
    dinner: "저녁",
    snack: "간식",
  }[value];
}

export function goalLabel(value: GoalType) {
  return {
    maintain: "유지",
    cut: "감량",
    bulk: "증량",
  }[value];
}

export function channelLabel(value: MealChannel) {
  return {
    convenience_store: "편의점",
    cafeteria: "외식",
    home_meal: "집밥",
    delivery: "배달",
  }[value];
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}
