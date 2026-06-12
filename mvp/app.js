const meals = [
  {
    id: 1,
    category: "편의점",
    name: "닭가슴살 샌드위치",
    price: 3500,
    kcal: 335,
    carbs: 34,
    protein: 28,
    fat: 8,
    tags: ["고단백", "저지방", "포만감"],
    allergies: ["밀", "우유"],
  },
  {
    id: 2,
    category: "편의점",
    name: "감동란",
    price: 2100,
    kcal: 128,
    carbs: 21,
    protein: 14,
    fat: 4,
    tags: ["고단백", "저지방", "포만감"],
    allergies: ["계란"],
  },
  {
    id: 3,
    category: "편의점",
    name: "직화제육 삼각김밥",
    price: 2500,
    kcal: 432,
    carbs: 53,
    protein: 25,
    fat: 18,
    tags: ["고단백", "고지방", "포만감"],
    allergies: ["대두", "밀"],
  },
  {
    id: 4,
    category: "편의점",
    name: "치킨텐더 샐러드",
    price: 3900,
    kcal: 412,
    carbs: 35,
    protein: 28,
    fat: 24,
    tags: ["고단백", "균형식"],
    allergies: ["계란", "밀"],
  },
  {
    id: 5,
    category: "외식",
    name: "닭가슴살 샐러드",
    price: 6500,
    kcal: 420,
    carbs: 25,
    protein: 32,
    fat: 12,
    tags: ["고단백", "회복식"],
    time: "점심",
    allergies: [],
  },
  {
    id: 6,
    category: "외식",
    name: "참치김밥 외 1개",
    price: 4300,
    kcal: 510,
    carbs: 62,
    protein: 28,
    fat: 16,
    tags: ["가성비", "균형식"],
    time: "저녁",
    allergies: ["계란", "밀"],
  },
  {
    id: 7,
    category: "집밥",
    name: "삶은계란 + 저당두유",
    price: 6300,
    kcal: 278,
    carbs: 19,
    protein: 26,
    fat: 11,
    tags: ["단백질 풍부", "가벼움"],
    allergies: ["계란", "대두"],
  },
  {
    id: 8,
    category: "집밥",
    name: "현미밥 닭안심 도시락",
    price: 4800,
    kcal: 462,
    carbs: 58,
    protein: 31,
    fat: 10,
    tags: ["균형식", "저지방"],
    allergies: ["대두"],
  },
];

let foodPreferences = ["닭가슴살", "샐러드", "현미밥"];
let dislikedFoods = ["튀김류", "매운 음식"];
const allergyOptions = ["계란", "우유", "대두", "밀", "땅콩", "갑각류", "생선", "복숭아"];

const dietHistory = [
  { id: 1, date: "2026-05-20", dietName: "닭가슴살 샌드위치", mealType: "점심", kcal: 335, price: 3500 },
  { id: 2, date: "2026-05-18", dietName: "현미밥 닭안심 도시락", mealType: "저녁", kcal: 462, price: 4800 },
  { id: 3, date: "2026-05-11", dietName: "닭가슴살 샌드위치", mealType: "아침", kcal: 335, price: 3500 },
  { id: 4, date: "2026-05-02", dietName: "오트밀 요거트볼", mealType: "아침", kcal: 286, price: 3200 },
  { id: 5, date: "2026-04-14", dietName: "참치김밥 외 1개", mealType: "점심", kcal: 510, price: 4300 },
  { id: 6, date: "2026-03-29", dietName: "치킨텐더 샐러드", mealType: "저녁", kcal: 412, price: 3900 },
];

const weightHistory = [
  { id: 1, date: "2026-05-20", weight: 56.4, memo: "아침 공복" },
  { id: 2, date: "2026-05-13", weight: 56.7, memo: "운동 후" },
];

const budgetHistory = [{ id: 1, date: "2026-05-20", weeklyBudget: 100000, spent: 58700 }];

const state = {
  activeScreen: "home",
  recordMode: "diet",
  activeFoodTab: "frequent",
  selectedMealType: "아침",
  selectedCategory: "편의점",
  sortByBudget: false,
  favorites: new Set(),
  selectedRecordFoods: new Set(),
  weeklyBudget: 100000,
  spent: 58700,
  heightCm: 162,
  age: 24,
  gender: "여자",
  userName: "김민아",
  profilePhoto: "",
  goal: "감량",
  allergies: ["계란", "우유"],
  pendingMeals: [],
  calorieGoal: 1344,
  currentWeight: 56.4,
  previousWeight: 56.7,
  calories: 0,
  carbs: 0,
  protein: 0,
  fat: 0,
  records: [],
};

const won = new Intl.NumberFormat("ko-KR");

