import GameIcon from './GameIcon';
import { formatCompact, formatRateValue } from '../utils/formatNumber';
import './ItemQty.css';

type ItemQtyVariant = 'right' | 'left' | 'badge';
type ItemQtyFormat = 'full' | 'compact' | 'rate';

interface ItemQtyProps {
  src: string;
  amount: number;
  alt?: string;
  size?: number;
  format?: ItemQtyFormat;
  variant?: ItemQtyVariant;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export default function ItemQty({
  src,
  amount,
  alt = '',
  size = 14,
  format = 'full',
  variant = 'right',
  prefix,
  suffix,
  className = '',
}: ItemQtyProps) {
  const numStr =
    format === 'compact'
      ? formatCompact(amount)
      : format === 'rate'
        ? formatRateValue(amount)
        : amount.toLocaleString();

  if (variant === 'badge') {
    return (
      <span className={`item-qty item-qty--badge ${className}`.trim()}>
        <GameIcon src={src} size={size} alt={alt} />
        {amount > 0 && <span className="item-qty__badge-num">{numStr}</span>}
      </span>
    );
  }

  const icon = <GameIcon src={src} size={size} alt={alt} />;
  const num = (
    <span className="item-qty__num">
      {prefix && <span className="item-qty__prefix">{prefix}</span>}
      {numStr}
      {suffix && <span className="item-qty__suffix">{suffix}</span>}
    </span>
  );

  return (
    <span className={`item-qty item-qty--${variant} ${className}`.trim()}>
      {variant === 'left' ? <>{num}{icon}</> : <>{icon}{num}</>}
    </span>
  );
}
