import { createContext, useContext } from 'react';

const ModalRefreshContext = createContext<(() => void) | null>(null);

export default ModalRefreshContext;

export function useModalRefresh(): (() => void) | null {
  return useContext(ModalRefreshContext);
}
