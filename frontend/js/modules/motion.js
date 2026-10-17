/**
 * MentOrAI motion — landing polish (Jakub): purposeful enter/stagger,
 * calm hero drift, fast control feedback. Always respects reduced-motion.
 */
const reduce =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let started = false;

function staggerChildren(root, baseDelay = 0) {
  const nodes = [...root.querySelectorAll("[data-reveal-child]")].filter((el) => {
    const owner = el.closest("[data-reveal], .land-hero");
    return owner === root;
  });
  nodes.forEach((el, index) => {
    el.style.setProperty("--child-delay", `${baseDelay + Math.min(index * 70, 420)}ms`);
  });
}

export function initPageMotion() {
  if (started) return;
  started = true;

  document.documentElement.classList.add("js-motion");

  const hero = document.querySelector(".land-hero");
  if (hero) {
    staggerChildren(hero, 40);
    if (reduce) {
      hero.classList.add("is-ready");
      hero.querySelectorAll("[data-reveal-child]").forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
    } else {
      requestAnimationFrame(() => {
        hero.classList.add("is-ready");
      });
    }
  }

  if (reduce) {
    document.documentElement.classList.add("motion-reduce");
    document.querySelectorAll("[data-reveal], .reveal").forEach((el) => {
      el.classList.add("is-visible");
      el.querySelectorAll("[data-reveal-child]").forEach((child) => {
        child.style.opacity = "1";
        child.style.transform = "none";
      });
    });
    return;
  }

  document.body.classList.add("page-enter");
  requestAnimationFrame(() => {
    document.body.classList.add("page-enter--ready");
  });

  const reveals = document.querySelectorAll("[data-reveal], .reveal");
  if (!reveals.length || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => {
      staggerChildren(el);
      el.classList.add("is-visible");
    });
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        staggerChildren(el, 0);
        el.classList.add("is-visible");
        io.unobserve(el);
      });
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.14 }
  );

  reveals.forEach((el) => {
    staggerChildren(el);
    io.observe(el);
  });
}

export function pulse(el) {
  if (!el || reduce) return;
  el.classList.remove("ui-pulse");
  void el.offsetWidth;
  el.classList.add("ui-pulse");
  el.addEventListener(
    "animationend",
    () => {
      el.classList.remove("ui-pulse");
    },
    { once: true }
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPageMotion);
} else {
  initPageMotion();
}