const screens = document.querySelectorAll(".screen");
const navButtons = document.querySelectorAll("[data-nav]");
const bottomNav = document.querySelector(".bottom-nav");
const quickAdd = document.querySelector("#quickAdd");
const fabButton = document.querySelector("#fabButton");
const weightModal = document.querySelector("#weightModal");
const budgetModal = document.querySelector("#budgetModal");
const weightForm = document.querySelector("#weightForm");
const budgetForm = document.querySelector("#budgetForm");
const profileModal = document.querySelector("#profileModal");
const goalModal = document.querySelector("#goalModal");
const calorieModal = document.querySelector("#calorieModal");
const bodyModal = document.querySelector("#bodyModal");
const genderModal = document.querySelector("#genderModal");
const ageModal = document.querySelector("#ageModal");
const allergyModal = document.querySelector("#allergyModal");
const mealDetailModal = document.querySelector("#mealDetailModal");
const successModal = document.querySelector("#successModal");
const profileForm = document.querySelector("#profileForm");
const calorieForm = document.querySelector("#calorieForm");
const bodyForm = document.querySelector("#bodyForm");
const ageForm = document.querySelector("#ageForm");
const allergyForm = document.querySelector("#allergyForm");
const mealDetailForm = document.querySelector("#mealDetailForm");

function formatWon(value) {
  return `${won.format(value)}원`;
}

function parseNumberInput(value) {
  return Number(String(value).replace(/,/g, "").trim());
}

function mealById(id) {
  return meals.find((meal) => meal.id === Number(id));
}

function namesMatch(source, target) {
  return source === target || source.includes(target) || target.includes(source);
}

function setScreen(screen) {
  state.activeScreen = screen;
  screens.forEach((item) => item.classList.toggle("active", item.dataset.screen === screen));
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.nav === screen));
  document.querySelector(".phone-shell").dataset.activeScreen = screen;
  window.scrollTo(0, 0);
  closeQuickAdd();
}

function openQuickAdd() {
  quickAdd.classList.add("open");
  quickAdd.setAttribute("aria-hidden", "false");
  bottomNav.classList.add("adding");
}

function closeQuickAdd() {
  quickAdd.classList.remove("open");
  quickAdd.setAttribute("aria-hidden", "true");
  bottomNav.classList.remove("adding");
}

function toggleQuickAdd() {
  if (quickAdd.classList.contains("open")) {
    closeQuickAdd();
    return;
  }
  openQuickAdd();
}

function openModal(modal) {
  closeQuickAdd();
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function openBudgetModal() {
  document.querySelector("#budgetInput").value = state.weeklyBudget;
  document.querySelector("#spentInput").value = state.spent;
  openModal(budgetModal);
}

function openAllergyModal() {
  const customAllergies = state.allergies.filter((name) => !allergyOptions.includes(name));
  document.querySelectorAll("[data-allergy-option]").forEach((input) => {
    input.checked = state.allergies.includes(input.value);
  });
  document.querySelector("#allergyInput").value = customAllergies.join(", ");
  openModal(allergyModal);
}

function closeModal() {
  document.querySelectorAll(".entry-modal.open").forEach((modal) => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  });
}

function todayText() {
  return "2026-05-20";
}

function calculateBmr() {
  const base = 10 * state.currentWeight + 6.25 * state.heightCm - 5 * state.age;
  return Math.round(base + (state.gender === "남자" ? 5 : -161));
}

function setRecordMode(mode, shouldScroll = true) {
  state.recordMode = mode;
  document.querySelectorAll("[data-record-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.recordMode === mode);
  });
  document.querySelectorAll("[data-record-section]").forEach((section) => {
    section.classList.toggle("active", section.dataset.recordSection === mode);
  });
  const titles = { diet: "오늘의 식단", weight: "체중 기록", budget: "예산 입력" };
  document.querySelector("#recordTitle").textContent = titles[mode];
  document.querySelector(".phone-shell").dataset.recordMode = mode;
  if (shouldScroll) window.scrollTo(0, 0);
}

function addMealToState(meal) {
  state.spent += meal.price;
  state.calories += meal.kcal;
  state.carbs += meal.carbs;
  state.protein += meal.protein;
  state.fat += meal.fat;
  state.records.unshift({
    name: meal.name,
    kcal: meal.kcal,
    price: meal.price,
    mealType: state.selectedMealType,
  });
  dietHistory.unshift({
    id: Date.now(),
    date: "2026-05-20",
    dietName: meal.name,
    mealType: state.selectedMealType,
    kcal: meal.kcal,
    price: meal.price,
  });
}

function recordMeal(meal) {
  showMealDetail(meal);
}

function recordSelectedMeals() {
  const selectedMeals = [...state.selectedRecordFoods].map((id) => mealById(id)).filter(Boolean);
  if (selectedMeals.length === 0) return;
  showMealDetail(selectedMeals);
}

