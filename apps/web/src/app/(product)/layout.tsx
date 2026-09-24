import type { ReactNode } from 'react';
import { ProductShell } from './product-shell';

export default function ProductLayout({ children }: { children: ReactNode }) {
  return <ProductShell>{children}</ProductShell>;
}
