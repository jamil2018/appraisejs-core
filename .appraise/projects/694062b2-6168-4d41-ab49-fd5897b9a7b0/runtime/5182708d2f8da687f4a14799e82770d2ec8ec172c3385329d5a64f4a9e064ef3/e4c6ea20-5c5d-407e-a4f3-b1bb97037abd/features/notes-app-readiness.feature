Feature: Notes app readiness

  @appraise_validation_notes-app-readiness @ts_ast-09a7ff6bbaef-suite @tc_ast-09a7ff6bbaef-load-notes-app
  Scenario: Load and reload the notes app
    When the user opens the notes app
    Then the page becomes ready
    When the user reloads the notes app
    Then the page becomes ready again
