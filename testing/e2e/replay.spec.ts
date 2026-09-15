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
const SETTINGS_TAB = '[role="tab"][aria-label="Settings"]';
const SKY_TAB = '[role="tab"][aria-label="Sky"]';
const CONSOLE_ROW = '[aria-label="CONSOLE"]';
const PASSES = '[aria-label="Upcoming passes"]';
const CARD = '[aria-label="Satellite details"]';
const FILTER = '[aria-label="Category filter"]';
const GUIDE_ROW = '[aria-label="Help"]';
const COMPASS = '[aria-label^="Facing"]';
const FREEZE = '[aria-label="Freeze the view"]';
const RESUME = '[aria-label="Resume the live view"]';

/**
 * Opens the console, which is two taps now rather than one: it is a row in the
 * settings tab, and pressing it comes back to the sky with the overlays up.
 */
async function openConsole(page: import("@playwright/test").Page): Promise<void> {
  await page.locator(SETTINGS_TAB).click();
  await page.locator(CONSOLE_ROW).click();
}

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
    await openConsole(page);
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

    await openConsole(page);
    // It comes back to the sky to draw: the console's overlays are over the
    // picture, and the settings sheet covers the picture. See `openConsole`.
    await expect(page.locator(SKY_TAB)).toHaveAttribute("aria-selected", "true");
    // The scene's own page comes first: under the replay, the recorded streams.
    await expect(page.locator("text=Orbit time").first()).toBeVisible();

    // One page at a time, reachable by tapping through the menu. Matched
    // exactly: the console gained a SKY FIX page in `fef9d06`, and a substring
    // match for "SKY" now finds both of them.
    await page.getByRole("tab", { name: "SKY", exact: true }).click();
    await expect(page.locator("text=Behind terrain").first()).toBeVisible();

    await page.locator('[aria-label="Leave console"]').click();
    await expect(page.locator("text=Behind terrain")).toHaveCount(0);
  });

  test("the filter is an icon, and its panel is behind it", async ({ page }) => {
    await page.goto("/");
    await page.locator(BOOTED).first().waitFor({ timeout: 300000 });

    // Nothing of the list over the sky until the button is pressed — not even
    // the word FILTER, which used to sit in that corner.
    await expect(page.getByText("SHOW ALL")).toHaveCount(0);

    await page.locator(FILTER).click();
    await expect(page.getByText("SHOW ALL").first()).toBeVisible();

    // And a tap on the sky puts it away, as a tap outside an open menu does
    // everywhere else on this platform.
    await page.locator('[aria-label="Satellite markers"]').click({ position: { x: 40, y: 320 } });
    await expect(page.getByText("SHOW ALL")).toHaveCount(0);
  });

  test("the freeze button holds the picture and the marks, and lets go of them", async ({ page }) => {
    await page.goto("/");
    await page.locator(BOOTED).first().waitFor({ timeout: 300000 });
    const video = page.locator("video");
    // Playing, so there is something moving to be held.
    await page.locator('[aria-label="Play the recording"]').click();
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);

    await page.locator(FREEZE).click();
    await expect(page.locator(RESUME)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Frozen at", { exact: false })).toBeVisible();
    expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);

    // The middle of the picture, marks and all, is the same picture a second
    // and a half later: nothing under the glass is moving.
    const box = await page.locator('[aria-label="Satellite markers"]').boundingBox();
    if (!box) throw new Error("The picture has no box");
    const clip = { x: box.x, y: box.y + box.height * 0.3, width: box.width, height: box.height * 0.3 };
    const before = await page.screenshot({ clip });
    await page.waitForTimeout(1500);
    expect((await page.screenshot({ clip })).equals(before)).toBe(true);

    await page.locator(RESUME).click();
    await expect(page.getByText("Frozen at", { exact: false })).toHaveCount(0);
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
  });

  test("the compass strip says which way the camera is pointing", async ({ page }) => {
    await page.goto("/");
    await page.locator(BOOTED).first().waitFor({ timeout: 300000 });

    // One reading rather than eight letters read out one after another, and it
    // is one of the eight points the rest of the app gives bearings in.
    const facing = page.locator(COMPASS).first();
    await expect(facing).toBeVisible();
    expect(await facing.getAttribute("aria-label")).toMatch(/^Facing (N|NE|E|SE|S|SW|W|NW)$/);
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
      // The line under the app's name says what is over you, in Italian.
      await page
        .locator('[aria-label$="satelliti visibili"]')
        .first()
        .waitFor({ timeout: 300000 });

      // The bar along the bottom, which is three translated words.
      await expect(page.getByText("Cielo", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Catalogo", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Impostazioni", { exact: true }).first()).toBeVisible();
      await expect(page.locator(BOOTED)).toHaveCount(0);

      // And the compass strip, whose reading is translated with the rest of
      // the panels — `COMPASS` above is the English one — and whose letters are
      // that language's own: Italian turns west into O. See `strings().compass`.
      const facing = page.locator('[aria-label^="Direzione"]').first();
      await facing.waitFor({ timeout: 30000 });
      expect(await facing.getAttribute("aria-label")).toMatch(/^Direzione (N|NE|E|SE|S|SO|O|NO)$/);

      // The console stays in English, deliberately — see `CONSOLE_LABEL`.
      await page.locator('[role="tab"][aria-label="Impostazioni"]').click();
      await expect(page.locator(CONSOLE_ROW)).toBeVisible();
    });
  });

  test("the recording plays from a press on the harness's own transport", async ({ page }) => {
    await page.goto("/");
    await page.locator(BOOTED).first().waitFor({ timeout: 300000 });

    const currentTime = () =>
      page.evaluate(() => document.querySelector("video")?.currentTime ?? 0);

    // Pressed rather than `video.play()`, which is the whole of the test: the
    // `<video>` had `controls` of its own and they sat under the scene's tap
    // target, so every other check here drove a recording nobody could start
    // by hand.
    await page.getByLabel("Play the recording").click();
    await page.waitForTimeout(2000);
    const playing = await currentTime();
    expect(playing).toBeGreaterThan(0.5);

    await page.getByLabel("Pause the recording").click();
    const paused = await currentTime();
    await page.waitForTimeout(1000);
    expect(await currentTime()).toBeCloseTo(paused, 1);
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

test.describe("what is coming", () => {
  /**
   * The one wire in this panel no unit test can pull.
   *
   * The suite renders components statically (`sceneOverlays.test.tsx`), so it
   * can check that the pill lands shut and that the plan behind it is right,
   * and it cannot open the pill or press a row. What that leaves unchecked is
   * the whole point of the panel: a row is a target, and tapping one has to
   * open the same card the object's own mark would.
   */
  test("a row opens the card the object's own mark would", async ({ page }) => {
    await page.goto("/");
    await page.locator(BOOTED).first().waitFor({ timeout: 300000 });
    // The plan is made on the first pass of `useOrbitPaths`, a moment after
    // the scene opens rather than with it.
    await page.locator(PASSES).waitFor({ timeout: 300000 });

    // Nothing of the list until it is asked for, and no card until a row is.
    await expect(page.locator(CARD)).toHaveCount(0);
    await expect(page.locator('[role="list"]')).toHaveCount(0);

    await page.locator(PASSES).click();
    const row = page.locator('[role="list"] [role="button"]').first();
    await row.waitFor({ timeout: 30000 });
    const name = await row.getAttribute("aria-label");
    await row.click();

    // The card the sky would have opened, about the object the row named.
    await expect(page.locator(CARD)).toHaveCount(1);
    await expect(page.locator(CARD)).toContainText(name ?? "");
    // And the panel gives way to it: they share the bottom of the screen, and
    // the card is the answer to the row that was tapped.
    await expect(page.locator(PASSES)).toHaveCount(0);
  });
});

test.describe("the tour", () => {
  /**
   * The wiring no unit test can reach: that the Help row brings the sky back,
   * that each step finds its control on the running view, and that closing the
   * tour leaves that same view rather than a fresh boot.
   */
  test("runs over the sky from the Help row, and closes back onto it", async ({ page }) => {
    await page.goto("/");
    await page.locator(BOOTED).first().waitFor({ timeout: 300000 });

    await page.locator(SETTINGS_TAB).click();
    await page.locator(GUIDE_ROW).click();

    // The first step is the key to the marks, over the sky rather than settings.
    await expect(page.getByText("On the sky")).toBeVisible();
    await expect(page.getByText("1 of ", { exact: false })).toBeVisible();

    // Then the controls, one at a time.
    await page.getByRole("button", { name: "Next" }).last().click();
    await expect(page.getByText("In view")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).last().click();
    await expect(page.getByText("Choose which kinds of satellite to show.")).toBeVisible();
    // The freeze button, which a pause sign does not explain on its own.
    await page.getByRole("button", { name: "Next" }).last().click();
    await expect(page.getByText("Hold the view still", { exact: false })).toBeVisible();

    await page.getByText("Skip").click();
    await expect(page.getByText("Hold the view still", { exact: false })).toHaveCount(0);
    await expect(page.locator(BOOTED).first()).toBeVisible();
    await expect(page.locator(SKY_TAB)).toHaveAttribute("aria-selected", "true");
  });
});
