import type { Locator } from '@playwright/test';

/** Рамка элемента после прокрутки в видимую область: карточки каталога могут быть ниже края панели. */
export async function visibleBox(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  return locator.boundingBox();
}
