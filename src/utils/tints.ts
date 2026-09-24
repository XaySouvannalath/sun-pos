import type { Tint } from '@/types'

/** Soft category tints, muted in both themes to keep the grid calm. */
export const tintClasses: Record<Tint, { tile: string; dot: string }> = {
  sage: { tile: 'bg-emerald-100/70 dark:bg-emerald-900/25', dot: 'bg-emerald-500/70' },
  amber: { tile: 'bg-amber-100/70 dark:bg-amber-900/25', dot: 'bg-amber-500/70' },
  rose: { tile: 'bg-rose-100/70 dark:bg-rose-900/25', dot: 'bg-rose-400/70' },
  sky: { tile: 'bg-sky-100/70 dark:bg-sky-900/25', dot: 'bg-sky-500/70' },
  lilac: { tile: 'bg-violet-100/70 dark:bg-violet-900/25', dot: 'bg-violet-400/70' },
  sand: { tile: 'bg-stone-200/70 dark:bg-stone-700/25', dot: 'bg-stone-500/70' },
}

export const tintNames = Object.keys(tintClasses) as Tint[]
