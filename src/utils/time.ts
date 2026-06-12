import { useEffect, useState } from "react";

export function formatCurrentTimeLabel(date = new Date()) {
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function useCurrentTimeLabel(refreshMs = 30_000) {
  const [timeLabel, setTimeLabel] = useState(() => formatCurrentTimeLabel());

  useEffect(() => {
    const update = () => setTimeLabel(formatCurrentTimeLabel());
    update();
    const timerId = window.setInterval(update, refreshMs);
    return () => window.clearInterval(timerId);
  }, [refreshMs]);

  return timeLabel;
}
