/**
 * `@types/react-dom` is not installed. This is a minimal ambient declaration
 * for the one function the boot screen test uses, rather than pulling in a
 * whole dependency for a single static-render call in tests.
 */
declare module "react-dom/server" {
  import type { ReactElement } from "react";
  export function renderToStaticMarkup(element: ReactElement): string;
}
