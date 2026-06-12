import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: "default" | "green" | "yellow" | "blue";
};

export function MetricCard({ label, value, helper, tone = "default" }: MetricCardProps) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </article>
  );
}
