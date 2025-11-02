@test
Feature: Example

  Scenario: User navigates to the login page
    Given the user navigates to "https://demo-test-site-beta.vercel.app/login"
    Then the user should see "Login" in "button[data-test-id='login-button']"

  Scenario: User navigates to the home page
    Given the user navigates to "https://demo-test-site-beta.vercel.app/login"
    When the user fills in the "email" field with "demo@example.com"
    And the user fills in the "password" field with "test1234"
    And the user clicks on "loginButton"
    Then the user should see "Welcome to Home Page" in ".container h1"

  Scenario: User navigates to the home page using environment url
    Given the user navigates to "staging" environment url
    Then the user should see "Login" in "button[data-test-id='login-button']"
