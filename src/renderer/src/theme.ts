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

/** Sfumature Tailwind: chiave = shade, valore = frazione di mix.
 *  50–400 schiariscono verso il bianco; 600–900 scuriscono verso il nero. */
const MIX_BIANCO: Record<number, number> = { 50: 0.9, 100: 0.8, 200: 0.6, 300: 0.4, 400: 0.2 }
const MIX_NERO: Record<number, number> = { 600: 0.12, 700: 0.24, 800: 0.36, 900: 0.48 }

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

/**
 * Genera l'intera scala primaria 50–900 da un colore base "r,g,b" (la sfumatura 500).
 * Ritorna una mappa shade → tripletta "r g b" (separata da spazio, formato richiesto da Tailwind),
 * oppure null se l'input non è una tripletta valida.
 */
export function scalaPrimaria(rgb: string): Record<number, string> | null {
  const parts = rgb.split(',').map((s) => Number(s.trim()))
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null
  const [r, g, b] = parts.map(clamp)

  const scala: Record<number, string> = {}
  for (const shade of [50, 100, 200, 300, 400] as const) {
    const p = MIX_BIANCO[shade]
    scala[shade] = `${clamp(r + (255 - r) * p)} ${clamp(g + (255 - g) * p)} ${clamp(b + (255 - b) * p)}`
  }
  scala[500] = `${r} ${g} ${b}`
  for (const shade of [600, 700, 800, 900] as const) {
    const p = MIX_NERO[shade]
    scala[shade] = `${clamp(r * (1 - p))} ${clamp(g * (1 - p))} ${clamp(b * (1 - p))}`
  }
  return scala
}

/** Applica il colore primario custom (stringa "r,g,b") impostando tutte le variabili CSS 50–900. */
export function applyPrimaryColor(primaryColor: string): void {
  const scala = scalaPrimaria(primaryColor)
  if (!scala) return
  const root = document.documentElement
  for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const) {
    root.style.setProperty(`--color-primary-${shade}`, scala[shade])
  }
}
