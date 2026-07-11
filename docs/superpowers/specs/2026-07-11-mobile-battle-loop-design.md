# Mobile Battle Loop Design

## Scope

This design implements only the first milestone in `주식서바이벌 게임 개발 문서.pdf`. The existing online room protocol remains unchanged. The new rules are enabled for Solo Test with AI so the loop can be validated before server synchronization is redesigned.

## Approved visual direction

Direction C, **Battle Arena**, is the source of truth. The mobile screen emphasizes one current decision, a round timeline, strong red/blue market signals, and a single contextual primary action. Desktop expands the same structure without changing the information hierarchy.

## Game rules in milestone 1

- 3–6 players, 10 rounds, all 11 fixed-price sector companies.
- Starting cash: 387. Survival income: 29 after every completed round.
- Each company has 21 shares in total. A player may hold at most 11 shares of one company and buy at most 5 in one action.
- Turn order is recalculated from lowest net worth to highest.
- One action per turn: buy, sell, interfere, defend, or gamble.
- After the action, the player rolls one die and the mapped basic event is applied immediately.
- When every survivor has acted, income is paid, rankings and the next order are recalculated, and the next round begins.
- A timeout safely completes the missing phase: defend for an unchosen action, automatic die roll for the dice phase, or next-round settlement for a resolved turn.

## Action behavior

- Buy/sell operates on a selected sector and quantity.
- Interfere targets the opponent's largest holding and applies -5%; it has a 30% failure chance. Successfully targeting rank 1 awards 10 cash.
- Defend halves both negative and positive price effects applied to the player during the current turn.
- Gamble stakes 30% of current cash. It has a 50% chance to win the same amount or lose the stake.

## Architecture

`survival-mvp/config.js` owns constants, `events.js` owns event data, `game-state.js` adapts the existing stock/player model, `game-logic.js` owns pure transitions, and `ui.js` owns Battle Arena markup. `app.js` only coordinates those modules and existing rendering.

The state is tagged with `game.survivalMvp`. Existing rendering can continue reading `players`, `stocks`, `turn`, and ranking helpers, while the new module owns `phase`, `turnOrder`, `activePlayerId`, share supply, dice result, and event result.

## Explicitly deferred

Bankruptcy, all-in, advanced bounty rules, controlling shareholders, character skills, hidden wins, commodities, and server-synchronized versions of the new phases belong to later milestones.

## Error and compatibility policy

Invalid quantities, unavailable shares, insufficient cash, and illegal phase changes throw user-readable errors. Online games never enter the new adapter. Existing sector cards, charts, rankings, chat, messages, and room-code flows remain available.
