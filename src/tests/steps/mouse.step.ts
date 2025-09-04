import { When } from '@cucumber/cucumber';
import { CustomWorld } from '../config/world.js';
import { Locator } from 'playwright';

When(
  'the user clicks on the {string} element',
  async function (this: CustomWorld, element_name: Locator) {}
);
