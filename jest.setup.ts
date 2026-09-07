import { setLocaleForTesting, setLocaleStoreForTesting } from "./src/i18n/locale";

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
 *
 * The device's remembered choice is taken away at the same time: it is read
 * ahead of every detection source, and a suite that reached real storage would
 * be a suite whose language depended on what the last run left behind.
 */
beforeEach(() => {
  setLocaleStoreForTesting(null);
  setLocaleForTesting("en");
});
