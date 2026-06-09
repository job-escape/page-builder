"use client";

import { createContext, PropsWithChildren, useContext } from "react";

/**
 * Resolves a dynamic-component reference (`component-type="component-ref"`) to
 * its published MDX/HTML. The library stays decoupled from any specific API —
 * the consumer plugs in a resolver via {@link ComponentResolverProvider} that
 * knows how to fetch a component by id. Returns `null` when the component can't
 * be resolved.
 */
export type ComponentResolver = (componentId: string) => Promise<string | null>;

const ComponentResolverContext = createContext<ComponentResolver | null>(null);

export function ComponentResolverProvider({
  resolver,
  children,
}: PropsWithChildren<{ resolver: ComponentResolver }>) {
  return (
    <ComponentResolverContext.Provider value={resolver}>
      {children}
    </ComponentResolverContext.Provider>
  );
}

export function useComponentResolver(): ComponentResolver | null {
  return useContext(ComponentResolverContext);
}
