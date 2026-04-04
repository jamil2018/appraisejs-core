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
