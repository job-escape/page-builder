import { useEffect } from "react";

import { matchesDeclaration } from "../persistence";
import type { FunnelStore } from "../store";
import type { VariableTable, VariableValue } from "../types";

/**
 * What the host sets while the funnel runs — data it loaded itself: the plans
 * it sells, a profile. Written into the store whenever the object changes, so
 * a host that fetches after the page is up hands the answer over when it has
 * it. Only declared names whose value matches the declaration are taken, as
 * with `initialValues`; a name the design does not declare is simply not this
 * design's. The funnel fetches none of it: what a product has to load is the
 * product's to know, and not every host has the same things.
 */
export function useHostValues(
  values: Readonly<Record<string, VariableValue>> | undefined,
  store: FunnelStore,
  table: VariableTable,
): void {
  useEffect(() => {
    if (!values) return;
    Object.entries(values).forEach(([name, value]) => {
      const decl = table[name];
      if (decl && !decl.formula && matchesDeclaration(decl, value)) store.set(name, value);
    });
  }, [values, store, table]);
}