function confirmPendingMeals() {
  state.pendingMeals.forEach((meal) => addMealToState(meal));
  state.selectedRecordFoods.clear();
  const totalKcal = state.pendingMeals.reduce((sum, meal) => sum + meal.kcal, 0);
  const names = state.pendingMeals.map((meal) => meal.name).join(", ");
  state.pendingMeals = [];
  closeModal();
  render();
  setRecordMode("diet", false);
  document.querySelector("#successText").textContent = `${names} ${won.format(totalKcal)}kcal를 오늘 기록에 추가했어요.`;
  openModal(successModal);
}

function showMealDetail(mealOrMeals) {
  const selectedMeals = Array.isArray(mealOrMeals) ? mealOrMeals : [mealOrMeals];
  state.pendingMeals = selectedMeals.filter(Boolean);
  if (state.pendingMeals.length === 0) return;
  const total = state.pendingMeals.reduce(
    (acc, meal) => ({
      price: acc.price + meal.price,
      kcal: acc.kcal + meal.kcal,
      carbs: acc.carbs + meal.carbs,
      protein: acc.protein + meal.protein,
      fat: acc.fat + meal.fat,
    }),
    { price: 0, kcal: 0, carbs: 0, protein: 0, fat: 0 },
  );
  const names = state.pendingMeals.map((meal) => meal.name).join(", ");
  const allergyText = [...new Set(state.pendingMeals.flatMap((meal) => meal.allergies))].join(", ") || "없음";
  document.querySelector("#mealDetailName").textContent = names;
  document.querySelector("#mealDetailBody").innerHTML = `
    <span>식사 시간</span><strong>${state.selectedMealType}</strong>
    <span>예상 비용</span><strong>${formatWon(total.price)}</strong>
    <span>칼로리</span><strong>${won.format(total.kcal)}kcal</strong>
    <span>탄/단/지</span><strong>${total.carbs}g / ${total.protein}g / ${total.fat}g</strong>
    <span>알레르기</span><strong>${allergyText}</strong>
  `;
  openModal(mealDetailModal);
}

function renderSummary() {
  const budgetLeft = Math.max(state.weeklyBudget - state.spent, 0);
  const calorieRatio = Math.min((state.calories / 1240) * 100, 100);
  const weightDelta = state.currentWeight - state.previousWeight;
  const bmi = state.currentWeight / (state.heightCm / 100) ** 2;
  const bmr = calculateBmr();
  const homeGoal = 1240;
  document.querySelector("#homeCalories").textContent = won.format(state.calories);
  document.querySelector("#homeGoalCalories").textContent = won.format(homeGoal);
  document.querySelector("#homeRemaining").textContent = `${won.format(Math.max(homeGoal - state.calories, 0))}kcal 더 먹어도 돼요`;
  document.querySelector("#recordCalories").textContent = `${won.format(state.calories)}kcal`;
  document.querySelector("#recordSpend").textContent = formatWon(state.spent);
  document.querySelector("#recordBudgetLeft").textContent = formatWon(budgetLeft);
  document.querySelector("#homeBudget").textContent = formatWon(budgetLeft);
  document.querySelector("#recommendBudget").textContent = formatWon(budgetLeft);
  document.querySelector("#weeklyBudgetText").textContent = formatWon(state.weeklyBudget);
  document.querySelector("#dailyBudgetText").textContent = `일일 평균 약 ${formatWon(Math.round(state.weeklyBudget / 7 / 100) * 100)}`;
  document.querySelector("#recordWeeklyBudget").textContent = formatWon(state.weeklyBudget);
  document.querySelector("#recordBudgetUsed").textContent = `사용 ${formatWon(state.spent)}`;
  const todaySpendable = Math.max(Math.round((budgetLeft / 7) / 100) * 100, 0);
  const remainingDays = 4;
  const dailyLeft = Math.max(Math.round((budgetLeft / remainingDays) / 100) * 100, 0);
  document.querySelector("#dailySpendableText").textContent = `오늘 사용 가능 ${formatWon(todaySpendable)}`;
  document.querySelector("#budgetPaceText").textContent = `남은 ${remainingDays}일 동안 하루 약 ${formatWon(dailyLeft)}까지 사용할 수 있어요.`;
  document.querySelector("#weeklySpentSummary").textContent = `이번 주 사용 ${formatWon(state.spent)} · 잔액 ${formatWon(budgetLeft)}`;
  document.querySelector("#calorieGoalText").textContent = `${won.format(state.calorieGoal)} kcal`;
  document.querySelector("#bmrText").textContent = `BMR ${won.format(bmr)} kcal`;
  document.querySelector("#goalText").textContent = state.goal;
  document.querySelector("#genderText").textContent = state.gender;
  document.querySelector("#ageText").textContent = `${state.age}세`;
  document.querySelector(".profile-row h1").textContent = `${state.userName} 님`;
  document.querySelector(".home-sheet h1 strong").textContent = `${state.userName}님,`;
  document.querySelector(".avatar").textContent = state.profilePhoto ? "" : state.userName.slice(0, 1);
  document.querySelector(".avatar").style.backgroundImage = state.profilePhoto ? `url("${state.profilePhoto}")` : "";
  document.querySelector("#currentWeight").textContent = state.currentWeight.toFixed(1);
  document.querySelector("#recordWeight").textContent = state.currentWeight.toFixed(1);
  document.querySelector("#weightDelta").textContent = `이전보다 ${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} kg`;
  document.querySelector("#bmiText").textContent = `나의 BMI : ${bmi.toFixed(1)} ⓘ`;
  document.querySelector("#profileBodyText").textContent = `${state.heightCm}cm / ${state.currentWeight.toFixed(1)}kg`;
  document.querySelector("#calorieProgress").style.width = `${calorieRatio}%`;
  document.querySelector("#carbNow").textContent = state.carbs;
  document.querySelector("#proteinNow").textContent = state.protein;
  document.querySelector("#fatNow").textContent = state.fat;
}

