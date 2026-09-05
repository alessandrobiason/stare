import React from "react";

type Props = {
  /** Called with anything thrown while rendering the subtree. */
  onError: (error: unknown) => void;
  children: React.ReactNode;
};

type State = { crashed: boolean };

/**
 * Catches render-time failures below it and hands them to `onError`, which
 * sends the app back to the boot screen.
 *
 * React tears down a subtree that throws, so without this the app would be left
 * showing a blank frame with the reason only in the console. This is the
 * channel for failures that appear once running, as opposed to the ones the
 * boot sequence reports itself.
 */
export class FatalErrorBoundary extends React.Component<Props, State> {
  override state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  override render(): React.ReactNode {
    // Nothing is rendered in the subtree's place: `onError` sends the app back
    // to the boot screen, which unmounts this boundary along with the children
    // it was guarding, so a retry always starts from a fresh one.
    return this.state.crashed ? null : this.props.children;
  }
}

export default FatalErrorBoundary;
