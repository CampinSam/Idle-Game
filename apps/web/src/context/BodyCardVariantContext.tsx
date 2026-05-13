import { createContext, useContext, useState, useCallback } from 'react';

interface BodyCardVariantContextValue {
  variantClass: string;
  setVariantClass: (cls: string) => void;
  clearVariantClass: () => void;
}

const BodyCardVariantContext = createContext<BodyCardVariantContextValue>({
  variantClass: '',
  setVariantClass: () => {},
  clearVariantClass: () => {},
});

export function useBodyCardVariant() {
  return useContext(BodyCardVariantContext);
}

export function BodyCardVariantProvider({ children }: { children: React.ReactNode }) {
  const [variantClass, setVariantClassState] = useState('');

  const setVariantClass = useCallback((cls: string) => {
    setVariantClassState(cls);
  }, []);

  const clearVariantClass = useCallback(() => {
    setVariantClassState('');
  }, []);

  return (
    <BodyCardVariantContext.Provider value={{ variantClass, setVariantClass, clearVariantClass }}>
      {children}
    </BodyCardVariantContext.Provider>
  );
}
