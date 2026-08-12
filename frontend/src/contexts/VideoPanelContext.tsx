import { createContext, useCallback, useContext, useState } from 'react';

const MAX_SIMULTANEOUS_PANELS = 4;

interface VideoPanelContextValue {
  activePanelIds: ReadonlySet<string>;
  registerPanel: (id: string) => boolean;
  unregisterPanel: (id: string) => void;
}

const VideoPanelContext = createContext<VideoPanelContextValue | null>(null);

export function VideoPanelProvider({ children }: { children: React.ReactNode }) {
  const [activePanelIds, setActivePanelIds] = useState<Set<string>>(new Set());

  const registerPanel = useCallback((id: string): boolean => {
    let accepted = false;
    setActivePanelIds((prev) => {
      if (prev.has(id) || prev.size >= MAX_SIMULTANEOUS_PANELS) {
        accepted = prev.has(id);
        return prev;
      }
      accepted = true;
      return new Set([...prev, id]);
    });
    return accepted;
  }, []);

  const unregisterPanel = useCallback((id: string) => {
    setActivePanelIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return (
    <VideoPanelContext.Provider
      value={{ activePanelIds, registerPanel, unregisterPanel }}
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
