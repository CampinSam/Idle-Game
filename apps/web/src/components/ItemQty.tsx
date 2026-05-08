import GameIcon from './GameIcon';
import { formatCompact, formatRateValue } from '../utils/formatNumber';

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
      <span className={`relative inline-flex items-center justify-center ${className}`.trim()}>
        <GameIcon src={src} size={size} alt={alt} />
        {amount > 0 && (
          <span className="absolute -bottom-0.5 -right-0.5 bg-[rgba(0,0,0,0.78)] text-white text-[10px] font-bold px-[5px] py-px rounded-lg min-w-[18px] text-center leading-[1.35] pointer-events-none">
            {numStr}
          </span>
        )}
      </span>
    );
  }

  const icon = <GameIcon src={src} size={size} alt={alt} />;
  const num = (
    <span className="font-bold">
      {prefix && <span className="font-semibold [opacity:0.85] mr-px">{prefix}</span>}
      {numStr}
      {suffix && <span className="font-semibold [opacity:0.75] ml-px text-[0.85em]">{suffix}</span>}
    </span>
  );

  return (
    <span className={`inline-flex items-center gap-1 leading-none whitespace-nowrap ${variant === 'left' ? 'flex-row-reverse' : ''} ${className}`.trim()}>
      {variant === 'left' ? <>{num}{icon}</> : <>{icon}{num}</>}
    </span>
  );
}
