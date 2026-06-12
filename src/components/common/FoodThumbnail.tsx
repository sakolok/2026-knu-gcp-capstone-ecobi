import type { MealChannel } from "../../types/domain";
import { FaIcon } from "./FaIcon";

type FoodThumbnailProps = {
  channel: MealChannel;
  category?: string | null;
};

export function FoodThumbnail({ channel, category }: FoodThumbnailProps) {
  const iconName = category?.includes("샐러드") ? "leaf" : category?.includes("샌드위치") ? "bars" : channel === "home_meal" ? "home" : "cutlery";
  return (
    <span className={`food-thumb channel-${channel}`} aria-hidden="true">
      <FaIcon name={iconName} size={20} />
    </span>
  );
}
