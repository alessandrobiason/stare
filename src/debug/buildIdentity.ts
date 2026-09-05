/**
 * Which binary this is, in one line, for the screen that reports a failure.
 *
 * A native fix reaching a phone that is still on the previous binary looks
 * exactly like a native fix that does not work. This project has now spent
 * three release cycles unable to tell those two apart from the outside, and the
 * only evidence either way — the build number in TestFlight against the number
 * of the Actions run that was supposed to carry it — lives somewhere other than
 * the screen showing the error.
 *
 * So the error screen says it itself. `runtimeVersion` is the native
 * fingerprint: it changes whenever anything compiled changes, `patches/`
 * included, so two builds that differ natively cannot report the same one. The
 * update id distinguishes the embedded JavaScript from a bundle that arrived
 * over the air afterwards, which is the other half of "what is actually
 * running".
 *
 * Everything here is best-effort and never throws. It is a line on an error
 * screen; it must not be the reason for another one.
 */

/** The build, short enough for a footnote. */
export function describeBuild(): string {
  const parts: string[] = [];

  try {
    // Required lazily: on the web harness there is no native updates module,
    // and a failure to describe the build is not a failure worth propagating.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require("expo-updates") as {
      runtimeVersion?: string | null;
      updateId?: string | null;
      isEmbeddedLaunch?: boolean;
      channel?: string | null;
    };

    if (Updates.runtimeVersion) parts.push(`native ${Updates.runtimeVersion.slice(0, 12)}`);
    if (Updates.channel) parts.push(Updates.channel);
    parts.push(
      Updates.isEmbeddedLaunch
        ? "bundle embedded"
        : `bundle ${Updates.updateId ? Updates.updateId.slice(0, 8) : "over-the-air"}`
    );
  } catch {
    // No updates module — the replay harness, or a bare debug build.
  }

  return parts.length > 0 ? parts.join(" · ") : "";
}
