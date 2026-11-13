/**
 * keep the dark class in sync with the system color scheme
 */
export function syncTheme() {
  const query = window.matchMedia("(prefers-color-scheme: dark)");

  /**
   * apply the current scheme to the document
   */
  const apply = () =>
    document.documentElement.classList.toggle("dark", query.matches);

  apply();
  query.addEventListener("change", apply);
}
