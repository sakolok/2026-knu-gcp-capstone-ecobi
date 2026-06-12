# Ecobi MVP Architecture Draft

Generated on 2026-04-27 from approved `/office-hours`, `/plan-ceo-review`, and `/plan-eng-review` outcomes.

## MVP Goal

Ship the smallest web app that can:

1. Complete first-run onboarding for budget, goal, body baseline, activity level, and meal channels.
2. Calculate BMR, TDEE, and target calories from the onboarding profile.
3. Generate a base weekly plan from budget, target calories, goal, and meal channels.
4. Accept a shock event plus expected spend.
5. Recompute a recovery revision without overwriting the base weekly plan.
6. Persist lightweight profile memory.
7. Record whether a recovery was both feasible and accepted.

## Design Review Decisions

These decisions were locked during `/plan-design-review` and should be treated as implementation constraints, not vague suggestions.

### Overall UI Direction

- Product type: mobile app first
- Visual direction: clean Korean food-budget coaching app
- UI language: food-forward cards, compact metric panels, and recovery flow visualization
- Primary accent: purple, used for active states and key CTAs only
- Priority emotion: "You are still recoverable," not "You failed"

### Navigation

- App home is `Home`, not `Recommend` or `Recover`
- Primary navigation is bottom tab bar
- Tabs: `Home / Record / Recommend / Recover / My`

### Screen Hierarchy

#### Home

```text
[Today Status]
  -> biggest element on screen
[Recommended Meal]
[Today's Meals]
[Budget and nutrition progress]
```

- Use vertical hierarchy on mobile, not compressed tiles or swipe carousels

#### Recover

```text
[Shock Event Input]
[Recovery Verdict]
[Updated Effective Plan]
[Accept / Reject]
[Collapsed "What changed?" comparison]
```

- Recovery copy is reassurance-first
- Failure state must be actionable, not a dead end

#### Record

```text
[Today Summary]
[Photo Record CTA]
[Meal Log]
[Short Analysis]
```

- Recording must connect calories, protein, and spending in one glance.
- Photo entry is a soft CTA in MVP; it can be non-functional in the static prototype.

#### Recommend

```text
[Best option right now]
[One backup option]
[Context, only if needed]
```

- Show one best option plus one backup
- Do not show a search-results wall of choices

#### My

```text
[Goal / Budget / Energy Targets]
[Meal Channels]
[Failure Patterns]
```

- Keep only variables that materially improve recommendation quality

### State Design

- Infeasible recovery must explain what constraint is blocking the plan
- Every blocked state should offer next actions:
  - raise budget
  - widen meal channels
  - relax target
- Status communication is triple-coded:
  - text label
  - icon or badge
  - color
- Never rely on color alone

### Onboarding

- Use required first-run onboarding when no `UserProfile` exists.
- Keep required inputs tight because the weekly plan needs stable constraints before first value.
- Required flow:

```text
[Problem framing]
  -> [goal]
  -> [sex + age + height + weight]
  -> [activity level]
  -> [weekly budget]
  -> [meal channels]
  -> [BMR / TDEE / target calorie estimate]
  -> [first weekly plan]
```

- Optional preference enrichment can appear before completion only if it is skippable.
- Store durable setup in `UserProfile`.
- Store tastes, disliked foods, and failure patterns in `ProfileMemory`.
- BMR/TDEE output must be presented as an estimate for meal planning, not a medical diagnosis.

### Energy Target Calculation

- BMR uses the Mifflin-St Jeor equation.
- Male: `10 * weightKg + 6.25 * heightCm - 5 * age + 5`
- Female: `10 * weightKg + 6.25 * heightCm - 5 * age - 161`
- TDEE: `BMR * activityFactor`
- Activity factors:
  - `sedentary`: `1.2`
  - `light`: `1.375`
  - `moderate`: `1.55`
  - `active`: `1.725`
  - `athlete`: `1.9`
