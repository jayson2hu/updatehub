'use client';

import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import NextLink from 'next/link';
import { designLink, type DesignVariant } from '@/lib/design-options';

const DesignContext = createContext<DesignVariant | null>(null);

export function DesignProvider({ variant, children }: { variant: DesignVariant | null; children: ReactNode }) {
  return <DesignContext.Provider value={variant}>{children}</DesignContext.Provider>;
}

export function useDesign() { return useContext(DesignContext); }

export function StationLink({ href, ...props }: ComponentProps<typeof NextLink>) {
  const variant = useDesign();
  return <NextLink href={typeof href === 'string' ? designLink(href, variant) : href} {...props}/>;
}
