# UI Components Playground

Single-screen harness for the components shipped by `src/modules/uicomponents/`.
Each component family gets its own sidebar entry; the active demo
mounts into the stage region with a controls panel for live prop
tweaking and an event log for runtime callbacks.

```
┌────────────────┬────────────────────┬──────────┐
│ Sidebar        │ Stage (active demo)│ Controls │
│  Button        │                    │ (live    │
│  Slider        │                    │  prop    │
│  Toggle        ├────────────────────┤  tweaks) │
│  GridLayout    │ Event log (rolling)│          │
│  Dropdown      │                    │          │
│  RadioButton   │                    │          │
│  RadioGroup    │                    │          │
│  ScrollView    │                    │          │
│  List          │                    │          │
│   …            │                    │          │
└────────────────┴────────────────────┴──────────┘
```

Three columns: sidebar (left, fixed width), centre (stage on top + log
underneath), and the controls panel (right, fixed width). The active
demo view is centered inside the stage region by the parent's flex
layout — demo views don't need internal centring wrappers.

## Architecture

The playground follows AGENTS.md's MVC pattern strictly. Every demo is
a full `IView` + `IViewController` pair:

- **`*DemoView.pixi.ts`** — extends `HudViewBase`. Owns the live
  `XxxComponent` instance and exposes setters (`setWidth`, `setLabel`,
  …) plus event hooks (`onPress`, `onChange`).
- **`*DemoViewController.ts`** — implements `IViewController<I*DemoView>`.
  Resolves `IControlsManager` from DI, populates the controls panel
  with `addSliderControl` / `addToggleControl` / `addCycleControl` /
  `addActionControl` rows, wires those callbacks back to the view's
  setters, and pipes the view's events into the log.

The **shell** is also a regular MVC pair (`PlaygroundShellView` +
`PlaygroundShellViewController`). It hosts the sidebar, the stage
region (where the active demo view lives), the controls panel, and the
event log.

`ControlsManager` (`utilities/ControlsManager.ts`) is the bridge that
lets demo controllers populate the shell's controls panel without
importing any rendering primitives. It implements `IControlsManager`
(the demo-facing interface) and forwards calls to the live shell view
once the shell controller binds it.

## Adding a new component playground

Four steps — strict MVC, no fixture shortcuts:

1. **Implement the View** under `src/views/MyNewDemoView.pixi.ts`
   (and `src/views/IMyNewDemoView.ts`):

   ```ts
   export class MyNewDemoView extends HudViewBase implements IMyNewDemoView {
     // build the live XxxComponent instance, expose setters + onXxx callbacks
   }
   ```

2. **Implement the Controller** under
   `src/controllers/MyNewDemoViewController.ts`:

   ```ts
   export class MyNewDemoViewController implements IViewController<IMyNewDemoView> {
     public inject(resolver: IInstanceResolver): void {
       this._controls = resolver.getInstance(IControlsManager);
     }
     public initialize(view: IMyNewDemoView): void {
       this._controls.clear();
       // controls.addSliderControl(...) / addToggleControl(...) / etc.
       // hook view.onXxx → controls.appendLog(...)
     }
     // …
   }
   ```

3. **Register the pair** in `UIPlaygroundApp.configureViews`:

   ```ts
   this.viewFactory.register(MyNewDemoView, MyNewDemoViewController);
   ```

4. **Wire the sidebar entry**:

   - Add a row to `DEMO_REGISTRY` in `constants/DemoRegistry.ts`.
   - Add the `id → MyNewDemoView` entry in
     `PlaygroundShellView._DEMO_VIEW_BY_ID`.

The shell picks up the new sidebar item, instantiates the view via
`viewFactory.createView(MyNewDemoView)` on selection (which auto-injects
+ initialises the controller), and adds the view to the stage region.

### Reusable controls

`IControlsManager` exposes four populators:

- `addSliderControl(label, {min, max, step?, value, format?}, onChange)` —
  numeric tweak (width, height, gap, etc.).
- `addToggleControl(label, initial, onChange)` — boolean tweak.
- `addCycleControl(label, values, initialIndex, formatValue, onChange)` —
  enum-like cycle through a fixed set (color palettes, label presets).
- `addActionControl(label, onPress)` — one-shot action button.

Each returns an `Unsubscribe`. Collect them in your controller's
`UnsubscribeBag` so they're auto-removed on `destroy()`.

## Files

```
examples/uiplayground/src/
├── constants/
│   ├── DemoPresets.ts                      # palettes / label arrays / range presets / grid item-height modes / dropdown items / radio palette
│   ├── DemoRegistry.ts                     # DEMO_REGISTRY (id, label, category)
│   ├── PlaygroundTypes.ts                  # DemoCategory, SIDEBAR_CATEGORY_ORDER, DemoEntry, SliderControlOpts
│   └── Typography.ts                        # FONT_FAMILY, MONO_FAMILY, LABEL_STYLE, READOUT_STYLE
├── controllers/
│   ├── ButtonDemoViewController.ts
│   ├── DropdownDemoViewController.ts
│   ├── GridLayoutDemoViewController.ts
│   ├── ListDemoViewController.ts
│   ├── PlaygroundShellViewController.ts    # sidebar selection routing + ControlsManager.bindShell
│   ├── RadioButtonDemoViewController.ts
│   ├── RadioButtonGroupDemoViewController.ts
│   ├── ScrollViewDemoViewController.ts
│   ├── SliderDemoViewController.ts
│   └── ToggleDemoViewController.ts
├── utilities/
│   ├── ControlsManager.ts                  # state coordinator: shell ref + forwarding API
│   └── IControlsManager.ts                 # demo-facing interface + InjectionToken
├── views/
│   ├── ButtonDemoView.pixi.ts
│   ├── DropdownDemoView.pixi.ts
│   ├── GridLayoutDemoView.pixi.ts
│   ├── IButtonDemoView.ts
│   ├── IDropdownDemoView.ts
│   ├── IGridLayoutDemoView.ts
│   ├── IListDemoView.ts
│   ├── IPlaygroundShellView.ts
│   ├── IRadioButtonDemoView.ts
│   ├── IRadioButtonGroupDemoView.ts
│   ├── IScrollViewDemoView.ts
│   ├── ISliderDemoView.ts
│   ├── IToggleDemoView.ts
│   ├── ListDemoView.pixi.ts
│   ├── PlaygroundShellView.pixi.ts          # sidebar + stage + controls + log layout, hosts demo views
│   ├── RadioButtonDemoView.pixi.ts
│   ├── RadioButtonGroupDemoView.pixi.ts
│   ├── ScrollViewDemoView.pixi.ts
│   ├── SliderDemoView.pixi.ts
│   └── ToggleDemoView.pixi.ts
├── UIPlaygroundApp.ts                      # registers shell + every demo View↔Controller pair, binds ControlsManager
├── UIPlaygroundConfig.ts                   # region sizing + colors
├── UIPlaygroundUIIds.ts
└── main.ts
```

## Running

```bash
cd examples/uiplayground
npm install
npm run dev          # http://localhost:5184
npm run build        # vite production build
npm run typecheck
```

Or from the repo root: `./RunUIPlayground.sh`.
