import { useCallback, useState } from "react";
import { hasSeenIntro, markIntroSeen } from "../onboarding/introStore";

export type Intro = {
  /** Whether the intro is what the app should be showing right now. */
  pending: boolean;
  /**
   * Whether this launch began with the intro — fixed for the life of the app,
   * where `pending` goes false the moment it is read through. What it decides
   * is the boot screen behind it: someone who has just had the app's name on
   * three pages does not need it a fourth time.
   */
  firstRun: boolean;
  /** Accepts the intro: remembers it, and lets boot start. */
  complete: () => void;
};

/**
 * Whether to open on the intro, and the one way out of it.
 *
 * Read once, synchronously, from the initialiser — the app has to know which
 * screen it opens on before it draws a frame, and an effect would land after
 * one has gone out.
 *
 * The state matters beyond the screen: boot asks for the camera and a fix as
 * soon as it starts, so nothing may boot until this says the intro is done, or
 * the system's prompts arrive over the explanation of them. `src/App.tsx` is
 * split around that.
 */
export function useIntro(): Intro {
  const [firstRun] = useState(() => !hasSeenIntro());
  const [pending, setPending] = useState(firstRun);

  const complete = useCallback(() => {
    markIntroSeen();
    setPending(false);
  }, []);

  return { pending, firstRun, complete };
}
