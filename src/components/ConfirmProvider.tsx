import * as Dialog from '@radix-ui/react-dialog';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type ConfirmOptions = { title: string; kind?: 'warning'; confirmLabel?: string };
type Confirm = (message: string, options: ConfirmOptions) => Promise<boolean>;
type Pending = { message: string; options: ConfirmOptions; resolve: (accepted: boolean) => void; previousFocus: HTMLElement | null };

const ConfirmationContext = createContext<Confirm | null>(null);

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error('ConfirmationProvider is missing');
  return confirm;
}

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const confirm = useCallback<Confirm>((message, options) => {
    // A second destructive action must not silently replace the first prompt.
    if (pendingRef.current) return Promise.resolve(false);
    return new Promise(resolve => {
      const request = { message, options, resolve, previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null };
      pendingRef.current = request;
      setPending(request);
    });
  }, []);

  const settle = useCallback((accepted: boolean) => {
    const request = pendingRef.current;
    if (!request) return;
    pendingRef.current = null;
    setPending(null);
    request.resolve(accepted);
    // Radix normally restores a trigger; these prompts are opened from async actions.
    setTimeout(() => request.previousFocus?.focus(), 0);
  }, []);

  useEffect(() => () => {
    // Do not leave an awaiting import or deletion hanging if the view unmounts.
    pendingRef.current?.resolve(false);
    pendingRef.current = null;
  }, []);

  return <ConfirmationContext.Provider value={confirm}>
    {children}
    <Dialog.Root open={!!pending} onOpenChange={open => { if (!open) settle(false); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="confirm-overlay" />
        <Dialog.Content className="confirm-dialog" onCloseAutoFocus={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
          <Dialog.Title>{pending?.options.title}</Dialog.Title>
          <Dialog.Description>{pending?.message}</Dialog.Description>
          <div className="confirm-actions">
            <button type="button" className="button secondary" onClick={() => settle(false)}>Отмена</button>
            <button type="button" className={`button ${pending?.options.kind === 'warning' ? 'confirm-warning' : 'primary'}`} onClick={() => settle(true)}>{pending?.options.confirmLabel ?? 'Подтвердить'}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </ConfirmationContext.Provider>;
}