- MVP target calorie deltas:
  - `maintain`: `0`
  - `cut`: `-300`
  - `bulk`: `+250`
- Round stored calorie values to whole kcal.
- Never use BMR/TDEE alone as a health recommendation. It is one planning constraint among budget, protein, and meal-channel constraints.

### Comparison Behavior

- Recovery UI is effective-plan-first
- Show the current effective plan as the main object
- Highlight changed meals inline
- Keep the original-vs-revised comparison in a collapsible secondary panel

### Accessibility Constraints

- Body text stays at 16px or larger
- Touch targets at 44px minimum
- State meaning must not depend on color alone
- Critical warnings must use explicit text labels

### Not In Scope

- Recommendation reasoning summaries in MVP UI
- Full visual design system exploration
- Marketing-site aesthetic work
- Side-by-side desktop-style comparison as the primary recovery pattern

## Proposed Stack

Keep this boring.

- Frontend: Next.js app router or equivalent React web app
- Backend: same app, server actions or route handlers
- Database: PostgreSQL
- Solver layer: app-local optimization module wrapping MILP
- ORM: Prisma or Drizzle
- Tests: Vitest for unit/integration, Playwright later for UI flows

If you prefer another TypeScript web stack, keep the shape the same. The structure matters more than the framework badge.

## File Structure

```text
GCP_Ecobi/
├── app/
│   ├── plan/
│   │   ├── page.tsx
│   │   └── actions.ts
│   ├── shock-recovery/
│   │   ├── page.tsx
│   │   └── actions.ts
│   ├── decision/
│   │   ├── page.tsx
│   │   └── actions.ts
│   ├── profile/
│   │   ├── page.tsx
│   │   └── actions.ts
│   ├── api/
│   │   ├── weekly-plan/route.ts
│   │   ├── shock-recovery/route.ts
│   │   └── recovery-acceptance/route.ts
│   └── layout.tsx
├── components/
│   ├── plan/
│   │   ├── WeeklyPlanForm.tsx
│   │   ├── WeeklyPlanView.tsx
│   │   └── InfeasiblePlanNotice.tsx
│   ├── recovery/
│   │   ├── ShockEventForm.tsx
│   │   ├── RecoveryRevisionView.tsx
│   │   └── ConstraintFailureNotice.tsx
│   └── profile/
│       ├── MealChannelSelector.tsx
│       └── FailurePatternEditor.tsx
├── lib/
│   ├── planning/
│   │   ├── generateWeeklyPlan.ts
│   │   ├── recoverFromShock.ts
│   │   ├── classifyRecoverySuccess.ts
│   │   ├── buildConstraints.ts
│   │   ├── normalizeInputs.ts
│   │   └── types.ts
│   ├── solver/
│   │   ├── solveMealOptimization.ts
│   │   ├── translateConstraints.ts
│   │   └── solverTypes.ts
│   ├── profile-memory/
│   │   ├── loadProfileMemory.ts
│   │   ├── updateProfileMemory.ts
│   │   └── defaultProfileMemory.ts
│   ├── db/
│   │   ├── client.ts
│   │   └── queries/
│   │       ├── plans.ts
│   │       ├── revisions.ts
│   │       ├── profileMemory.ts
│   │       └── foodCatalog.ts
│   ├── analytics/
│   │   └── recordRecoveryOutcome.ts
│   └── validation/
│       ├── weeklyPlanSchema.ts
│       ├── shockEventSchema.ts
│       └── profileSchema.ts
├── prisma/
│   └── schema.prisma
├── test/
│   ├── unit/
│   │   ├── buildConstraints.test.ts
│   │   ├── generateWeeklyPlan.test.ts
│   │   ├── recoverFromShock.test.ts
│   │   ├── classifyRecoverySuccess.test.ts
│   │   └── updateProfileMemory.test.ts
│   └── integration/
│       ├── weeklyPlanFlow.test.ts
│       ├── shockRecoveryFlow.test.ts
│       └── recoveryAcceptanceFlow.test.ts
├── docs/
│   └── diagrams/
│       ├── planning-flow.md
│       └── profile-memory.md
├── package.json
└── README.md
```

