# Canvas Motion

A Foundry Virtual Tabletop module for animating content rendered by the Scene Canvas.

## Development status

🚧 In development — initial scaffold only. Not yet ready for installation or gameplay.

## Roadmap

### 0.1.0 — Background Motion

Animate the static Scene Background independently from Tokens, Tiles, walls, lighting, and other canvas content.

Planned controls:
- Horizontal and vertical direction.
- Configurable speed.
- Start, pause, resume, reverse, and stop.
- Synchronized playback for connected clients.
- Restore the original visual transform on stop, scene change, and canvas teardown.

### 0.2.0 — Canvas Motion

Explore optional coordinated movement of additional Canvas content/layers.

## Technical direction

Foundry V14 exposes the scene background as `canvas.primary.background`, a `PrimarySpriteMesh` owned by `PrimaryCanvasGroup`. The primary group is cached and also contains other scene objects, so moving the entire group is not an acceptable implementation for 0.1.

The implementation will animate the background mesh (or a dedicated background-only rendering composition) while leaving the rest of the primary group unchanged. Rendering behavior, image bounds, seamless wrapping, and interaction with lighting/vision must be validated in Foundry V14 before release.

Official API references:
- [PrimaryCanvasGroup — Foundry V14 API](https://foundryvtt.com/api/classes/foundry.canvas.groups.PrimaryCanvasGroup.html)
- [PrimarySpriteMesh — Foundry V14 API](https://foundryvtt.com/api/classes/foundry.canvas.primary.PrimarySpriteMesh.html)
- [Canvas — Foundry V14 API](https://foundryvtt.com/api/v14/classes/foundry.canvas.Canvas.html)

## Installation

After the first release, install through Foundry using this manifest URL:

`https://github.com/LHartKai/canvas-motion/releases/latest/download/module.json`

The release workflow publishes:
- `module.json` — the package manifest used by Foundry.
- `canvas-motion.zip` — the installable package, with the module files inside a top-level `canvas-motion/` directory.

## Publishing a release

1. Update the `version` field in `module.json`.
2. Commit and push the changes to `main`.
3. Create and push a matching version tag. Example for version `0.1.0`:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

4. GitHub Actions checks that the tag matches `module.json`, builds the correctly structured ZIP, and publishes a GitHub Release with both assets.

The workflow can also be started manually from **Actions → Build and publish release**, using an existing tag.

Do not create a release until the module has functional code and has been tested in the target Foundry version.

## Compatibility

Target: Foundry VTT V14. Compatibility is not yet verified.

## License

MIT
