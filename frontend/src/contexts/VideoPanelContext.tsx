import { createContext, useCallback, useContext, useRef, useState } from 'react';

const MAX_SIMULTANEOUS_PANELS = 4;

interface VideoPanelContextValue {
  activePanelIds: ReadonlySet<string>;
  activePanelCount: number;
  maxPanels: number;
  registerPanel: (id: string) => boolean;
  unregisterPanel: (id: string) => void;
}

const VideoPanelContext = createContext<VideoPanelContextValue | null>(null);

export function VideoPanelProvider({ children }: { children: React.ReactNode }) {
  const activePanelIdsRef = useRef<Set<string>>(new Set());
  const [activePanelIds, setActivePanelIds] = useState<Set<string>>(new Set());

  const syncActivePanels = useCallback((next: Set<string>) => {
    activePanelIdsRef.current = next;
    setActivePanelIds(next);
  }, []);

  const registerPanel = useCallback((id: string): boolean => {
    const current = activePanelIdsRef.current;
    if (current.has(id)) return true;
    if (current.size >= MAX_SIMULTANEOUS_PANELS) return false;

    const next = new Set(current);
    next.add(id);
    syncActivePanels(next);
    return true;
  }, [syncActivePanels]);

  const unregisterPanel = useCallback((id: string) => {
    const current = activePanelIdsRef.current;
    if (!current.has(id)) return;

    const next = new Set(current);
    next.delete(id);
    syncActivePanels(next);
  }, [syncActivePanels]);

  return (
    <VideoPanelContext.Provider
      value={{
        activePanelIds,
        activePanelCount: activePanelIds.size,
        maxPanels: MAX_SIMULTANEOUS_PANELS,
        registerPanel,
        unregisterPanel,
      }}
    >
      {children}
    </VideoPanelContext.Provider>
  );
}

export function useVideoPanelContext(): VideoPanelContextValue {
  const context = useContext(VideoPanelContext);
  if (!context) {
    throw new Error(
      'useVideoPanelContext must be used within a VideoPanelProvider'
    );
  }
  return context;
}