## Why This Structure

- `app/` owns user entry points only.
- `lib/planning/` owns business decisions.
- `lib/solver/` is the only place that knows solver-specific details.
- `lib/profile-memory/` isolates personalization state changes from planning logic.
- `lib/db/queries/` keeps persistence boring and explicit.
- `test/unit/` locks core logic.
- `test/integration/` locks the three product-critical flows.

Do not start with more folders than this. No `services/`, `repositories/`, `usecases/`, and `domain/` explosion unless the code actually earns them.

## Core Data Model Draft

### 1. User

```ts
type User = {
  id: string;
  email?: string;
  createdAt: Date;
};
```

MVP note: authentication can stay minimal. Even anonymous session users are fine early if persistence still works.

### 2. UserProfile

```ts
type UserProfile = {
  id: string;
  userId: string;
  displayName?: string;
  goal: "maintain" | "cut" | "bulk";
  sex: "male" | "female";
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "athlete";
  activityFactor: 1.2 | 1.375 | 1.55 | 1.725 | 1.9;
  bmrKcal: number;
  tdeeKcal: number;
  targetCaloriesKcal: number;
  targetCalorieDeltaKcal: -300 | 0 | 250;
  weeklyBudgetKrw: number;
  monthlyBudgetKrw?: number;
  availableMealChannels: MealChannel[];
  createdAt: Date;
  updatedAt: Date;
};
```

This is the stable user setup. Not memory.

### 3. ProfileMemory

```ts
type ProfileMemory = {
  id: string;
  userId: string;
  preferences: {
    mealChannelPreference: MealChannelPreference[];
    repeatTolerance?: "low" | "medium" | "high";
  };
  behavioralSignals: {
    frequentShockTypes: ShockType[];
    commonFailureWindows: FailureWindow[];
    lastAcceptedRecoveryAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
};
```

Do not flatten this into one blob with mixed meanings.

### 4. FoodItem

```ts
type FoodItem = {
  id: string;
  name: string;
  mealChannel: "cafeteria" | "convenience_store" | "home_meal" | "delivery";
  priceKrw: number;
  calories: number;
  proteinGrams: number;
  carbsGrams?: number;
  fatGrams?: number;
  isActive: boolean;
  sourceLabel?: string;
  createdAt: Date;
  updatedAt: Date;
};
```

MVP note: start with a small curated catalog. No need to boil the entire Korean food universe on day one.

### 5. WeeklyPlan

```ts
type WeeklyPlan = {
  id: string;
  userId: string;
  profileId: string;
  planWindowStart: string;
  planWindowEnd: string;
  weeklyBudgetKrw: number;
  goal: "maintain" | "cut" | "bulk";
  targetCaloriesKcal: number;
  status: "active" | "superseded";
  generatedAt: Date;
};
```

This is the base plan. Preserve it.

### 6. WeeklyPlanMeal

```ts
type WeeklyPlanMeal = {
  id: string;
  weeklyPlanId: string;
  dayIndex: number;
  mealSlot: "breakfast" | "lunch" | "dinner";
  foodItemId: string;
  plannedPriceKrw: number;
  plannedCalories: number;
  plannedProteinGrams: number;
};
```

Separate line items make testing and diffing easier than storing one giant JSON plan.

### 7. ShockEvent

```ts
type ShockEvent = {
  id: string;
  userId: string;
  weeklyPlanId: string;
  eventType: "company_dinner" | "delivery" | "eating_out" | "other";
  expectedSpendKrw: number;
  eventDayIndex: number;
  note?: string;
  createdAt: Date;
};
```

### 8. PlanRevision