function createTags(tags) {
  return tags.map((tag) => `<span class="tag">${tag}</span>`).join("");
}

function createAllergyText(allergies) {
  return allergies.length ? `알레르기 ${allergies.join(", ")}` : "알레르기 정보 없음";
}

function mealCard(meal) {
  const budgetLeft = Math.max(state.weeklyBudget - state.spent - meal.price, 0);
  return `
    <article class="meal-card">
      <header>
        <h3>🍴 ${meal.name}</h3>
      </header>
      <div class="meta">
        <strong class="price">${formatWon(meal.price)}</strong>
        <span>잔액 ${formatWon(budgetLeft)}</span>
      </div>
      <div class="tags">${createTags(meal.tags.slice(0, 2))}</div>
      <p class="allergy-note">${createAllergyText(meal.allergies)}</p>
      <p class="kcal">${won.format(meal.kcal)}kcal</p>
      <a class="primary" href="#meal-${meal.id}" data-record-link="${meal.id}">이 식사 기록</a>
    </article>
  `;
}

function mealItem(meal) {
  const isFavorite = state.favorites.has(meal.id);
  return `
    <article class="meal-item">
      <span class="category">${meal.category}</span>
      <button class="heart ${isFavorite ? "active" : ""}" type="button" data-favorite="${meal.id}" aria-label="즐겨찾기"></button>
      <strong class="price">${formatWon(meal.price)}</strong>
      <h3>${meal.name}</h3>
      <div class="meta">
        <span>${won.format(meal.kcal)} kcal</span>
        <span>|</span>
        <span>• 탄 ${meal.carbs}g</span>
        <span>• 단 ${meal.protein}g</span>
        <span>• 지 ${meal.fat}g</span>
      </div>
      <div class="tags">${createTags(meal.tags)}</div>
      <p class="allergy-note">${createAllergyText(meal.allergies)}</p>
      <a class="primary" href="#meal-${meal.id}" data-record-link="${meal.id}">이 식사 기록</a>
    </article>
  `;
}

function recoverCard(meal) {
  return `
    <article class="recover-card">
      <span class="time-badge">${meal.time || "추천"}</span>
      <div>
        <h3>${meal.name}</h3>
        <strong class="price">${formatWon(meal.price)}</strong>
        <span class="detail">${won.format(meal.kcal)} kcal | 단백질 ${meal.protein}g</span>
        <span class="detail">${createAllergyText(meal.allergies)}</span>
        <a class="primary" href="#meal-${meal.id}" data-record-link="${meal.id}">이 식사 기록</a>
      </div>
    </article>
  `;
}

function renderMeals() {
  const homeMeals = meals.filter((meal) => meal.category !== "편의점").slice(0, 3);
  document.querySelector("#homeRecommendations").innerHTML = homeMeals.map(mealCard).join("");

  const filtered = meals
    .filter((meal) => meal.category === state.selectedCategory)
    .sort((a, b) => (state.sortByBudget ? a.price - b.price : a.id - b.id));
  document.querySelector("#mealList").innerHTML = filtered.map(mealItem).join("");

  const recoverMeals = meals.filter((meal) => meal.tags.some((tag) => ["회복식", "가성비", "가벼움"].includes(tag))).slice(0, 3);
  document.querySelector("#recoverMeals").innerHTML = recoverMeals.map(recoverCard).join("");
}

function bindMealRecordButtons() {
  document.querySelectorAll("[data-record]").forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      showMealDetail(mealById(button.dataset.record));
    };
  });
}

