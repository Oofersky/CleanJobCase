import "./theme.js";

function faqBody(item) {
  return item.querySelector(".land-faq__body");
}

function clearAnim(body) {
  if (body._faqDone) {
    body.removeEventListener("transitionend", body._faqDone);
    body._faqDone = null;
  }
}

function openFaq(item) {
  const body = faqBody(item);
  clearAnim(body);
  item.open = true;
  body.style.height = "0px";
  body.offsetHeight;
  body.style.height = `${body.scrollHeight}px`;
  body._faqDone = (e) => {
    if (e.target !== body || e.propertyName !== "height") return;
    body.style.height = "auto";
    clearAnim(body);
  };
  body.addEventListener("transitionend", body._faqDone);
}

function closeFaq(item) {
  const body = faqBody(item);
  if (!item.open) return;
  clearAnim(body);
  body.style.height = `${body.getBoundingClientRect().height}px`;
  body.offsetHeight;
  body.style.height = "0px";
  body._faqDone = (e) => {
    if (e.target !== body || e.propertyName !== "height") return;
    item.open = false;
    body.style.height = "";
    clearAnim(body);
  };
  body.addEventListener("transitionend", body._faqDone);
}

document.querySelectorAll(".land-faq__item").forEach((item) => {
  item.querySelector("summary").addEventListener("click", (e) => {
    e.preventDefault();
    if (item.open) {
      closeFaq(item);
      return;
    }
    document.querySelectorAll(".land-faq__item[open]").forEach((other) => {
      if (other !== item) closeFaq(other);
    });
    openFaq(item);
  });
});

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const leg = document.querySelector(".land-leg");
const qsRoot = document.querySelector(".land-hero-qs");

if (!reduced && leg) {
  let legTimer = 0;
  window.addEventListener(
    "pointermove",
    () => {
      leg.classList.add("is-walking");
      clearTimeout(legTimer);
      legTimer = setTimeout(() => leg.classList.remove("is-walking"), 180);
    },
    { passive: true },
  );
}

if (!reduced && qsRoot) {
  const hit = qsRoot.querySelector(".land-hero-qs__hit");
  const marks = [...qsRoot.querySelectorAll(".q")];
  if (!hit || !marks.length) {
    /* no-op */
  } else {
    let leaveTimer = 0;

    const clearInline = () => {
      for (const el of marks) {
        el.style.animation = "";
        el.style.transform = "";
        el.style.transition = "";
      }
    };

    /** зафиксировать кадр и мягко вернуть в покой */
    const settle = () => {
      for (const el of marks) {
        const matrix = getComputedStyle(el).transform;
        el.style.animation = "none";
        el.style.transition = "none";
        el.style.transform = matrix === "none" ? "none" : matrix;
      }
      qsRoot.classList.remove("is-q-live");
      void qsRoot.offsetWidth;
      requestAnimationFrame(() => {
        for (const el of marks) {
          el.style.transition = "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.transform = "none";
        }
      });
    };

    hit.addEventListener("pointerenter", () => {
      clearTimeout(leaveTimer);
      clearInline();
      qsRoot.classList.add("is-q-live");
    });
    hit.addEventListener("pointerleave", () => {
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(settle, 40);
    });
  }
}
