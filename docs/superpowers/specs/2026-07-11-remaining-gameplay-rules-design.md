# Remaining Gameplay Rules Design

## Goal

Complete the rule-level gaps left after the PDF milestone implementation without replacing the existing state model or server API structure.

## Confirmed gaps

1. Buying or selling gold, copper, or coin currently leaves the game in the action phase, allowing a second action in the same turn.
2. A skill can be submitted by a non-active player or after the action phase.
3. Inside Information chooses a sector and later forces an event into that sector instead of previewing the actual queued event.
4. Tabloid stores an extra-event counter and waits for the die, although the PDF says the extra card is revealed and applied immediately.

## Design

### Alternative-asset action

Gold, copper, and coin orders reuse `applyAction` with `type: buy|sell`, `assetKey`, and `quantity`. A successful order records the normal action result and moves the phase to `dice`. The old `mvp-asset` server action remains as a compatibility alias but delegates to the same transition.

### Skill timing

All current one-use skills require a live player, that player's active turn, and the `action` phase. Skill draft selection remains available before the player's first action. Invalid timing throws a user-readable rule error and does not consume the card.

### Inside Information

Using the card draws and privately stores the actual next event card on the player. Only its sector is exposed through the existing `insideInfo` UI field. The next formal or added event consumes the stored card, so grade, direction, and magnitude stay hidden until reveal.

### Tabloid

Using Tabloid queues one privately drawn card as an immediate event. `useSkill` returns the card as `immediateEvent`; the game logic applies it through the existing event-card path during the same server action or local click. The result and price changes are logged immediately, and the skill is consumed once.

## Compatibility and privacy

- No new runtime library.
- Existing room endpoints and client action names remain valid.
- Private queued cards remain inside the owning player object; the server already strips opponent player-private fields.
- Emergency sell remains usable outside the player's normal action and does not consume the turn.

## Verification

- Unit tests prove alternative assets consume the action.
- Unit tests prove non-active and post-action skill use is rejected without consuming the card.
- Unit tests prove Inside Information reveals only the sector and resolves the exact queued card.
- Unit and server integration tests prove Tabloid changes prices immediately and does not wait for a die roll.
- Full tests and production build must pass.
