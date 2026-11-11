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

## Compatibility

Target: Foundry VTT V14. Compatibility is not yet verified.

## Installation

No release is available yet. A manifest URL and release package will be added after the first functional build has been tested.

## License

MIT
