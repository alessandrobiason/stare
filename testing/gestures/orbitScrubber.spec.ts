import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

async function openCard(page: Page) {
  await page.route("**/gesture-test", (route) => route.fulfill({
    contentType: "text/html",
    body: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex}</style></head><body><div id="root"></div><script src="/testing/gestures/OrbitScrubberFixture.bundle?platform=web&dev=true&hot=false&lazy=false"></script></body></html>'
  }));
  await page.goto("/gesture-test");
  const slider = page.getByRole("slider");
  await slider.waitFor({ timeout: 90000 });
  await slider.scrollIntoViewIfNeeded();
  return slider;
}

async function scrollTop(slider: Locator) {
  return slider.evaluate((input) => {
    for (let node = input.parentElement; node; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight && node.clientHeight > 0) return node.scrollTop;
    }
    throw new Error("The real satellite card must overflow for this regression test");
  });
}

test("a touch drag keeps scrubbing outside the rail, then the card scrolls again", async ({ page }) => {
  const slider = await openCard(page);
  const rect = (await slider.boundingBox())!;
  const before = await scrollTop(slider);
  const session = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => [{ x: rect.x + rect.width * x, y: rect.y + rect.height / 2 + y }];
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(0.25, 0) });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(0.3, -60) });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(0.8, -100) });
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(1000);
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(0.2, 90) });
  await expect.poll(async () => Number(await slider.inputValue())).toBeLessThan(400);
  expect(await scrollTop(slider)).toBe(before);
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByRole("button", { name: "Play satellite motion", exact: true })).toBeVisible();
  // A new gesture outside the timeline must scroll normally after release.
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: rect.x + 10, y: rect.y - 60 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: rect.x + 10, y: rect.y - 150 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => scrollTop(slider)).toBeGreaterThan(before);
});

test("touch cancellation releases the scroll lock and keyboard seeking still works", async ({ page }) => {
  const slider = await openCard(page);
  const rect = (await slider.boundingBox())!;
  const before = await scrollTop(slider);
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveValue("0");
  await slider.press("End");
  await expect(slider).toHaveValue("1440");
  await page.mouse.move(rect.x + 10, rect.y - 50);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => scrollTop(slider)).toBeGreaterThan(before);
});
