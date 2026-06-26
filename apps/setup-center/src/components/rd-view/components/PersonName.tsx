import { formatPersonDisplayName, personNameTitle } from '@rd-view/utils/personName';

export function PersonName({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const full = String(name ?? '').trim() || '—';
  const short = formatPersonDisplayName(full);

  return (
    <span className={className} title={personNameTitle(full, short)}>
      {short}
    </span>
  );
}
