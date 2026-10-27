import Swal from 'sweetalert2';

/**
 * In-app dialogs (SweetAlert2) in place of the browser's confirm / alert /
 * prompt, styled to match the app. All return promises.
 */

const CLASSES = {
  popup: '!rounded-3xl !p-6 !font-sans',
  title: '!text-xl !font-bold !text-slate-900 !p-0',
  htmlContainer: '!text-sm !text-slate-600 !mt-3 !mx-0 !text-left whitespace-pre-line',
  actions: '!mt-6 !w-full !justify-end gap-2',
  confirmButton:
    'rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
  cancelButton:
    'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
  input: '!mx-0 !mt-4 !w-full !rounded-lg !border-slate-300 !text-base !shadow-none focus:!border-teal-600 focus:!ring-1 focus:!ring-teal-600',
  inputLabel: '!justify-start !mx-0 !mt-4 !text-xs !font-semibold !uppercase !tracking-wide !text-slate-500',
  icon: '!mt-0 !mb-4 !scale-75',
};

const base = Swal.mixin({ buttonsStyling: false, reverseButtons: true, customClass: CLASSES });

const DANGER =
  'rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400';

export interface ConfirmOptions {
  /** Body text; newlines are kept. */
  text?: string;
  confirmText?: string;
  cancelText?: string;
  /** A red button and a warning icon, for deletes and other losses. */
  danger?: boolean;
}

/** Yes/no question. Resolves true only when confirmed. */
export async function confirmDialog(title: string, opts: ConfirmOptions = {}): Promise<boolean> {
  const r = await base.fire({
    title,
    text: opts.text,
    icon: opts.danger ? 'warning' : 'question',
    iconColor: opts.danger ? '#dc2626' : '#0f766e',
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? 'OK',
    cancelButtonText: opts.cancelText ?? 'Cancel',
    customClass: opts.danger ? { ...CLASSES, confirmButton: DANGER } : CLASSES,
  });
  return r.isConfirmed;
}

/** Unsaved-changes guard used before replacing or closing the project. */
export const confirmDiscard = (action: string) =>
  confirmDialog('You have unsaved changes', {
    text: `${action} anyway? An autosave copy is kept, so you can recover it from the start page.`,
    confirmText: action,
    danger: true,
  });

/** A message with one button. */
export async function alertDialog(title: string, text?: string, kind: 'error' | 'info' | 'success' = 'error'): Promise<void> {
  await base.fire({
    title,
    text,
    icon: kind,
    iconColor: kind === 'error' ? '#dc2626' : '#0f766e',
    confirmButtonText: 'OK',
  });
}

/** Asks for one line of text. Resolves null when cancelled. */
export async function promptDialog(
  title: string,
  opts: { label?: string; value?: string; placeholder?: string; required?: boolean; confirmText?: string } = {},
): Promise<string | null> {
  const r = await base.fire<string>({
    title,
    input: 'text',
    inputLabel: opts.label,
    inputValue: opts.value ?? '',
    inputPlaceholder: opts.placeholder,
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? 'OK',
    inputValidator: (v) => (opts.required && !v.trim() ? 'Please enter a value.' : null),
  });
  return r.isConfirmed ? (r.value ?? '') : null;
}
