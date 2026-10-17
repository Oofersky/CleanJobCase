/**
 * Branded confirm / notice dialog (replaces window.confirm / alert).
 * @param {{
 *   title: string,
 *   lead?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   danger?: boolean,
 *   notice?: boolean
 * }} opts
 * @returns {Promise<boolean>}
 */
export function confirmAction({
  title,
  lead = "",
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  danger = false,
  notice = false,
} = {}) {
  return new Promise((resolve) => {
    let dialog = document.querySelector("#confirm-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "confirm-dialog";
      dialog.className = "ui-dialog session-dialog";
      dialog.setAttribute("aria-labelledby", "confirm-dialog-title");
      dialog.innerHTML = `
        <form method="dialog" class="ui-dialog__form session-dialog__form" id="confirm-dialog-form">
          <h2 id="confirm-dialog-title"></h2>
          <p class="ui-dialog__lead session-dialog__lead" data-confirm-lead></p>
          <div class="ui-dialog__actions session-dialog__actions">
            <button class="btn btn--ghost" type="button" data-confirm-cancel>Отмена</button>
            <button class="btn btn--accent" type="submit" data-confirm-ok>Подтвердить</button>
          </div>
        </form>
      `;
      document.body.appendChild(dialog);
    }

    const titleEl = dialog.querySelector("#confirm-dialog-title");
    const leadEl = dialog.querySelector("[data-confirm-lead]");
    const cancelBtn = dialog.querySelector("[data-confirm-cancel]");
    const okBtn = dialog.querySelector("[data-confirm-ok]");
    const form = dialog.querySelector("#confirm-dialog-form");

    titleEl.textContent = title;
    leadEl.textContent = lead;
    leadEl.hidden = !lead;
    cancelBtn.textContent = cancelLabel;
    cancelBtn.hidden = notice;
    okBtn.textContent = confirmLabel;
    okBtn.className = danger ? "btn btn--ghost session-actions__danger" : "btn btn--accent";

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cancelBtn.removeEventListener("click", onCancel);
      form.removeEventListener("submit", onSubmit);
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
      resolve(value);
    };

    const onCancel = () => finish(false);
    const onSubmit = (event) => {
      event.preventDefault();
      finish(true);
    };

    cancelBtn.addEventListener("click", onCancel);
    form.addEventListener("submit", onSubmit);
    dialog.addEventListener("cancel", onCancel);

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    okBtn.focus();
  });
}
