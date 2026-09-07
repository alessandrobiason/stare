import { setLocaleForTesting } from "./src/i18n/locale";

/**
 * The suite speaks English unless a test says otherwise.
 *
 * Locale detection ends at `Intl`, which on a developer's machine answers with
 * whatever language that machine is set to — so without this the assertions
 * that read English out of a rendered panel would pass on one laptop and fail
 * on the next, and in CI would depend on the runner image. Pinning here rather
 * than in each file means a test that forgets is still deterministic.
 *
 * Tests that care about a language set it themselves with the same seam, and
 * clear it in `afterEach`; that clearing returns to detection, which is why the
 * pin is re-applied before every test rather than once.
 */
beforeEach(() => setLocaleForTesting("en"));
