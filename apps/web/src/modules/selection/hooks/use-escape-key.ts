import { useEffect } from 'react';

/**
 * Mounts a global `keydown` listener that fires `onEscape` when the
 * Escape key is pressed and `enabled` is true. The listener is
 * registered once for the component's lifetime; the latest `onEscape`
 * is read via a closure-captured ref-like pattern through the deps
 * array so callers can pass an inline function without re-binding the
 * DOM listener.
 */
export function useEscapeKey(enabled: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onEscape]);
}
