import { expect, type Locator } from "@playwright/test";

export async function expectLocatorInsideViewport(locator: Locator) {
  await expect
    .poll(
      async () =>
        locator.evaluate((target) => {
          const rect = target.getBoundingClientRect();
          return Math.ceil(rect.right - window.innerWidth);
        }),
      { timeout: 5000 },
    )
    .toBeLessThanOrEqual(0);
}

export async function expectLocatorLeftInsideViewport(locator: Locator) {
  await expect
    .poll(
      async () =>
        locator.evaluate((target) => {
          const rect = target.getBoundingClientRect();
          return Math.floor(rect.left);
        }),
      { timeout: 5000 },
    )
    .toBeGreaterThanOrEqual(0);
}

export async function expectLocatorInsideContainer(locator: Locator, container: Locator) {
  await expect
    .poll(
      async () => {
        const targetRect = await locator.evaluate((target) => {
          const rect = target.getBoundingClientRect();
          return { right: rect.right };
        });
        const containerRect = await container.evaluate((target) => {
          let box: Element | null = target;
          let rect = box.getBoundingClientRect();
          while (box.parentElement && rect.width === 0 && rect.height === 0) {
            box = box.parentElement;
            rect = box.getBoundingClientRect();
          }
          return { right: rect.right };
        });
        return Math.ceil(targetRect.right - containerRect.right);
      },
      { timeout: 5000 },
    )
    .toBeLessThanOrEqual(0);
}

export async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  // viewport切替直後はPageTransitionのslideが残り一瞬はみ出すため、収束するまで待つ。
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const root = document.documentElement;
          return root.scrollWidth > root.clientWidth + 1;
        }),
      { timeout: 5000 },
    )
    .toBe(false);
}
