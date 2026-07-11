# Remaining Gameplay Rules Implementation Plan

1. Add failing transition tests for alternative-asset action consumption and skill timing.
2. Route alternative-asset orders through `applyAction` in local and online play while retaining the old server action as a compatibility alias.
3. Add private queued-event handling for Inside Information and immediate-event handling for Tabloid.
4. Add server integration coverage for authoritative timing and immediate event application.
5. Update UI feedback and completion documentation.
6. Run focused tests, the full suite, production build, and diff checks.
