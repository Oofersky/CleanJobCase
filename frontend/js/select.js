/** Custom listbox: menu portals to document.body so nothing clips it. */

const OPEN = new Set();

function closeAll(except) {
  for (const api of [...OPEN]) {
    if (api !== except) api.close();
  }
}

function optionList(select) {
  return [...select.options].map((opt, index) => ({
    value: opt.value,
    label: opt.textContent || opt.value,
    disabled: opt.disabled,
    index,
  }));
}

function selectedLabel(select) {
  const opt = select.selectedOptions[0];
  return opt ? opt.textContent || opt.value : "";
}

export function syncSelect(select) {
  select?._pvSelect?.refresh();
}

export function enhanceSelect(select) {
  if (!select || select.dataset.enhanced === "1") return select?._pvSelect;
  select.dataset.enhanced = "1";
  select.classList.add("c-select__native");
  select.setAttribute("tabindex", "-1");
  select.setAttribute("aria-hidden", "true");

  const wrap = document.createElement("div");
  wrap.className = "c-select";
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "c-select__trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  if (select.id) {
    trigger.id = `${select.id}-trigger`;
    document.querySelectorAll(`label[for="${select.id}"]`).forEach((label) => {
      label.setAttribute("for", trigger.id);
    });
  }
  const labelledBy = select.getAttribute("aria-label") || select.name || "Список";
  trigger.setAttribute("aria-label", labelledBy);

  const valueEl = document.createElement("span");
  valueEl.className = "c-select__value";
  const chevron = document.createElement("span");
  chevron.className = "c-select__chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
  trigger.append(valueEl, chevron);

  const menu = document.createElement("div");
  menu.className = "c-select__menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  menu.id = `${select.id || "select"}-menu-${Math.random().toString(36).slice(2, 7)}`;
  trigger.setAttribute("aria-controls", menu.id);

  wrap.appendChild(trigger);
  // menu lives on body while open — never clipped by cards/filters
  document.body.appendChild(menu);

  let open = false;
  let activeIndex = -1;

  function refresh() {
    valueEl.textContent = selectedLabel(select) || "—";
    const items = optionList(select);
    menu.innerHTML = items
      .map((item) => {
        const selected = item.value === select.value;
        const disabled = item.disabled ? 'aria-disabled="true"' : "";
        return `<div class="c-select__option${selected ? " is-selected" : ""}${item.disabled ? " is-disabled" : ""}" role="option" data-value="${escapeAttr(item.value)}" data-index="${item.index}" aria-selected="${selected ? "true" : "false"}" ${disabled}>${escapeHtml(item.label)}</div>`;
      })
      .join("");
    wrap.classList.toggle("is-disabled", select.disabled);
    trigger.disabled = select.disabled;
  }

  function setActive(index) {
    const opts = [...menu.querySelectorAll(".c-select__option:not(.is-disabled)")];
    if (!opts.length) return;
    activeIndex = ((index % opts.length) + opts.length) % opts.length;
    opts.forEach((el, i) => el.classList.toggle("is-active", i === activeIndex));
    opts[activeIndex]?.scrollIntoView({ block: "nearest" });
  }

  function placeMenu() {
    const rect = trigger.getBoundingClientRect();
    const maxH = Math.min(280, window.innerHeight * 0.5);
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const openUp = spaceBelow < 140 && rect.top > spaceBelow;
    const width = Math.round(Math.max(rect.width, 160));
    let left = Math.round(rect.left);
    left = Math.min(left, window.innerWidth - width - 8);
    left = Math.max(8, left);

    menu.style.cssText = "";
    menu.classList.toggle("is-shown", open);
    menu.style.position = "fixed";
    menu.style.left = `${left}px`;
    menu.style.width = `${width}px`;
    menu.style.zIndex = "10000";
    menu.style.margin = "0";
    if (openUp) {
      menu.style.top = "auto";
      menu.style.bottom = `${Math.round(window.innerHeight - rect.top + gap)}px`;
      menu.style.maxHeight = `${Math.round(Math.min(maxH, rect.top - gap))}px`;
      menu.dataset.placement = "top";
    } else {
      menu.style.bottom = "auto";
      menu.style.top = `${Math.round(rect.bottom + gap)}px`;
      menu.style.maxHeight = `${Math.round(Math.min(maxH, Math.max(spaceBelow, 120)))}px`;
      menu.dataset.placement = "bottom";
    }
  }

  function onReposition() {
    if (open) placeMenu();
  }

  function openMenu() {
    if (select.disabled || open) return;
    closeAll(api);
    open = true;
    OPEN.add(api);
    menu.hidden = false;
    wrap.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    trigger.classList.add("is-open");
    placeMenu();
    const selected = menu.querySelector(".c-select__option.is-selected");
    const opts = [...menu.querySelectorAll(".c-select__option:not(.is-disabled)")];
    activeIndex = Math.max(0, opts.indexOf(selected));
    setActive(activeIndex);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    requestAnimationFrame(() => {
      menu.classList.add("is-shown");
    });
  }

  function close() {
    if (!open) return;
    open = false;
    OPEN.delete(api);
    menu.classList.remove("is-shown");
    trigger.setAttribute("aria-expanded", "false");
    trigger.classList.remove("is-open");
    wrap.classList.remove("is-open");
    window.removeEventListener("resize", onReposition);
    window.removeEventListener("scroll", onReposition, true);
    window.setTimeout(() => {
      if (!open) menu.hidden = true;
    }, 160);
  }

  function choose(value) {
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    refresh();
    close();
    trigger.focus();
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (open) close();
    else openMenu();
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) openMenu();
      else if (event.key === "ArrowDown") setActive(activeIndex + 1);
      else if (event.key === "Enter" || event.key === " ") {
        const opts = [...menu.querySelectorAll(".c-select__option:not(.is-disabled)")];
        const el = opts[activeIndex];
        if (el) choose(el.getAttribute("data-value"));
      }
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    }
  });

  menu.addEventListener("click", (event) => {
    const opt = event.target.closest(".c-select__option");
    if (!opt || opt.classList.contains("is-disabled")) return;
    event.preventDefault();
    event.stopPropagation();
    choose(opt.getAttribute("data-value"));
  });

  menu.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!open) return;
      if (wrap.contains(event.target) || menu.contains(event.target)) return;
      close();
    },
    true
  );

  select.addEventListener("change", refresh);

  const api = { refresh, close, open: openMenu, wrap, menu };
  select._pvSelect = api;
  refresh();
  return api;
}

export function enhanceAll(root = document) {
  root.querySelectorAll("select").forEach((el) => enhanceSelect(el));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
