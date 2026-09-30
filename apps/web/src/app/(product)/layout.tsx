import type { ReactNode } from 'react';
import { CommandPalette } from '@/components/command-palette';
import { ProductShell } from './product-shell';

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <ProductShell>
      {children}
      <CommandPalette />
    </ProductShell>
  );
}
