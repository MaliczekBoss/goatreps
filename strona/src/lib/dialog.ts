/**
 * Zamyka <dialog> z animacją wyjścia: atrybut data-closing włącza animację w CSS (dialog.modal[data-closing]),
 * a właściwe close() przychodzi po jej końcu. Przy ograniczonym ruchu zamyka od razu.
 */
export function closeDialog(dialog: HTMLDialogElement | null, ms = 200) {
  if (!dialog?.open || dialog.dataset.closing !== undefined) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return dialog.close();
  dialog.dataset.closing = "";
  setTimeout(() => {
    delete dialog.dataset.closing;
    dialog.close();
  }, ms);
}
