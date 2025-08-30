/* This file is generated automatically. Add template steps to this group to generate content.type Locator = string */
interface World {
  page: string;
}

When(
  'the user clicks on the {string} element',
  async function (this: World, element: locator) {}
);
