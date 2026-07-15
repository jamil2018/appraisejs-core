Feature: Complete todo happy path

  @appraise_validation_todo-happy-path @ts_ast-e583afdc77e1-suite @tc_ast-e583afdc77e1-complete-todo-workflow
  Scenario: Manage todos through the complete happy path
    Given Open the todo application
    Then The global empty state is visible
    Then The todo input exposes accessible semantics
    Then The add control exposes accessible semantics
    When Focus the todo input
    And Enter the first todo text
    And Submit the todo with Enter
    Then The first todo appears
    And One active item is counted
    When Open editing for the first todo
    And Replace the edit value for cancellation
    And Cancel editing with Escape
    Then The original value remains after cancellation
    When Open editing again
    And Enter a durable edited value
    And Save editing with Enter
    Then The edited value is shown
    When Complete the first todo
    Then The completion control is checked
    When Reactivate the first todo
    Then The completion control is unchecked
    When Complete the first todo again
    And Enter another active todo
    And Add the second todo from the keyboard
    And Show active todos
    Then The active view contains the active todo
    When Show completed todos
    Then The completed view contains the completed todo
    And The active todo is absent from the completed view
    When Return to all todos
    And Choose the Active filter for persistence
    And Reload the page
    Then The active todo survives reload
    And The selected Active filter survives reload
    When Show all todos after reload
    And Clear every completed todo
    Then The active todo remains after clearing completed
    And The completed filter is empty
    Then The completed empty state is useful
    When Show active todos again
    And Delete the remaining todo
    Then The active empty state is useful
    When Show all todos with no stored items
    Then The global empty state returns
    When Use a mobile viewport
    Then The mobile page has no horizontal overflow
    When Use a desktop viewport
    Then The desktop page has no horizontal overflow
