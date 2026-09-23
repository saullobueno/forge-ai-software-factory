import type { ReactNode } from 'react';

/**
 * Badge neutro (borda + tokens existentes de tema, spec — "reuse os
 * tokens/classes já definidos em globals.css, não crie um novo sistema de
 * cor"). `tone` só adiciona um acento sutil de cor (com par light/dark
 * explícito) para status que se beneficiam de destaque visual rápido —
 * nunca é o único sinal (o texto do rótulo sempre está presente).
 */
const TONE_CLASSES: Record<'neutral' | 'positive' | 'attention' | 'critical', string> = {
  neutral: 'border-border text-foreground',
  positive: 'border-emerald-600/40 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-400',
  attention: 'border-amber-600/40 text-amber-700 dark:border-amber-400/40 dark:text-amber-400',
  critical: 'border-red-600/40 text-red-700 dark:border-red-400/40 dark:text-red-400',
};

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'positive' | 'attention' | 'critical';
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
