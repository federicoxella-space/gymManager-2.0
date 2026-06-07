/** Applica il tema (light/dark/system) al documento. */
export function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }
}

/** Applica il colore primario custom (stringa "r,g,b") alle variabili CSS. */
export function applyPrimaryColor(primaryColor: string): void {
  document.documentElement.style.setProperty('--color-primary-500', primaryColor)
}
