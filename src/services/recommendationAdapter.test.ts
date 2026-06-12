import { describe, expect, it } from "vitest";
import { getAdditionalRecommendationItems, getVisibleRecommendationChoiceItems } from "./recommendationAdapter";

const items = [
  { id: 1, title: "첫 번째 후보" },
  { id: 2, title: "두 번째 후보" },
  { id: 3, title: "세 번째 후보" },
  { id: 4, title: "네 번째 후보" },
  { id: 5, title: "다섯 번째 후보" },
];

describe("recommendation display helpers", () => {
  it("uses the first three candidates as the visible recommendation choices by default", () => {
    expect(getVisibleRecommendationChoiceItems(items, null).map((item) => item.id)).toEqual([1, 2, 3]);
    expect(getAdditionalRecommendationItems(items, null).map((item) => item.id)).toEqual([4, 5]);
  });

  it("excludes the selected card and its two visible comparison cards from additional recommendations", () => {
    expect(getVisibleRecommendationChoiceItems(items, 4).map((item) => item.id)).toEqual([4, 1, 2]);
    expect(getAdditionalRecommendationItems(items, 4).map((item) => item.id)).toEqual([3, 5]);
  });
});