```ts
type PlanRevision = {
  id: string;
  weeklyPlanId: string;
  shockEventId: string;
  revisionStatus: "feasible" | "infeasible" | "accepted" | "rejected";
  blockedConstraint?: "budget" | "protein" | "channel" | "calories";
  generatedAt: Date;
  acceptedAt?: Date;
};
```

This is the revision layer. Do not overwrite `WeeklyPlan`.

### 9. PlanRevisionMeal

```ts
type PlanRevisionMeal = {
  id: string;
  planRevisionId: string;
  dayIndex: number;
  mealSlot: "breakfast" | "lunch" | "dinner";
  action: "replace" | "remove" | "add";
  foodItemId?: string;
  revisedPriceKrw?: number;
  revisedCalories?: number;
  revisedProteinGrams?: number;
};
```

### 10. RecoveryOutcome

```ts
type RecoveryOutcome = {
  id: string;
  weeklyPlanId: string;
  shockEventId: string;
  planRevisionId: string;
  wasFeasible: boolean;
  wasAccepted: boolean;
  countedAsSuccess: boolean;
  createdAt: Date;
};
```

This is your north star fact table for MVP.

## Suggested Prisma Shape

```prisma
model User {
  id            String          @id @default(cuid())
  email         String?         @unique
  createdAt     DateTime        @default(now())
  profile       UserProfile?
  profileMemory ProfileMemory?
  weeklyPlans   WeeklyPlan[]
  shockEvents   ShockEvent[]
}

model UserProfile {
  id                    String   @id @default(cuid())
  userId                String   @unique
  displayName           String?
  goal                  String
  sex                   String
  age                   Int
  heightCm              Int
  weightKg              Float
  activityLevel         String
  activityFactor        Float
  bmrKcal               Int
  tdeeKcal              Int
  targetCaloriesKcal    Int
  targetCalorieDeltaKcal Int
  weeklyBudgetKrw       Int
  monthlyBudgetKrw      Int?
  availableMealChannels Json
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  user                  User     @relation(fields: [userId], references: [id])
}

model ProfileMemory {
  id                String   @id @default(cuid())
  userId            String   @unique
  preferences       Json
  behavioralSignals Json
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  user              User     @relation(fields: [userId], references: [id])
}

model FoodItem {
  id             String   @id @default(cuid())
  name           String
  mealChannel    String
  priceKrw       Int
  calories       Int
  proteinGrams   Float
  carbsGrams     Float?
  fatGrams       Float?
  isActive       Boolean  @default(true)
  sourceLabel    String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model WeeklyPlan {
  id              String           @id @default(cuid())
  userId          String
  profileId       String
  planWindowStart DateTime
  planWindowEnd   DateTime
  weeklyBudgetKrw Int
  goal            String
  targetCaloriesKcal Int
  status          String
  generatedAt     DateTime         @default(now())
  user            User             @relation(fields: [userId], references: [id])
  meals           WeeklyPlanMeal[]
  revisions       PlanRevision[]
}

model WeeklyPlanMeal {
  id                 String   @id @default(cuid())
  weeklyPlanId       String
  dayIndex           Int
  mealSlot           String
  foodItemId         String
  plannedPriceKrw    Int
  plannedCalories    Int
  plannedProteinGrams Float
  weeklyPlan         WeeklyPlan @relation(fields: [weeklyPlanId], references: [id])
}

model ShockEvent {
  id               String   @id @default(cuid())
  userId           String
  weeklyPlanId     String
  eventType        String
  expectedSpendKrw Int
  eventDayIndex    Int
  note             String?
  createdAt        DateTime @default(now())
  user             User     @relation(fields: [userId], references: [id])
}

model PlanRevision {
  id                String             @id @default(cuid())
  weeklyPlanId      String
  shockEventId      String
  revisionStatus    String
  blockedConstraint String?
  generatedAt       DateTime           @default(now())
  acceptedAt        DateTime?
  weeklyPlan        WeeklyPlan         @relation(fields: [weeklyPlanId], references: [id])
  meals             PlanRevisionMeal[]
  outcome           RecoveryOutcome?
}

model PlanRevisionMeal {
  id                 String   @id @default(cuid())
  planRevisionId     String
  dayIndex           Int
  mealSlot           String
  action             String
  foodItemId         String?
  revisedPriceKrw    Int?
  revisedCalories    Int?
  revisedProteinGrams Float?
  planRevision       PlanRevision @relation(fields: [planRevisionId], references: [id])
}

model RecoveryOutcome {
  id               String   @id @default(cuid())
  weeklyPlanId     String
  shockEventId     String
  planRevisionId   String   @unique
  wasFeasible      Boolean
  wasAccepted      Boolean
  countedAsSuccess Boolean
  createdAt        DateTime @default(now())
  planRevision     PlanRevision @relation(fields: [planRevisionId], references: [id])
}
```

