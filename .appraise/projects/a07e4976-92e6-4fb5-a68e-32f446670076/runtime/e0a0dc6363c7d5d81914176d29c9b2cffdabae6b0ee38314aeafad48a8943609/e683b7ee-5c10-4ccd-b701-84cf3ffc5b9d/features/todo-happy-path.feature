Feature: Todo application happy path

  @appraise_validation_todo-happy-path @ts_ast-836f45b117f2-suite @tc_ast-836f45b117f2-core-todo-workflow
  Scenario: Manage and persist todos
    Given the user opens the todo application
    Then the new todo input is accessible
    When the user enters Buy milk
    And the user adds the todo
    Then the todo appears
    When the user opens editing
    And the user changes the todo
    And the user saves the edit
    Then the edited todo appears
    When the user completes the todo
    Then the todo is completed
    When the user selects Active
    Then the completed todo is absent from Active
    When the user selects Completed
    Then the completed todo appears
    When the user reloads
    Then the todo and completion state remain
    When the user returns the todo to active
    Then the todo is active
    When the user deletes the todo
    Then the empty state appears
    Given the viewport is mobile sized
    And the user opens the todo app
    When the user focuses the todo input
    And the user enters a todo
    And the user presses Enter
    Then the keyboard-created todo appears
    And the page has no horizontal overflow
    And the completion control is accessible
    When the user deletes the keyboard todo
    Then the empty state returns
