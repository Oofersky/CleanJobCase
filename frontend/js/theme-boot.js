(() => {
  const lightBg = "#f2f2f2";
  const darkBg = "#000000";
  try {
    const saved = localStorage.getItem("pv-theme");
    const theme = saved === "light" || saved === "dark" ? saved : "dark";
    const dark = theme === "dark";
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.backgroundColor = dark ? darkBg : lightBg;
    root.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? darkBg : lightBg;
  } catch {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.backgroundColor = darkBg;
  }
})();
