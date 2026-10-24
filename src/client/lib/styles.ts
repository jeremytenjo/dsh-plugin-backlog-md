declare const __DSHBM_TAILWIND_CSS__: string;

/** Inject the plugin's scoped Tailwind bundle once. */
export function ensureTailwindStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector('style[data-dshbm-tailwind]')) return;
  const style = document.createElement('style');
  style.dataset.dshbmTailwind = '';
  style.textContent = typeof __DSHBM_TAILWIND_CSS__ === 'string' ? __DSHBM_TAILWIND_CSS__ : '';
  document.head.appendChild(style);
}

export function removeTailwindStyles(): void {
  if (typeof document === 'undefined') return;
  document.querySelector('style[data-dshbm-tailwind]')?.remove();
}
