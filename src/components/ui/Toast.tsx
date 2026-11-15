import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev.slice(-3), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3600);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none"
        >
          {toasts.map(item => (
            <div
              key={item.id}
              className="pointer-events-auto flex items-start gap-2.5 p-3 rounded-[10px] bg-[var(--surface-elevated)] border border-[var(--border-strong)] shadow-[var(--shadow-dialog)] animate-page-in"
            >
              {item.tone === 'success' && (
                <CheckCircle2 className="w-4 h-4 text-[var(--status-success-fg)] shrink-0 mt-0.5" />
              )}
              {item.tone === 'error' && (
                <AlertCircle className="w-4 h-4 text-[var(--status-danger-fg)] shrink-0 mt-0.5" />
              )}
              {item.tone === 'info' && (
                <Info className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
              )}

              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {item.title}
                </div>
                {item.description && (
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                    {item.description}
                  </p>
                )}
              </div>

              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(item.id)}
                className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
};
