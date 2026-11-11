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

- Continuous repetition uses multiple pre-created sprites positioned around the original Background. The number of copies is calculated from the visible Canvas extent and the image size.
- No settings window or scene-control buttons yet; the test API is exposed through `game.canvasMotion`.
- Movement is visual only and is not saved to Scene data.
- Test with a disposable scene first. Rendering and synchronization need validation in the target V14 build.

## Compendium — Macros

On the first load of each World by a GM, the module automatically creates or completes a **world compendium** named **Canvas Motion — Macros**. The nine Script macro source files are shipped with the module and imported into that world compendium:

- Start movement left, right, up, or down (default speed: 80 canvas pixels/second).
- Pause and resume movement.
- Reverse direction.
- Stop movement and restore the original Background position.
- Check the current movement status.

The macros call the public `game.canvasMotion` API. They require the module to be enabled and are intended to be run by the GM. This is a World compendium (not a read-only module pack), because Foundry V11+ compendium storage uses its own database format. Existing entries are preserved; only missing macro names are added. The source JSON files are kept under `packs/canvas-motion-macros/` inside the module.

## Continuous Background Loop

The prototype now creates a row or column of visual copies around the original Background. Copies are created once when movement starts and reused on each ticker update; movement uses the Foundry ticker delta time and is measured in canvas pixels per second. The original Background position is restored when movement stops.

The module now prepares a temporary seamless version of the Background locally when movement starts. It feathers samples from opposite edges on the movement axis (horizontal for left/right, vertical for up/down), with the blend strongest at the boundary and smoothly fading into the image, then uses that processed texture for the continuous loop. The original Scene Background texture is restored when movement stops; the source image file is never modified. Processing is limited to images up to 8192 px per side and 40 megapixels. This first-pass edge blend is intended for organic scenery and may create ghosting on maps with buildings, roads, text, or other distinct features. The implementation still needs validation in Foundry V14 at different zoom levels and with both movement axes.

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


## Automatic seamless preparation

When `game.canvasMotion.start()` runs, Canvas Motion creates a temporary in-memory copy of the Scene Background and feathers opposite edge samples along the selected movement axis, with a smooth falloff to reduce mirrored artifacts. No external editor, upload, or manual image preparation is required. The original image file and Scene data are not modified. The temporary texture is discarded and the original texture restored when movement stops.

This initial algorithm is intentionally lightweight and runs locally in the browser. It is best suited to organic scenery such as water, clouds, grass, terrain, and foliage. It cannot reliably reconstruct unique structures, roads, text, or other distinctive objects; inspect the result in-game before using it in a session. Very large images (over 8192 px on either side or 40 megapixels total) are rejected to avoid excessive memory use.


### Automatic macro compendium setup

The module's macro JSON files are source assets, not a prebuilt LevelDB pack. When a GM loads a World with Canvas Motion enabled, the module creates the World compendium `Canvas Motion — Macros` if it does not exist and imports any missing macros. Existing macros are not overwritten. This avoids distributing an empty or invalid module compendium folder and requires no manual export step.


### Edge correction by movement axis

Horizontal scrolling uses a color-balancing pass on the left and right edge strips. It gradually corrects average color differences per row instead of mixing recognizable pixels from opposite sides, which can create mirrored trees or other duplicated details. Vertical scrolling retains the feathered pixel blend because it has looked better in the maps tested so far. Both approaches are approximate and should be visually checked with each map.


## Unified lightweight seam preparation

Both horizontal and vertical movement now use the same one-shot offset-and-feather preparation. The image is shifted by half its size along the movement axis, moving the original wrap boundary to the center. A narrow, smooth crossfade is applied only around that relocated seam. This avoids per-frame image processing and requires no external libraries. The source image and Scene data remain unchanged. This is an experimental lightweight approach and still requires visual validation on varied maps; highly distinctive objects crossing the seam may remain noticeable.


**Offset restoration fix:** after the center seam is blended, the image is shifted back to its original orientation. This returns the repaired seam to the outer edges of the texture, where the scrolling loop joins. The previous experimental version omitted this inverse offset and left a visible band inside the map.


### Adaptive localized seam feathering

The experimental seam preparation now uses the same adaptive method for horizontal and vertical scrolling. It measures RGB mismatch along the relocated seam, smooths those measurements over a five-sample neighborhood, and selects a local feather width: already-compatible areas receive a narrow correction, while larger mismatches receive a wider transition. The image is offset for processing and then restored to its original orientation. Processing is performed once at movement start, with no per-frame image analysis or external libraries. This is a lightweight heuristic, not content-aware reconstruction; maps with distinctive objects crossing an edge may still show artifacts and require visual testing.


### Minimum-error seam path (experimental)

The previous broad adaptive blend has been replaced with a lightweight dynamic-programming seam search. After offsetting the image, the algorithm searches a narrow band around the relocated join and chooses a continuous path with low adjacent-pixel color/gradient difference. It then applies only a one-pixel feather along that path. The same method is used for horizontal and vertical movement. Search is bounded to at most 257 candidate positions per scanline and runs once at movement start. This reduces broad blur and mirrored artifacts, but does not synthesize replacement scenery; if a map has no naturally compatible path through the overlap, a future localized patch-synthesis stage may be needed.