function renderRecords() {
  document.querySelector("#mealTypeText").textContent = `${state.selectedMealType} ▼`;
  document.querySelectorAll("[data-meal-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mealType === state.selectedMealType);
  });
  document.querySelectorAll("[data-food-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.foodTab === state.activeFoodTab);
  });
  const eatenCount = dietHistory.reduce((acc, item) => {
    acc[item.dietName] = (acc[item.dietName] || 0) + 1;
    return acc;
  }, {});
  const matchesKeyword = (meal, keywords) => keywords.some((name) => namesMatch(meal.name, name));
  const visibleMeals = meals.filter((meal) => {
    if (state.activeFoodTab === "preferred") {
      return matchesKeyword(meal, foodPreferences);
    }
    if (state.activeFoodTab === "disliked") {
      return matchesKeyword(meal, dislikedFoods);
    }
    return eatenCount[meal.name] >= 2;
  });
  const emptyMessages = {
    frequent: "아직 자주 먹은 음식이 없어요.",
    preferred: "선호 음식 목록이 없어요.",
    disliked: "비선호 음식 목록이 없어요.",
  };
  if (visibleMeals.length === 0) {
    document.querySelector("#foodRecordList").innerHTML = `<p class="record-empty">${emptyMessages[state.activeFoodTab]}</p>`;
    document.querySelector("#selectedFoodCount").textContent = state.selectedRecordFoods.size;
    return;
  }
  document.querySelector("#foodRecordList").innerHTML = visibleMeals
    .map((meal) => {
      const selected = state.selectedRecordFoods.has(meal.id);
      const countLabel = state.activeFoodTab === "frequent" ? ` · ${eatenCount[meal.name] || 0}회` : "";
      const preferred = matchesKeyword(meal, foodPreferences);
      const disliked = matchesKeyword(meal, dislikedFoods);
      return `
        <article class="food-record-row ${selected ? "selected" : ""}">
          <div>
            <strong>${meal.name}</strong>
            <span>${meal.category}${countLabel} · ${meal.carbs + meal.protein + meal.fat}g</span>
          </div>
          <p>${won.format(meal.kcal)}kcal</p>
          <div class="food-actions">
            <button class="prefer ${preferred ? "active" : ""}" type="button" onclick="event.stopPropagation(); toggleFoodPreference(${meal.id})" data-food-pref="${meal.id}" aria-label="선호">♡</button>
            <button class="dislike ${disliked ? "active" : ""}" type="button" onclick="event.stopPropagation(); toggleFoodDislike(${meal.id})" data-food-dislike="${meal.id}" aria-label="비선호">⊘</button>
            <button type="button" onclick="event.stopPropagation(); toggleRecordFood(${meal.id})" data-toggle-food="${meal.id}" aria-label="${meal.name} 선택">${selected ? "✓" : "+"}</button>
          </div>
        </article>
      `;
    })
    .join("");
  document.querySelector("#selectedFoodCount").textContent = state.selectedRecordFoods.size;
}

function toggleRecordFood(id) {
  if (state.selectedRecordFoods.has(id)) {
    state.selectedRecordFoods.delete(id);
  } else {
    state.selectedRecordFoods.add(id);
  }
  renderRecords();
}

function toggleFoodPreference(id) {
  const name = mealById(id).name;
  const wasPreferred = foodPreferences.some((item) => namesMatch(name, item));
  foodPreferences = wasPreferred ? foodPreferences.filter((item) => !namesMatch(name, item)) : [...foodPreferences.filter((item) => !namesMatch(name, item)), name];
  dislikedFoods = dislikedFoods.filter((item) => !namesMatch(name, item));
  render();
}

function toggleFoodDislike(id) {
  const name = mealById(id).name;
  const wasDisliked = dislikedFoods.some((item) => namesMatch(name, item));
  dislikedFoods = wasDisliked ? dislikedFoods.filter((item) => !namesMatch(name, item)) : [...dislikedFoods.filter((item) => !namesMatch(name, item)), name];
  foodPreferences = foodPreferences.filter((item) => !namesMatch(name, item));
  render();
}

window.toggleRecordFood = toggleRecordFood;
window.toggleFoodPreference = toggleFoodPreference;
window.toggleFoodDislike = toggleFoodDislike;
window.openMealDetail = (id) => showMealDetail(mealById(id));

