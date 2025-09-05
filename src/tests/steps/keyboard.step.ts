import { When } from '@cucumber/cucumber';
import { CustomWorld } from '../config/world.js';
import { Locator } from 'playwright';

When(
  'the user fills in the {string} input field with value {string}',
  async function (
    this: CustomWorld,
    element_name: Locator,
    input_value: string
  ) {}
);
