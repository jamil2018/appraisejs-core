/**
 * @name wait
 * @description Template steps that handles waiting
 * @type ACTION
 */
import { SelectorName } from '../../../types/locator/locator.type';
import { When } from '@cucumber/cucumber';
import { CustomWorld } from '../../config/executor/world.js';
import { resolveLocator } from '../../utils/locator.util.js';

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name wait for page load
 * @description Template step for waiting till page becomes interactive
 * @icon WAIT
 */
When(
  'the user waits for the current page to be loaded',
  async function (this: CustomWorld) {
    try {
      await this.page.waitForLoadState('domcontentloaded');
    } catch (error) {
      throw new Error(
        `Failed to wait for the current page to be loaded: ${error}`
      );
    }
  }
);

/**
 * @name wait for url route
 * @description Template step for waiting for a url route to be loaded
 * @icon WAIT
 */
When(
  'the user waits for the route {string} to be loaded',
  async function (this: CustomWorld, routeName: string) {
    try {
      await this.page.waitForURL(routeName, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      throw new Error(
        `Failed to wait for the route ${routeName} to be loaded: ${error}`
      );
    }
  }
);

/**
 * @name wait for element
 * @description Template step for waiting for element to become visible
 * @icon WAIT
 */
When(
  'the user waits for the element {string} to become visible',
  async function (this: CustomWorld, elementName: SelectorName) {
    try {
      const selector = await resolveLocator(this.page, elementName);
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`);
      }
      await this.page.waitForSelector(selector, { state: 'visible' });
    } catch (error) {
      throw new Error(
        `Failed to wait for the element ${elementName} to become visible: ${error}`
      );
    }
  }
);

/**
 * @name wait for element to disappear
 * @description Template step for waiting for an element to disappear from viewport
 * @icon WAIT
 */
When(
  'the user waits for the {string} element to disappear',
  async function (this: CustomWorld, elementName: SelectorName) {
    try {
      const selector = await resolveLocator(this.page, elementName);
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`);
      }
      await this.page.waitForSelector(selector, { state: 'hidden' });
    } catch (error) {
      throw new Error(
        `Failed to wait for the ${elementName} element to disappear: ${error}`
      );
    }
  }
);

/**
 * @name wait for specific amount of seconds
 * @description Template step for waiting for for an specific amount of seconds before proceeding with next action
 * @icon WAIT
 */
When(
  'the user waits for {int} seconds',
  async function (this: CustomWorld, waitTimeInSeconds: number) {
    try {
      await this.page.waitForTimeout(waitTimeInSeconds * 1000);
    } catch (error) {
      throw new Error(`Failed to wait for ${waitTimeInSeconds} seconds: ${error}`);
    }
  }
);
