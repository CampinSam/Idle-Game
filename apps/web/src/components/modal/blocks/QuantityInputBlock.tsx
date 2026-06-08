import type { ModalBlockQuantityInput } from '@derp/shared';
import { useQuantityPicker } from '../../../context/QuantityPickerContext';

interface Props {
  block: ModalBlockQuantityInput;
}

export default function QuantityInputBlock({ block }: Props) {
  const { id, min, max, defaultValue, resourceId, costAmount, xpPerCharge } = block;
  const { values, setValue } = useQuantityPicker();

  const qty = values[id] ?? defaultValue;

  const handleDecrement = () => {
    setValue(id, Math.max(min, qty - 1));
  };

  const handleIncrement = () => {
    setValue(id, Math.min(max, qty + 1));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.min(max, Math.max(min, Math.floor(Number(e.target.value) || min)));
    setValue(id, v);
  };

  const totalCost = costAmount * qty;
  const totalXp = xpPerCharge * qty;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-600/40 bg-slate-800/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-slate-400">
          {resourceId}
        </span>
        <span className="text-[11px] text-slate-500">max {max}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-slate-700/50 border border-slate-600/50 text-slate-300 text-lg font-bold flex items-center justify-center hover:bg-slate-600/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleDecrement}
          disabled={qty <= min}
          aria-label="Decrease quantity"
        >
          −
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={qty}
          onChange={handleInputChange}
          className="w-16 text-center bg-[#0f0f2e] border border-slate-600/50 rounded-lg text-[#e2e8f0] text-sm py-1 outline-none focus:border-[#a78bfa]/60"
          aria-label={`Quantity for ${resourceId}`}
        />
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-slate-700/50 border border-slate-600/50 text-slate-300 text-lg font-bold flex items-center justify-center hover:bg-slate-600/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleIncrement}
          disabled={qty >= max}
          aria-label="Increase quantity"
        >
          +
        </button>
        <span className="text-[11px] text-slate-400 ml-1">/ {max}</span>
      </div>

      <div className="text-[11px] text-[#c4b5fd] font-medium">
        {qty}× {costAmount > 1 ? `${costAmount} ${resourceId}` : resourceId} → +{totalXp} XP
        {costAmount > 1 && (
          <span className="text-slate-500 ml-1">({totalCost} total)</span>
        )}
      </div>
    </div>
  );
}
