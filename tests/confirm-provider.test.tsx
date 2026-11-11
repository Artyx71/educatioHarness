// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConfirmationProvider, useConfirm } from '../src/components/ConfirmProvider';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Confirm = ReturnType<typeof useConfirm>;
let root: Root | undefined;
let container: HTMLDivElement | undefined;

function Harness({ register }: { register: (confirm: Confirm) => void }) {
  const confirm = useConfirm();
  useEffect(() => register(confirm), [confirm, register]);
  return <button type="button">Вернуться сюда</button>;
}

async function mount(): Promise<Confirm> {
  container = document.createElement('div');
  document.body.appendChild(container);
  let request: Confirm | undefined;
  await act(async () => {
    root = createRoot(container!);
    root.render(<ConfirmationProvider><Harness register={confirm => { request = confirm; }} /></ConfirmationProvider>);
  });
  if (!request) throw new Error('Confirmation hook was not mounted');
  return request;
}

function button(label: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll('button')).find(item => item.textContent === label);
  if (!match) throw new Error(`Button ${label} not found`);
  return match;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('in-app confirmation', () => {
  it('does not approve an action when the user cancels', async () => {
    const confirm = await mount();
    const previousFocus = button('Вернуться сюда');
    previousFocus.focus();
    let decision!: Promise<boolean>;
    await act(async () => { decision = confirm('Данные будут заменены', { title: 'Импорт', kind: 'warning' }); });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Данные будут заменены');
    await act(async () => button('Отмена').click());
    expect(await decision).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(previousFocus);
  });

  it('treats Escape as cancellation', async () => {
    const confirm = await mount();
    let decision!: Promise<boolean>;
    await act(async () => { decision = confirm('Удалить данные', { title: 'Удаление' }); });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(await decision).toBe(false);
  });

  it('keeps the first request until explicit approval and rejects a second request', async () => {
    const confirm = await mount();
    let first!: Promise<boolean>;
    await act(async () => { first = confirm('Первое действие', { title: 'Первый запрос' }); });
    expect(await confirm('Второе действие', { title: 'Второй запрос' })).toBe(false);
    expect(document.body.textContent).toContain('Первое действие');
    expect(document.body.textContent).not.toContain('Второе действие');
    await act(async () => button('Подтвердить').click());
    expect(await first).toBe(true);
  });

  it('rejects a pending action if its provider unmounts', async () => {
    const confirm = await mount();
    let decision!: Promise<boolean>;
    await act(async () => { decision = confirm('Удалить данные', { title: 'Удаление' }); });
    await act(async () => root!.unmount());
    root = undefined;
    expect(await decision).toBe(false);
  });
});
