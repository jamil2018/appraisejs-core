import { faker } from '@faker-js/faker'

export enum RandomDataType {
  FULL_NAME = 'fullName',
  FIRST_NAME = 'firstName',
  LAST_NAME = 'lastName',
  EMAIL = 'email',
  PASSWORD = 'password',
  PHONE = 'phone',
  ADDRESS = 'address',
  UNIQUE_TEXT = 'uniqueText',
}

export function generateRandomData(randomDataType: RandomDataType): string {
  switch (randomDataType) {
    case RandomDataType.FULL_NAME:
      return faker.person.fullName()
    case RandomDataType.FIRST_NAME:
      return faker.person.firstName()
    case RandomDataType.LAST_NAME:
      return faker.person.lastName()
    case RandomDataType.EMAIL:
      return faker.internet.email()
    case RandomDataType.PASSWORD:
      return faker.internet.password()
    case RandomDataType.PHONE:
      return faker.phone.number()
    case RandomDataType.ADDRESS:
      return faker.location.streetAddress()
    case RandomDataType.UNIQUE_TEXT:
      return faker.string.uuid()
    default:
      throw new Error(`Invalid random data type: ${randomDataType}`)
  }
}
