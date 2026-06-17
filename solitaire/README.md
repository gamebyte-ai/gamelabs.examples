# Solitaire Example

A Klondike Solitaire game built on Gamelabs.js. Three.js renders the board and cards; pointer-driven drag-and-drop and the Klondike rule set are wired through the framework's view/controller separation.

## Gameplay

- Standard Klondike deal: tableau columns 1–7 receive 1–7 cards, the top of each column face-up; remaining 24 cards form the stock, all face-down; waste and four foundations start empty.
- Move rules:
  - **Tableau** — empty columns accept only Kings; otherwise the placed run's bottom card must be one rank lower than the column's top and of opposite color.
  - **Foundation** — empty foundations accept only Aces; otherwise the placed card must be one rank higher than the current top and of the same suit. Foundations accept one card at a time.
  - Invalid drops snap back to the origin.
- A face-up card in a tableau column lifts with everything stacked above it (the whole run moves as a unit).
- When the face-up card above a face-down card is moved away, the newly-exposed face-down card auto-flips face-up.
- Stock click draws `SolitaireConfig.drawCount` cards (default 3, set to 1 for Turn-1 mode) to the waste, face-up. Clicking an empty stock recycles the waste back into stock face-down, preserving order so an unbroken cycle restores the original sequence.
- Face-down cards cannot be picked up; only the top card of waste or a foundation is draggable.

## Architecture

### Typed piles

The board exposes the four Klondike pile kinds as typed fields. There is no generic "slot" abstraction — each pile is a concrete class with its own rules.

```
abstract class Pile implements IPile     // state + push/pop/clear + abstract predicates
    StockPile                            // canPlace/canDragFrom always false
    WastePile                            // top face-up card draggable
    FoundationPile                       // single Ace on empty, then same-suit ascending; top only draggable
    TableauPile                          // King on empty, descending opposite-color runs; full face-up run draggable
                                         // overrides needsAutoFlipNewTop() to expose a face-down top
```

`BoardModel` constructs the piles at fixed world-space positions in its constructor:

```ts
readonly stock: StockPile;
readonly waste: WastePile;
readonly foundations: readonly [FoundationPile, FoundationPile, FoundationPile, FoundationPile];
readonly tableau: readonly [TableauPile × 7];
readonly allPiles: readonly Pile[];      // flat list for iteration
```

Controllers see piles through `IBoardModel` / `IPile` (readonly). Mutations route through static operations.

### Operations layer

| File | Responsibility |
|---|---|
| `DealOperations.deal(board, rng)` | Initial Klondike deal. Called once at app boot. |
| `CardMoveOperations.moveCards(from, fromIndex, to)` | Transfer the top `(N - fromIndex)` cards bottom→top. |
| `CardMoveOperations.flipTopCard(pile, faceUp)` | Flip a pile's top card. |
| `StockOperations.drawToWaste(stock, waste, count)` | Draw N cards stock→waste, face-up. |
| `StockOperations.recycleWasteToStock(stock, waste)` | Reverse waste back to stock, face-down. |

All operations are static and take `IPile` references (internally cast to `Pile` for the mutation). No string IDs, no DI bindings for the operations themselves.

### Rules

Encoded directly on the pile classes:

- `IPile.canPlace(cards)` — would these cards legally land on this pile right now?
- `IPile.canDragFrom(index)` — can the user start a drag at this card index?
- `IPile.needsAutoFlipNewTop()` — does the new top need auto-flipping after a move out? (Tableau only.)
- `SuitRules.isRed(suit)` / `isBlack(suit)` — colour partition consumed by `TableauPile.canPlace`.

### Drag-and-drop flow

1. `BoardView` implements `IPointerInputHandler`. On pointer-down it raycasts currently-face-up card meshes (`CardObject.getPickableMeshes()` returns nothing for face-down cards).
2. Before starting a drag, the view consults a controller-supplied `setDragEligibilityPredicate`. The controller delegates to `pile.canDragFrom(index)`.
3. If allowed, the picked-up card and everything stacked above it re-parent into a `_dragRoot`, preserving the pile's `stackingOffset` locally. Pointer-move projects onto y=0 and translates the drag root.
4. Pointer-up raycasts slot fill meshes — each fill mesh's `userData.pile` carries the direct `IPile` reference of its pile. The view emits `onCardsDragReleased({ originPile, fromIndex, targetPile })`.
5. The controller validates with `targetPile.canPlace(movingCards)`. On commit: `CardMoveOperations.moveCards(...)`, then auto-flip if `originPile.needsAutoFlipNewTop()`. The view's `refresh()` is called after.
6. Pointer-down on a slot with no card hit emits `onPileTapped(pile)`. The controller compares against `boardModel.stock`; on match it draws or recycles based on stock emptiness.

The view receives its visual config (`SolitaireConfig`, including palettes, card visual, slot dimensions) once via `inject()` from the `viewDiContainer`. Its `refresh()` takes no arguments — it re-reads everything from the bound `IBoardModel` and stored config.

### Camera

Top-down 2D orthographic camera. `BoardBoundsCalculator.compute(allPiles, slotWidth, slotHeight)` produces a world-space content bbox including card-fan extension; the app centers the camera on that bbox and sets ortho size to fit on every resize so the longest tableau column stays in view.

## Project structure

```
solitaire
├──assets
└──src
    ├──constants
    │   ├──Rank.ts
    │   ├──SlotType.ts
    │   └──Suit.ts
    ├──controllers
    │   ├──BoardViewController.ts
    │   └──GameScreenViewController.ts
    ├──models
    │   ├──BoardModel.ts
    │   ├──Card.ts
    │   ├──FoundationPile.ts
    │   ├──IBoardModel.ts
    │   ├──IPile.ts
    │   ├──Pile.ts
    │   ├──StackingOffset.ts
    │   ├──StockPile.ts
    │   ├──TableauPile.ts
    │   └──WastePile.ts
    ├──utilities
    │   ├──BoardBoundsCalculator.ts
    │   ├──CardMoveOperations.ts
    │   ├──DealOperations.ts
    │   ├──DeckOperations.ts
    │   ├──IRng.ts
    │   ├──MathRandomRng.ts
    │   ├──SeededRng.ts
    │   ├──ShuffleOperations.ts
    │   ├──StockOperations.ts
    │   └──SuitRules.ts
    ├──views
    │   ├──BoardView.three.ts
    │   ├──CardObject.ts
    │   ├──GameScreenView.pixi.ts
    │   ├──IBoardView.ts
    │   ├──IGameScreenView.ts
    │   └──SlotObject.ts
    ├──SolitaireApp.ts
    ├──SolitaireConfig.ts
    ├──SolitaireUIIds.ts
    ├──main.ts
    └──style.css
```

## Running

```bash
npm install
npm run dev
```