## Request Flow Draft

### Weekly Plan Generation

```text
[Plan Form]
    |
    v
validate weeklyPlanSchema
    |
    v
load UserProfile with targetCaloriesKcal
    |
    v
loadProfileMemory(userId) or defaultProfileMemory()
    |
    v
buildConstraints(profile, weeklyContext, no shock)
    |
    v
solveMealOptimization()
    |
    +--> infeasible -> show blocked constraint + relaxation options
    |
    v
persist WeeklyPlan + WeeklyPlanMeal[]
    |
    v
render Base Weekly Plan
```

### Shock Recovery

```text
[Shock Event Form]
    |
    v
validate shockEventSchema
    |
    v
load active WeeklyPlan + ProfileMemory
    |
    v
buildConstraints(profile, currentPlanContext, shockEvent)
    |
    v
recoverFromShock(basePlan, shockEvent, profileMemory)
    |
    +--> infeasible -> persist failed revision + show recovery guidance
    |
    v
persist PlanRevision + PlanRevisionMeal[]
    |
    v
render Effective Plan = base plan + latest revision
```

## Suggested First Build Order

1. `prisma/schema.prisma`
2. `lib/planning/types.ts`
3. `lib/profile/calculateEnergyTargets.ts`
4. `lib/validation/onboardingProfileSchema.ts`
5. `app/onboarding/page.tsx`
6. `lib/planning/buildConstraints.ts`
7. `lib/solver/solveMealOptimization.ts`
8. `lib/planning/generateWeeklyPlan.ts`
9. `lib/planning/recoverFromShock.ts`
10. `lib/profile-memory/*`
11. unit tests
12. integration tests
13. minimal UI routes

## Test File Intent

- `buildConstraints.test.ts`
  Verifies shared constraint assembly for both weekly planning and shock recovery.
- `calculateEnergyTargets.test.ts`
  Verifies BMR, TDEE, activity factors, goal deltas, and rounding behavior.
- `onboardingProfileSchema.test.ts`
  Verifies age, height, weight, budget, activity level, and meal-channel validation.
- `generateWeeklyPlan.test.ts`
  Covers feasible, infeasible, and no-memory fallback.
- `recoverFromShock.test.ts`
  Covers feasible revision, infeasible revision, and base-plan preservation.
- `classifyRecoverySuccess.test.ts`
  Covers feasible-only, accepted-only, and feasible-plus-accepted cases.
- `weeklyPlanFlow.test.ts`
  End-to-end server-side plan generation.
- `shockRecoveryFlow.test.ts`
  End-to-end server-side recovery revision creation.
- `recoveryAcceptanceFlow.test.ts`
  Acceptance updates success metrics correctly.

## Open Questions

- Should MVP expose only binary sex for the BMR formula, or add an explicit "manual calorie target" fallback for users who do not want to answer?
- Will cafeteria meal data be curated manually at first, or imported from a partner/source?
- Is anonymous session-based usage enough for MVP, or do you want login from day one?
