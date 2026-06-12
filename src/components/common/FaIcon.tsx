type FaIconProps = {
  name: string;
  size?: number;
  className?: string;
};

export function FaIcon({ name, size = 18, className = "" }: FaIconProps) {
  return <i className={`fa fa-${name} ${className}`.trim()} aria-hidden="true" style={{ fontSize: size, lineHeight: 1 }} />;
}
