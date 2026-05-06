import GameIcon from './GameIcon';
import { formatCompact } from '../utils/formatNumber';
import './ItemQty.css';

type ItemQtyVariant = 'right' | 'left' | 'badge';
type ItemQtyFormat = 'full' | 'compact';

interface ItemQtyProps {
  src: string;
  amount: number;
  size?: number;
  format?: ItemQtyFormat;
  variant?: ItemQtyVariant;
  suffix?: string;
  className?: string;
}

export default function ItemQty({
  src,
  amount,
  size = 14,
  format = 'full',
  variant = 'right',
  suffix,
  className = '',
}: ItemQtyProps) {
  const numStr = format === 'compact' ? formatCompact(amount) : amount.toLocaleString();

  if (variant === 'badge') {
    return (
      <span className={`item-qty item-qty--badge ${className}`.trim()}>
        <GameIcon src={src} size={size} />
        <span className="item-qty__badge-num">{numStr}</span>
      </span>
    );
  }

  const icon = <GameIcon src={src} size={size} />;
  const num = (
    <span className="item-qty__num">
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
