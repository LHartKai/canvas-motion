# Canvas Motion

A Foundry Virtual Tabletop module for animating content rendered by the Scene Canvas.

## Development status

🚧 Prototype in development — not yet a stable release.

## 0.1 — Background Motion

The current prototype translates only the static Scene Background mesh. It does not intentionally move Tokens, Tiles, walls, lights, or other Scene documents.

### Test in Foundry V14

1. Install/enable the module from your local module files or a development package.
2. Open a Scene that has a static Background image.
3. Open the browser developer console as the GM.
4. Start movement:

   ```js
   game.canvasMotion.start({ direction: "left", speed: 80 });
   ```

   Supported directions: `left`, `right`, `up`, `down`.
   Speed is in canvas pixels per second.

5. Available controls:

   ```js
   game.canvasMotion.pause();
   game.canvasMotion.resume();
   game.canvasMotion.reverse();
   game.canvasMotion.stop();
   game.canvasMotion.status();
   ```

The GM controls movement and the module broadcasts the commands to connected clients.

### Current prototype limitations

- No seamless repeating/tiling yet. The image moves as one sprite, so empty canvas can become visible at the edges.
- No settings window or scene-control buttons yet; the test API is exposed through `game.canvasMotion`.
- Movement is visual only and is not saved to Scene data.
- Test with a disposable scene first. Rendering and synchronization need validation in the target V14 build.

## 0.2 — Canvas Motion

Future milestone for optional coordinated movement of additional Canvas layers.

## Technical direction

Foundry V14 exposes the scene background as `canvas.primary.background`, a `PrimarySpriteMesh` owned by `PrimaryCanvasGroup`. The primary group is cached and also contains other scene objects. The prototype therefore changes only the background mesh transform and marks the cached primary group dirty for redraw; it does not translate the group itself.

Official API references:
- [PrimaryCanvasGroup — Foundry V14 API](https://foundryvtt.com/api/classes/foundry.canvas.groups.PrimaryCanvasGroup.html)
- [PrimarySpriteMesh — Foundry V14 API](https://foundryvtt.com/api/modules/foundry.canvas.primary.html)
- [CachedContainer — Foundry V14 API](https://foundryvtt.com/api/classes/foundry.canvas.containers.CachedContainer.html)

## Installation

Manifest URL:
`https://github.com/LHartKai/canvas-motion/releases/latest/download/module.json`

The release workflow publishes `module.json` and an installable `canvas-motion.zip`. No stable release should be published until the prototype has been tested in Foundry V14.

## Publishing a release

Update `version` in `module.json`, commit the tested code, then push a matching tag (for example `v0.1.0`). The GitHub Actions workflow validates the version, builds the package with a top-level `canvas-motion/` folder, and publishes the release.

## Compatibility

Target: Foundry VTT V14. Not yet verified.

## License

MIT
