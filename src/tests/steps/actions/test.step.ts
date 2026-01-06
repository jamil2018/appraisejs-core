/**
 * @name test
 * @description test group
 * @type ACTION
 */
import { When } from '@cucumber/cucumber';
import { CustomWorld } from '../../config/executor/world';
import { SelectorName } from '@/types/locator/locator.type';
import { resolveLocator } from '../../utils/locator.util';

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name test step
 * @description this is a test step
 * @icon MOUSE
 */
When(
  'test is {string} and {string}',
  async function (this: CustomWorld, type: number, sad: string) {}
);
