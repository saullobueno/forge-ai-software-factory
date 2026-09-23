import Link from 'next/link';
import { Fragment } from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Breadcrumb discreto (spec §4 — "sidebar recolhível, breadcrumb
 * discreto... inspirado em GitHub, Linear, Vercel"). Cada página monta os
 * próprios itens (nome do projeto/tarefa só é conhecido depois do fetch) —
 * não deriva automaticamente da URL.
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${index}`}>
          {index > 0 && (
            <span aria-hidden className="text-muted-foreground/60">
              /
            </span>
          )}
          {item.href ? (
            <Link href={item.href} className="transition-colors hover:text-foreground hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
