# gamelabs.examples

Example projects demonstrating [`@gamebyte/gamelabsjs`](https://www.npmjs.com/package/@gamebyte/gamelabsjs) — a TypeScript skeleton + reusable modules for web games (Three.js + PixiJS).

Each example is a standalone Vite app that depends on the published `@gamebyte/gamelabsjs` package.

## Quick start

Pick an example and run it:

```bash
cd <example>
npm install
npm run dev
```

`npm run build` produces a production bundle in `<example>/dist/`.

## Examples

| Example | Dev port | Description |
|---------|---------:|-------------|
| `helloworld` | 5175 | 3D cube with orbital camera and HUD controls |
| `screens` | 5176 | Screen navigation using built-in modules |
| `tictactoe` | 5177 | TicTacToe with gamegrid module, win detection |
| `match3` | 5178 | Match-3 puzzle with animated gem board |
| `avoidance` | 5179 | Survival game with keyboard + on-screen joystick input |
| `watersort` | 5180 | Puzzle game with tween pour animations |
| `2048` | 5181 | 2048 sliding-tile puzzle with keyboard / swipe input and best-score persistence |
| `hexasort` | 5182 | Hexagonal sort puzzle with decoupled sorting manager |
| `colorblockjam` | 5183 | Color-matching brick puzzle with pre-baked GLB brick shapes, silhouette outlines, and smooth drag |
| `uiplayground` | 5184 | Harness for components from `uicomponents`, with live prop tweaking |
| `bubbleshooter` | 5185 | Bubble shooter with aim guide and chain pops |
| `solitaire` | 5186 | Klondike Solitaire with pointer-driven drag-and-drop |
| `towerdefense` | 5187 | Tower defense with pure-state managers and reconcile-based rendering |
| `castlecrushers` | 5188 | 2D physics sandbox (matter-js via the optional `physics2d` module): flick cannonballs to topple a block castle |
| `factorymatch` | 5189 | 3D physics collector (cannon-es via the optional `physics3d` module): pick shapes from a tumbling pile, match 3 of a kind |
| `example_template` | 5190 | Minimum starting point: one `GameScreen` with a title and empty world — copy this folder to scaffold a new game |

See each example's own `README.md` (where present) for gameplay rules and implementation notes.

## Requirements

- Node.js 20 or 22
- npm 10+

## Repository layout

Each top-level folder is an independent Vite + TypeScript project with its own `package.json`, `tsconfig.json`, and `vite.config.ts`. They share no source code — every example is self-contained so it can be copied out as a starting point for a new game.

## License

See the [`@gamebyte/gamelabsjs`](https://github.com/gamebyte-ai/gamelabs.js) repository for license details.