function handleMealHash() {
  const match = window.location.hash.match(/^#meal-(\d+)$/);
  if (!match) return;
  showMealDetail(mealById(match[1]));
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function renderPreferenceTables() {
  document.querySelector("#preferredFoodList").innerHTML = foodPreferences
    .map((name) => `<li><strong>${name}</strong></li>`)
    .join("");

  document.querySelector("#dislikedFoodList").innerHTML = dislikedFoods
    .map((name) => `<li><strong>${name}</strong></li>`)
    .join("");
}

function renderAllergies() {
  document.querySelector("#allergyList").innerHTML = state.allergies.length
    ? state.allergies.map((name) => `<li><strong>${name}</strong></li>`).join("")
    : `<li><strong>없음</strong></li>`;
}

function renderWeightChart() {
  const chart = document.querySelector("#weightChart");
  if (weightHistory.length === 0) {
    chart.innerHTML = `<p class="empty-chart">그래프 없음</p>`;
    return;
  }
  const sorted = [...weightHistory].slice(0, 7).reverse();
  const weights = sorted.map((item) => item.weight);
  const min = Math.min(...weights) - 0.3;
  const max = Math.max(...weights) + 0.3;
  const points = sorted
    .map((item, index) => {
      const left = sorted.length === 1 ? 50 : (index / (sorted.length - 1)) * 88 + 6;
      const bottom = ((item.weight - min) / (max - min || 1)) * 68 + 12;
      const label = item.date.slice(5).replace("-", ".");
      return `<span title="${label} ${item.weight}kg" style="left:${left}%; bottom:${bottom}%"><i>${label}</i></span>`;
    })
    .join("");
  chart.innerHTML = `<div class="chart-line"></div>${points}`;
}

function isWithinRecentMonth(dateText) {
  const today = new Date("2026-05-20T00:00:00");
  const target = new Date(`${dateText}T00:00:00`);
  const monthAgo = new Date(today);
  monthAgo.setMonth(today.getMonth() - 1);
  return target >= monthAgo && target <= today;
}

function historyItem(item) {
  return `
    <article class="history-item">
      <div>
        <span>${item.date} · ${item.mealType}</span>
        <strong>${item.dietName}</strong>
      </div>
      <p>${won.format(item.kcal)}kcal<br />${formatWon(item.price)}</p>
    </article>
  `;
}

function renderDietHistory() {
  if (dietHistory.length === 0) {
    document.querySelector("#previousDietHistory").innerHTML = `<article class="history-item"><div><strong>아직 기록이 없어요</strong></div><p>-</p></article>`;
    return;
  }
  const latestDate = dietHistory.reduce((latest, item) => (item.date > latest ? item.date : latest), dietHistory[0].date);
  const latestMeals = dietHistory.filter((item) => item.date === latestDate);
  document.querySelector("#previousDietHistory").innerHTML = latestMeals.map(historyItem).join("");
}

function renderEntryHistory() {
  document.querySelector("#weightHistoryList").innerHTML = weightHistory
    .map(
      (item) => `
        <article class="history-item">
          <div>
            <span>${item.date}</span>
            <strong>${item.memo}</strong>
          </div>
          <p>${item.weight.toFixed(1)}kg</p>
        </article>
      `,
    )
    .join("");

  document.querySelector("#budgetHistoryList").innerHTML = budgetHistory
    .map(
      (item) => `
        <article class="history-item">
          <div>
            <span>${item.date}</span>
            <strong>주간 예산 ${formatWon(item.weeklyBudget)}</strong>
          </div>
          <p>사용 ${formatWon(item.spent)}<br />잔액 ${formatWon(Math.max(item.weeklyBudget - item.spent, 0))}</p>
        </article>
      `,
    )
    .join("");
  document.querySelector("#recordBudgetHistoryList").innerHTML = document.querySelector("#budgetHistoryList").innerHTML;
}

function renderCategories() {
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle("active", button.dataset.category === state.selectedCategory);
  });
  document.querySelector("#budgetFilter").classList.toggle("active", state.sortByBudget);
}

function render() {
  renderSummary();
  renderMeals();
  renderRecords();
  bindMealRecordButtons();
  renderPreferenceTables();
  renderAllergies();
  renderDietHistory();
  renderEntryHistory();
  renderWeightChart();
  renderCategories();
  setRecordMode(state.recordMode, false);
}

