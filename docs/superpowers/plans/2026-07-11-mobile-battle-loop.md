# Mobile Battle Loop Implementation Plan

1. Add failing unit tests for milestone constants, game creation, share limits, each action, dice events, income settlement, turn order, and timeout fallback.
2. Implement isolated `survival-mvp` configuration, event catalog, state adapter, and transition engine until the unit tests pass.
3. Add Battle Arena action markup and mobile-first styles without removing existing online UI.
4. Connect Solo Test startup, contextual action controls, dice resolution, automatic AI turns, end-turn settlement, and timeout handling in `app.js`.
5. Add UI contract tests for required controls and responsive styling.
6. Run the full test suite and production build, then exercise the solo loop in the browser at mobile width and check the console.
7. Write a completion report listing implemented, deferred, verification, and final folder information.
