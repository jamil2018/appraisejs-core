import { CustomWorld, When, executeHumanOperation } from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name random data
 * @description Generated human projections for canonical random data operations
 * @type ACTION
 */

/**
 * @name generate random address and save in variable
 * @description Template step for generating a random address and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random address and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation(
      'browser.random.data.generate.random.address.and.save.in.variable@1',
      this,
      ['variableName'],
      [variableName],
    )
  },
)

/**
 * @name generate random email and save in variable
 * @description Template step for generating a random email and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random email and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation(
      'browser.random.data.generate.random.email.and.save.in.variable@1',
      this,
      ['variableName'],
      [variableName],
    )
  },
)

/**
 * @name generate random first name and save in variable
 * @description Template step for generating a random first name and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random first name and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation(
      'browser.random.data.generate.random.first.name.and.save.in.variable@1',
      this,
      ['variableName'],
      [variableName],
    )
  },
)

/**
 * @name generate random full name and save in variable
 * @description Template step for generating a random full name and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random full name and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation(
      'browser.random.data.generate.random.full.name.and.save.in.variable@1',
      this,
      ['variableName'],
      [variableName],
    )
  },
)

/**
 * @name generate random last name and save in variable
 * @description Template step for generating a random last name and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random last name and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation(
      'browser.random.data.generate.random.last.name.and.save.in.variable@1',
      this,
      ['variableName'],
      [variableName],
    )
  },
)

/**
 * @name generate random password and save in variable
 * @description Template step for generating a random password and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random password and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation(
      'browser.random.data.generate.random.password.and.save.in.variable@1',
      this,
      ['variableName'],
      [variableName],
    )
  },
)

/**
 * @name generate random phone and save in variable
 * @description Template step for generating a random phone and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random phone and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation(
      'browser.random.data.generate.random.phone.and.save.in.variable@1',
      this,
      ['variableName'],
      [variableName],
    )
  },
)

/**
 * @name generate random unique text and save in variable
 * @description Template step for generating a random unique text and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random unique text and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation(
      'browser.random.data.generate.random.unique.text.and.save.in.variable@1',
      this,
      ['variableName'],
      [variableName],
    )
  },
)
