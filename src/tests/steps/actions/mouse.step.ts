/**
 * @name mouse
 * @description Template steps that handles mouse actions
 * @type ACTION
 */
import { When } from '@cucumber/cucumber';
import { CustomWorld } from '../../config/executor/world.js';
import { SelectorName } from '@/types/locator/locator.type';
import { resolveLocator } from '../../utils/locator.util.js';

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name Click
 * @description Template step that handles clicking on an element
 * @icon MOUSE
 */
When(
  'the user clicks the {string} element',
  async function (this: CustomWorld, element: SelectorName) {
    try {
      const locator = await resolveLocator(this.page, element);
      if (!locator) {
        throw new Error(`Locator ${element} not found`);
      }
      await this.page.locator(locator).click();
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
);