document.addEventListener(
  "click",
  (event) => {
    const budgetButton = event.target.closest("[data-open-budget]");
    if (budgetButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openBudgetModal();
      return;
    }

    const record = event.target.closest("[data-record]");
    if (!record) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showMealDetail(mealById(record.dataset.record));
  },
  true,
);

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-modal]")) {
    closeModal();
    return;
  }

  const nav = event.target.closest("[data-nav]");
  if (nav) {
    setScreen(nav.dataset.nav);
    if (nav.dataset.recordMode) setRecordMode(nav.dataset.recordMode);
    return;
  }

  const category = event.target.closest("[data-category]");
  if (category) {
    state.selectedCategory = category.dataset.category;
    state.sortByBudget = false;
    render();
    return;
  }

  const recordMode = event.target.closest("[data-record-mode]");
  if (recordMode) {
    setRecordMode(recordMode.dataset.recordMode);
    return;
  }

  const openRecordMode = event.target.closest("[data-open-record-mode]");
  if (openRecordMode) {
    setScreen("record");
    setRecordMode(openRecordMode.dataset.openRecordMode);
    return;
  }

  const mealType = event.target.closest("[data-meal-type]");
  if (mealType) {
    state.selectedMealType = mealType.dataset.mealType;
    document.querySelector(".record-chips").classList.remove("open");
    renderRecords();
    return;
  }

  const foodTab = event.target.closest("[data-food-tab]");
  if (foodTab) {
    state.activeFoodTab = foodTab.dataset.foodTab;
    renderRecords();
    return;
  }

  const record = event.target.closest("[data-record]");
  if (record) {
    recordMeal(mealById(record.dataset.record));
    return;
  }

  const favorite = event.target.closest("[data-favorite]");
  if (favorite) {
    const id = Number(favorite.dataset.favorite);
    if (state.favorites.has(id)) {
      state.favorites.delete(id);
    } else {
      state.favorites.add(id);
    }
    render();
    return;
  }

  const toggleFood = event.target.closest("[data-toggle-food]");
  if (toggleFood) {
    const id = Number(toggleFood.dataset.toggleFood);
    if (state.selectedRecordFoods.has(id)) {
      state.selectedRecordFoods.delete(id);
    } else {
      state.selectedRecordFoods.add(id);
    }
    renderRecords();
    return;
  }

  const foodPref = event.target.closest("[data-food-pref]");
  if (foodPref) {
    const name = mealById(foodPref.dataset.foodPref).name;
    foodPreferences = foodPreferences.includes(name) ? foodPreferences.filter((item) => item !== name) : [...foodPreferences, name];
    dislikedFoods = dislikedFoods.filter((item) => item !== name);
    render();
    return;
  }

  const foodDislike = event.target.closest("[data-food-dislike]");
  if (foodDislike) {
    const name = mealById(foodDislike.dataset.foodDislike).name;
    dislikedFoods = dislikedFoods.includes(name) ? dislikedFoods.filter((item) => item !== name) : [...dislikedFoods, name];
    foodPreferences = foodPreferences.filter((item) => item !== name);
    render();
    return;
  }

  if (event.target.closest("[data-record-selected]")) {
    if (state.selectedRecordFoods.size === 0) return;
    recordSelectedMeals();
    return;
  }

  const weightStep = event.target.closest("[data-weight-step]");
  if (weightStep) {
    state.previousWeight = state.currentWeight;
    state.currentWeight = Math.max(30, state.currentWeight + Number(weightStep.dataset.weightStep));
    weightHistory.unshift({
      id: Date.now(),
      date: todayText(),
      weight: state.currentWeight,
      memo: "바로 기록",
    });
    render();
    return;
  }

  if (event.target.closest("[data-plan]")) {
    event.target.closest("[data-plan]").classList.toggle("done");
    return;
  }

  if (event.target.closest("[data-open-add]")) {
    openQuickAdd();
    return;
  }

  if (event.target.closest("[data-open-weight]")) {
    document.querySelector("#weightInput").value = state.currentWeight.toFixed(1);
    document.querySelector("#weightMemoInput").value = weightHistory[0]?.memo || "";
    openModal(weightModal);
    return;
  }

  if (event.target.closest("[data-toggle-meal-menu]")) {
    document.querySelector(".record-chips").classList.toggle("open");
    return;
  }

  if (event.target.closest("[data-open-profile]")) {
    document.querySelector("#nameInput").value = state.userName;
    openModal(profileModal);
    return;
  }

  if (event.target.closest("[data-open-goal]")) {
    openModal(goalModal);
    return;
  }

  if (event.target.closest("[data-open-calorie]")) {
    document.querySelector("#calorieInput").value = state.calorieGoal;
    openModal(calorieModal);
    return;
  }

  if (event.target.closest("[data-open-body]")) {
    document.querySelector("#heightInput").value = state.heightCm;
    document.querySelector("#infoWeightInput").value = state.currentWeight.toFixed(1);
    openModal(bodyModal);
    return;
  }

  if (event.target.closest("[data-open-gender]")) {
    document.querySelectorAll("[data-gender-choice]").forEach((button) => {
      button.classList.toggle("active", button.dataset.genderChoice === state.gender);
    });
    openModal(genderModal);
    return;
  }

  if (event.target.closest("[data-open-age]")) {
    document.querySelector("#ageInput").value = state.age;
    openModal(ageModal);
    return;
  }

  if (event.target.closest("[data-open-allergy]")) {
    openAllergyModal();
    return;
  }

  const genderChoice = event.target.closest("[data-gender-choice]");
  if (genderChoice) {
    state.gender = genderChoice.dataset.genderChoice;
    closeModal();
    render();
    return;
  }

  const goalChoice = event.target.closest("[data-goal-choice]");
  if (goalChoice) {
    state.goal = goalChoice.dataset.goalChoice;
    const bmr = calculateBmr();
    const offsets = { 감량: -250, 유지: 0, 증량: 250 };
    state.calorieGoal = Math.max(900, bmr + offsets[state.goal]);
    closeModal();
    render();
    return;
  }

  if (event.target.closest("[data-open-budget]")) {
    openBudgetModal();
    return;
  }

  if (event.target.closest("[data-open-record]")) {
    setScreen("record");
    return;
  }

  if (event.target.closest("[data-close-record]")) {
    setScreen("home");
    return;
  }

  const openModalBackdrop = event.target.closest(".entry-modal.open");
  if (openModalBackdrop && event.target === openModalBackdrop) {
    closeModal();
  }

  if (quickAdd.classList.contains("open") && event.target === quickAdd) {
    closeQuickAdd();
  }
});

