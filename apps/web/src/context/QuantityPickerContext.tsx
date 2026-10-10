import { createContext, useContext } from 'react';

export interface QuantityPickerContextValue {
  values: Record<string, number>;
  setValue: (id: string, value: number) => void;
}

const QuantityPickerContext = createContext<QuantityPickerContextValue>({
  values: {},
  setValue: () => {},
});

export default QuantityPickerContext;

export function useQuantityPicker() {
  return useContext(QuantityPickerContext);
}
