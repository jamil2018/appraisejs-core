import { faker } from '@faker-js/faker';

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
    let data: string;
    switch (randomDataType) {
        case RandomDataType.FULL_NAME:
            data = faker.person.fullName();
            break;
        case RandomDataType.FIRST_NAME:
            data = faker.person.firstName();
            break;
        case RandomDataType.LAST_NAME:
            data = faker.person.lastName();
            break;
        case RandomDataType.EMAIL:
            data = faker.internet.email();
            break;
        case RandomDataType.PASSWORD:
            data = faker.internet.password();
            break;
        case RandomDataType.PHONE:
            data = faker.phone.number();
            break;
        case RandomDataType.ADDRESS:
            data = faker.location.streetAddress();
            break;
        case RandomDataType.UNIQUE_TEXT:
            data = faker.string.uuid();
            break;
        default:
            throw new Error(`Invalid random data type: ${randomDataType}`);
    }
    return data;
}