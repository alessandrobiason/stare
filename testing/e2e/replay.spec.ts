import { expect, test } from "@playwright/test";

/**
 * Regressions in the replay's smoothness, caught structurally rather than by
 * timing. Frame-rate assertions are too machine-dependent to gate on — see
 * `testing/tools/measure-jitter.mjs` for the numbers — but each of these stands for a
 * specific way the view was made to stutter, and each is a yes-or-no question.
 */

// The scene's marker count, which is only the number on screen; its accessible
// name is what still says what the number counts — in English, which is what
// the pinned `locale` in `playwright.config.ts` is there to guarantee. The
// panels speak whatever language the browser asks for (`src/i18n`), and a
// selector written against one of them has to know which.
const BOOTED = '[aria-label$="visible satellites"]';
const CONSOLE_TOGGLE = '[aria-label="CONSOLE"]';

test.describe("replay overlay", () => {
  test("boots into the scene without React refusing an update cascade", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");
    await page.locator(BOOTED).first().waitFor({ timeout: 300000 });
    await page.waitForTimeout(4000);

    // Publishing the attitude estimate as state re-rendered the scene once per
    // video frame, and that render produced the next estimate. React counted
    // the cascade and gave up on it.
    expect(errors.join("\n")).not.toContain("Maximum update depth exceeded");
    expect(errors).toEqual([]);
  });

  test("the sky mask is one canvas, not a view per cell", async ({ page }) => {
    await page.goto("/");
    await page.locator(BOOTED).first().waitFor({ timeout: 300000 });
    // The mask is a console overlay, and the view opens in normal mode.
    await page.locator(CONSOLE_TOGGLE).click();
    // The mask model may still be loading; the grid only mounts once it lands.
    await page.locator("canvas").first().waitFor({ timeout: 300000 });

    // A view per cell is thousands of elements that react-native-web re-styles
    // on every render — and the scene renders on every video frame. At the old
    // 48x32 grid that cost 17% of the main thread and held the replay at 46 fps;
    // the grid is finer now, which would only have made it worse. The console
    // panel itself is a few dozen elements, which is what the headroom is for.
    const divs = await page.locator("#root div").count();
    expect(divs).toBeLessThan(500);
  });

  test("the console opens over the picture and pages between its readouts", async ({ page }) => {
    await page.goto("/");
    await page.locator(BOOTED).first().waitFor({ timeout: 300000 });

    // Nothing from the console is on screen until it is asked for.
    await expect(page.locator("text=Behind terrain")).toHaveCount(0);

    await page.locator(CONSOLE_TOGGLE).click();
    // The scene's own page comes first: under the replay, the recorded streams.
    await expect(page.locator("text=Orbit time").first()).toBeVisible();

    // One page at a time, reachable by tapping through the menu. Matched
    // exactly: the console gained a SKY FIX page in `fef9d06`, and a substring
    // match for "SKY" now finds both of them.
    await page.getByRole("tab", { name: "SKY", exact: true }).click();
    await expect(page.locator("text=Behind terrain").first()).toBeVisible();

    await page.locator(CONSOLE_TOGGLE).click();
    await expect(page.locator("text=Behind terrain")).toHaveCount(0);
  });

  /**
   * The app in a language the browser asked for, end to end.
   *
   * The only place the whole chain runs for real: the platform is asked what
   * language it wants, an answer is matched against what the app speaks, and
   * the panels render in it. Every unit test above this point stubs one of
   * those three, and the bug that shipped lived in the first one — detection
   * came back empty on a phone and the app fell back to English with nothing
   * on screen to say so.
   *
   * The web build reads `navigator.languages`, which is what `locale` sets
   * here; a phone reads its own settings module. Different sources, same
   * `resolveLocale` and the same string tables behind them.
   */
  test.describe("in a browser asking for Italian", () => {
    test.use({ locale: "it-IT" });

    test("the panels come up in Italian, not in English", async ({ page }) => {
      await page.goto("/");
      // The marker count says what it counts, in Italian.
      await page
        .locator('[aria-label$="satelliti visibili"]')
        .first()
        .waitFor({ timeout: 300000 });

      // The filter pill, which is a translated word over the sky.
      await expect(page.getByText("FILTRO", { exact: true }).first()).toBeVisible();
      await expect(page.locator(BOOTED)).toHaveCount(0);

      // And the console stays in English, deliberately — see `CONSOLE_LABEL`.
      await expect(page.locator(CONSOLE_TOGGLE)).toBeVisible();
    });
  });

  test("video time advances continuously rather than in steps", async ({ page }) => {
    await page.goto("/");
    await page.locator(BOOTED).first().waitFor({ timeout: 300000 });

    const worstJump = await page.evaluate(async () => {
      const video = document.querySelector("video");
      if (!video) return 0;
      video.muted = true;
      try {
        await video.play();
      } catch {
        return 0;
      }

      const times: number[] = [];
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          times.push(video.currentTime);
          if (performance.now() - started >= 6000) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      let worst = 0;
      for (let index = 1; index < times.length; index += 1) {
        worst = Math.max(worst, times[index] - times[index - 1]);
      }
      return worst;
    });

    // Running the segmentation model on the main thread froze everything for
    // about a second at a time, so playback time arrived in one-second steps.
    expect(worstJump).toBeLessThan(0.25);
  });
});