fabButton.addEventListener("click", toggleQuickAdd);
window.addEventListener("hashchange", handleMealHash);

document.querySelector("#mealTypeText").addEventListener("click", () => {
  document.querySelector(".record-chips").classList.toggle("open");
});

document.querySelector("[data-record-selected]").addEventListener("click", () => {
  if (state.selectedRecordFoods.size > 0) recordSelectedMeals();
});

document.querySelectorAll("[data-meal-type]").forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedMealType = button.dataset.mealType;
    document.querySelector(".record-chips").classList.remove("open");
    renderRecords();
  });
});

document.querySelectorAll("[data-food-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    state.activeFoodTab = button.dataset.foodTab;
    renderRecords();
  });
});

document.querySelectorAll("[data-open-budget]").forEach((button) => {
  button.addEventListener("click", openBudgetModal);
});

document.querySelector("[data-open-profile]").addEventListener("click", () => {
  document.querySelector("#nameInput").value = state.userName;
  openModal(profileModal);
});

document.querySelector("[data-open-goal]").addEventListener("click", () => openModal(goalModal));

document.querySelector("[data-open-calorie]").addEventListener("click", () => {
  document.querySelector("#calorieInput").value = state.calorieGoal;
  openModal(calorieModal);
});

document.querySelectorAll("[data-open-body]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#heightInput").value = state.heightCm;
    document.querySelector("#infoWeightInput").value = state.currentWeight.toFixed(1);
    openModal(bodyModal);
  });
});

document.querySelectorAll("[data-open-gender]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-gender-choice]").forEach((choice) => {
      choice.classList.toggle("active", choice.dataset.genderChoice === state.gender);
    });
    openModal(genderModal);
  });
});

document.querySelectorAll("[data-open-age]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#ageInput").value = state.age;
    openModal(ageModal);
  });
});

document.querySelectorAll("[data-open-allergy]").forEach((button) => {
  button.addEventListener("click", () => {
    openAllergyModal();
  });
});

weightForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextWeight = parseNumberInput(document.querySelector("#weightInput").value);
  const memo = document.querySelector("#weightMemoInput").value.trim();
  if (!Number.isFinite(nextWeight) || nextWeight <= 0) return;
  state.previousWeight = state.currentWeight;
  state.currentWeight = nextWeight;
  weightHistory.unshift({
    id: Date.now(),
    date: todayText(),
    weight: nextWeight,
    memo: memo || "체중 기록",
  });
  closeModal();
  render();
});

budgetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const weeklyBudget = parseNumberInput(document.querySelector("#budgetInput").value);
  const spent = parseNumberInput(document.querySelector("#spentInput").value);
  if (!Number.isFinite(weeklyBudget) || weeklyBudget < 0 || !Number.isFinite(spent) || spent < 0) return;
  state.weeklyBudget = weeklyBudget;
  state.spent = spent;
  budgetHistory.unshift({
    id: Date.now(),
    date: todayText(),
    weeklyBudget,
    spent,
  });
  closeModal();
  render();
});

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.userName = document.querySelector("#nameInput").value.trim() || state.userName;
  const photoFile = document.querySelector("#photoInput").files[0];
  if (photoFile) {
    state.profilePhoto = URL.createObjectURL(photoFile);
  }
  closeModal();
  render();
});

calorieForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const calorie = parseNumberInput(document.querySelector("#calorieInput").value);
  if (!Number.isFinite(calorie) || calorie <= 0) return;
  state.calorieGoal = Math.round(calorie);
  closeModal();
  render();
});

bodyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const height = parseNumberInput(document.querySelector("#heightInput").value);
  const weight = parseNumberInput(document.querySelector("#infoWeightInput").value);
  if (!Number.isFinite(height) || !Number.isFinite(weight)) return;
  state.heightCm = height;
  state.previousWeight = state.currentWeight;
  state.currentWeight = weight;
  weightHistory.unshift({ id: Date.now(), date: todayText(), weight, memo: "정보 수정" });
  closeModal();
  render();
});

ageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const age = parseNumberInput(document.querySelector("#ageInput").value);
  if (!Number.isFinite(age) || age <= 0) return;
  state.age = Math.round(age);
  closeModal();
  render();
});

allergyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const selectedAllergies = [...document.querySelectorAll("[data-allergy-option]:checked")].map((input) => input.value);
  const customAllergies = document
    .querySelector("#allergyInput")
    .value.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  state.allergies = [...new Set([...selectedAllergies, ...customAllergies])];
  closeModal();
  render();
});

mealDetailForm.addEventListener("submit", (event) => {
  event.preventDefault();
  confirmPendingMeals();
});

document.querySelector("#budgetFilter").addEventListener("click", () => {
  state.sortByBudget = !state.sortByBudget;
  render();
});

setScreen("home");
render();
handleMealHash();
