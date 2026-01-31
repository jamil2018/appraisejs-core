/**
 * @name random data
 * @description Template steps that handles random data generation
 * @type ACTION
 */
import { When } from '@cucumber/cucumber';
import { CustomWorld } from '../../config/executor/world.js';
import { generateRandomData, RandomDataType } from '@/tests/utils/random-data.util.js';

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name generate random first name and save in variable
 * @description Template step for generating a random first name and saving it inside a variable
 * @icon DATA
 */
When(
    'the user generates a random first name and stores it inside the variable {string}',
    async function (this: CustomWorld, variableName: string) {
        const data = generateRandomData(RandomDataType.FIRST_NAME);
        try {
            this.setVar(variableName, data);
        } catch (error) {
            throw new Error(`Failed to generate a random first name and store it inside the variable ${variableName}: ${error}`);
        }
    }
);

/**
 * @name generate random last name and save in variable
 * @description Template step for generating a random last name and saving it inside a variable
 * @icon DATA
 */
When(
    'the user generates a random last name and stores it inside the variable {string}',
    async function (this: CustomWorld, variableName: string) {
        const data = generateRandomData(RandomDataType.LAST_NAME);
        try {
            this.setVar(variableName, data);
        } catch (error) {
            throw new Error(`Failed to generate a random last name and store it inside the variable ${variableName}: ${error}`);
        }
    }
);

/**
 * @name generate random email and save in variable
 * @description Template step for generating a random email and saving it inside a variable
 * @icon DATA
 */
When(
    'the user generates a random email and stores it inside the variable {string}',
    async function (this: CustomWorld, variableName: string) {
        const data = generateRandomData(RandomDataType.EMAIL);
        try {
            this.setVar(variableName, data);
        } catch (error) {
            throw new Error(`Failed to generate a random email and store it inside the variable ${variableName}: ${error}`);
        }
    }
);

/**
 * @name generate random password and save in variable
 * @description Template step for generating a random password and saving it inside a variable
 * @icon DATA
 */
When(
    'the user generates a random password and stores it inside the variable {string}',
    async function (this: CustomWorld, variableName: string) {
        const data = generateRandomData(RandomDataType.PASSWORD);
        try {
            this.setVar(variableName, data);
        } catch (error) {
            throw new Error(`Failed to generate a random password and store it inside the variable ${variableName}: ${error}`);
        }
    }
);

/**
 * @name generate random phone and save in variable
 * @description Template step for generating a random phone and saving it inside a variable
 * @icon DATA
 */
When(
    'the user generates a random phone and stores it inside the variable {string}',
    async function (this: CustomWorld, variableName: string) {
        const data = generateRandomData(RandomDataType.PHONE);
        try {
            this.setVar(variableName, data);
        } catch (error) {
            throw new Error(`Failed to generate a random phone and store it inside the variable ${variableName}: ${error}`);
        }
    }
);

/**
 * @name generate random address and save in variable
 * @description Template step for generating a random address and saving it inside a variable
 * @icon DATA
 */
When(
    'the user generates a random address and stores it inside the variable {string}',
    async function (this: CustomWorld, variableName: string) {
        const data = generateRandomData(RandomDataType.ADDRESS);
        try {
            this.setVar(variableName, data);
        } catch (error) {
            throw new Error(`Failed to generate a random address and store it inside the variable ${variableName}: ${error}`);
        }
    }
);

/**
 * @name generate random unique text and save in variable
 * @description Template step for generating a random unique text and saving it inside a variable
 * @icon DATA   
 */
When(
    'the user generates a random unique text and stores it inside the variable {string}',
    async function (this: CustomWorld, variableName: string) {
        const data = generateRandomData(RandomDataType.UNIQUE_TEXT);
        try {
            this.setVar(variableName, data);
        } catch (error) {
            throw new Error(`Failed to generate a random unique text and store it inside the variable ${variableName}: ${error}`);
        }
    }
);

/**
 * @name generate random full name and save in variable
 * @description Template step for generating a random full name and saving it inside a variable
 * @icon DATA
 */
When(
    'the user generates a random full name and stores it inside the variable {string}',
    async function (this: CustomWorld, variableName: string) {
        const data = generateRandomData(RandomDataType.FULL_NAME);
        try {
            this.setVar(variableName, data);
        } catch (error) {
            throw new Error(`Failed to generate a random full name and store it inside the variable ${variableName}: ${error}`);
        }
    }
);