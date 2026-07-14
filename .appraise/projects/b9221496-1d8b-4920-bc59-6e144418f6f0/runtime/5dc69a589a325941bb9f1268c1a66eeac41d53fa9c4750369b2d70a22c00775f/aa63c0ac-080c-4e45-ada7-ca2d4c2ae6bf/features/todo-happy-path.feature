Feature: Todo application happy path

  @appraise_validation_todo-happy-path @ts_ast-192ef4b604c8-suite @tc_ast-192ef4b604c8-manage-todos
  Scenario: Manage and persist todos
    Given the todo application is open
    Then the todo input is accessible
    When the user enters the first todo
    And the user adds the first todo
    And the user enters the second todo
    And the user adds the second todo
    Then both todos are visible
    When the user starts editing the first todo
    And the user changes the first todo text
    And the user saves the edited todo
    Then the edited text is visible
    When the user completes the first todo
    Then the first todo is complete
    When the user reloads the application
    Then the completed todo persists after reload
    And the persisted completion state remains checked
    When the user selects the completed filter
    Then the completed todo is visible
    And only one completed todo is visible
    When the user selects the active filter
    Then the active todo is visible
    And only one active todo is visible
    When the user selects the all filter
    And the user marks the first todo incomplete
    Then the first todo is active again
    When the user deletes the first todo
    Then the second todo remains
    And the deleted todo is absent
    When the viewport changes to a narrow mobile size
    Then the page has no horizontal overflow
    And the delete control remains accessible
