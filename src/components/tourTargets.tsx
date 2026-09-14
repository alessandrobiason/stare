import React, { createContext, useCallback, useContext, useState } from "react";
import type { View } from "react-native";
import type { TourTarget } from "../onboarding/tourSteps";

/**
 * Where the controls the tour points at are, found by asking them.
 *
 * Each control hands its view over with `useTourTarget`, and the tour measures
 * it on screen (`GuideTour`). Measured rather than computed from the layout's
 * constants, because the layout moves: the count grows with its number, the
 * passes card comes and goes, and a compass notice pushes the bottom stack
 * down.
 *
 * Outside a provider the hook is a no-op, so a control drawn somewhere with no
 * tour around it does not have to know.
 */
export type TourTargets = {
  attach: (id: TourTarget, node: View) => void;
  detach: (id: TourTarget, node: View) => void;
  node: (id: TourTarget) => View | null;
};

export function createTourTargets(): TourTargets {
  const nodes = new Map<TourTarget, View>();
  return {
    attach: (id, node) => {
      nodes.set(id, node);
    },
    // Only if it is still the one attached: a control remounting attaches its
    // new view before the old one's cleanup runs.
    detach: (id, node) => {
      if (nodes.get(id) === node) nodes.delete(id);
    },
    node: (id) => nodes.get(id) ?? null
  };
}

const TourTargetsContext = createContext<TourTargets | null>(null);

export const TourTargetsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [targets] = useState(createTourTargets);
  return <TourTargetsContext.Provider value={targets}>{children}</TourTargetsContext.Provider>;
};

export function useTourTargets(): TourTargets | null {
  return useContext(TourTargetsContext);
}

/** A ref to put on the view the tour should light up for `id`. */
export function useTourTarget(id: TourTarget): React.RefCallback<View> {
  const targets = useContext(TourTargetsContext);
  return useCallback(
    (node: View | null) => {
      if (!targets || !node) return;
      targets.attach(id, node);
      return () => targets.detach(id, node);
    },
    [targets, id]
  );
}
