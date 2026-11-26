import { useEffect } from 'react';

const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([readonly])',
  'select:not([disabled])',
  'textarea:not([disabled]):not([readonly])',
  'button[type="submit"]:not([disabled])',
  '[data-kbd-submit="true"]:not([disabled])',
  '[data-kbd-focusable="true"]:not([disabled])',
].join(',');

export function isElementVisible(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return el.getClientRects().length > 0;
}

export function getKeyboardNavElements(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return candidates.filter((el) => {
    if (!isElementVisible(el)) return false;
    if (el.dataset.kbdSkip === 'true') return false;
    // Skip tiny close buttons or icons unless explicitly marked focusable
    if (el.dataset.kbdClose === 'true') return false;
    return true;
  });
}

export function focusNextElement(
  container: HTMLElement | null,
  currentEl: HTMLElement | null,
  reverse = false
): boolean {
  if (!container) return false;
  const items = getKeyboardNavElements(container);
  if (items.length === 0) return false;

  const idx = currentEl ? items.indexOf(currentEl) : -1;
  let nextIdx: number;

  if (idx === -1) {
    nextIdx = reverse ? items.length - 1 : 0;
  } else {
    nextIdx = reverse ? idx - 1 : idx + 1;
    if (nextIdx >= items.length) nextIdx = items.length - 1;
    if (nextIdx < 0) nextIdx = 0;
  }

  const target = items[nextIdx];
  if (!target) return false;

  target.focus({ preventScroll: false });
  if (
    target instanceof HTMLInputElement &&
    target.type !== 'checkbox' &&
    target.type !== 'radio' &&
    target.type !== 'date' &&
    target.type !== 'number'
  ) {
    try {
      target.select();
    } catch {}
  }
  return true;
}

export function triggerSubmitInContainer(container: HTMLElement | null): boolean {
  if (!container) return false;
  const submitBtn =
    container.querySelector<HTMLButtonElement>('[data-kbd-submit="true"]:not([disabled])') ||
    container.querySelector<HTMLButtonElement>('button[type="submit"]:not([disabled])');

  if (submitBtn && isElementVisible(submitBtn)) {
    submitBtn.click();
    return true;
  }

  const form = container.querySelector('form');
  if (form) {
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
    return true;
  }
  return false;
}

export function findTopmostModalOverlay(): HTMLElement | null {
  const overlays = Array.from(
    document.querySelectorAll<HTMLElement>('.fixed.inset-0, [role="dialog"], [data-kbd-modal="true"]')
  ).filter((el) => isElementVisible(el));

  if (overlays.length === 0) return null;

  // Prefer highest z-index, then last in DOM
  overlays.sort((a, b) => {
    const za = parseInt(window.getComputedStyle(a).zIndex || '0', 10) || 0;
    const zb = parseInt(window.getComputedStyle(b).zIndex || '0', 10) || 0;
    return za - zb;
  });

  return overlays[overlays.length - 1] || null;
}

export function closeModalOverlay(overlay: HTMLElement | null): boolean {
  if (!overlay) return false;
  const explicitClose = overlay.querySelector<HTMLElement>('[data-kbd-close="true"]');
  if (explicitClose && isElementVisible(explicitClose)) {
    explicitClose.click();
    return true;
  }

  // Fallback: look for X button at modal header or cancel button
  const buttons = Array.from(overlay.querySelectorAll<HTMLButtonElement>('button:not([disabled])')).filter(isElementVisible);
  const cancelBtn = buttons.find((b) => {
    const txt = (b.textContent || '').trim();
    const aria = (b.getAttribute('aria-label') || '').trim();
    return txt === 'انصراف' || txt === 'بستن' || aria === 'بستن' || aria === 'Close';
  });
  if (cancelBtn) {
    cancelBtn.click();
    return true;
  }

  // Look for top-corner X icon button inside modal
  const iconCloseBtn = buttons.find((b) => (b.textContent || '').trim() === '' && b.querySelector('svg'));
  if (iconCloseBtn) {
    iconCloseBtn.click();
    return true;
  }
  return false;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'submit';
  }
  return target.isContentEditable;
}

/**
 * Global keyboard navigation controller for POS & Accounting screens and their modals:
 * - Enter inside form fields moves smoothly to the next field (Shift+Enter moves back)
 * - Enter on a submit button submits natively
 * - Ctrl+Enter / Cmd+Enter submits the active form or topmost modal immediately
 * - Escape closes the topmost modal / drawer
 */
export function useWorkspaceFormKeyboardNav(
  enabled: boolean,
  fallbackWorkspaceRef?: React.RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const activeModal = findTopmostModalOverlay();
      const scopeContainer =
        activeModal ||
        target?.closest<HTMLElement>('form, [data-kbd-scope="true"]') ||
        fallbackWorkspaceRef?.current ||
        null;

      // Escape -> close topmost modal or blur focused search input
      if (e.key === 'Escape') {
        if (activeModal) {
          e.preventDefault();
          closeModalOverlay(activeModal);
          return;
        }
        if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) {
          target.blur();
          return;
        }
      }

      if (!scopeContainer) return;

      // Ctrl+Enter / Cmd+Enter -> submit active form or modal immediately
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (triggerSubmitInContainer(scopeContainer)) {
          e.preventDefault();
        }
        return;
      }

      // Enter / Shift+Enter -> walk inputs & selects smoothly
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!target) return;
        if (target.dataset.kbdCustomEnter === 'true') return;

        // Allow multiline typing in textarea
        if (target.tagName === 'TEXTAREA') return;

        // Allow native Enter activation on buttons and links
        if (target.tagName === 'BUTTON' || target.tagName === 'A') return;

        // If inside react-multi-date-picker calendar input while calendar is open, let it confirm date
        if (target.closest('.rmdp-container') && document.querySelector('.rmdp-wrapper')) {
          return;
        }

        const isInputOrSelect = target.tagName === 'INPUT' || target.tagName === 'SELECT';
        if (!isInputOrSelect) return;

        if (
          target instanceof HTMLInputElement &&
          (target.type === 'submit' || target.type === 'button' || target.type === 'reset')
        ) {
          return;
        }

        const moved = focusNextElement(scopeContainer, target, e.shiftKey);
        if (moved) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, fallbackWorkspaceRef]);
}
