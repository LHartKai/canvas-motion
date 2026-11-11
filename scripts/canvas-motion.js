/**
 * Canvas Motion — multi-sprite continuous background loop
 * Target: Foundry VTT V14
 *
 * Moves only canvas.primary.background and visual duplicates of its texture.
 * All duplicates are created once at start and reused for every frame.
 */

const MODULE_ID = "canvas-motion";
const SOCKET_NAME = `module.${MODULE_ID}`;

class BackgroundMotion {
  constructor() {
    this.active = false;
    this.paused = false;
    this.mesh = null;
    this.originalTexture = null;
    this.processedTexture = null;
    this.loopMeshes = [];
    this.primary = null;
    this.ticker = null;
    this.tickHandler = null;
    this.origin = null;
    this.options = null;
    this.startedAt = 0;
    this.elapsedBeforePause = 0;
    this.lastSceneId = null;
    this.loopSize = 0;
    this.copyOffsets = [];
    this.phaseOffset = 0;
  }

  get isGM() { return game.user?.isGM === true; }
  get currentBackground() { return canvas?.ready ? canvas.primary?.background : null; }

  /**
   * Builds a locally processed texture whose opposite edges match on the
   * requested movement axis. The original Scene Background texture is kept.
   */
  prepareSeamlessTexture(mesh, horizontal) {
    const texture = mesh.texture;
    const resolution = texture?.baseTexture?.resolution ?? texture?.source?.resolution ?? 1;
    const frame = texture?.frame;
    const source = texture?.baseTexture?.getDrawableSource?.()
      ?? texture?.source?.resource?.source
      ?? texture?.source?.resource
      ?? texture?.baseTexture?.resource?.source
      ?? texture?.baseTexture?.resource;

    if (!source || !frame) throw new Error("Não foi possível acessar os pixels da imagem do Background.");
    const width = Math.round(frame.width * resolution);
    const height = Math.round(frame.height * resolution);
    if (width < 2 || height < 2 || width > 8192 || height > 8192 || width * height > 40000000) {
      throw new Error("A imagem excede o limite de processamento automático (8192 px por lado / 40 MP).");
    }

    const workCanvas = document.createElement("canvas");
    workCanvas.width = width;
    workCanvas.height = height;
    const context = workCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Não foi possível iniciar o processamento 2D da imagem.");

    const frameX = Math.round(frame.x * resolution);
    const frameY = Math.round(frame.y * resolution);
    context.drawImage(source, frameX, frameY, width, height, 0, 0, width, height);

    // Cross-fade opposite edge strips by averaging mirrored samples.
    // The resulting pixels at the wrap boundary are identical.
    const image = context.getImageData(0, 0, width, height);
    const pixels = image.data;
    const edgeSize = Math.max(1, Math.min(256, Math.floor((horizontal ? width : height) * 0.08)));
    const blendPair = (a, b) => {
      for (let channel = 0; channel < 4; channel++) {
        const value = Math.round((pixels[a + channel] + pixels[b + channel]) / 2);
        pixels[a + channel] = value;
        pixels[b + channel] = value;
      }
    };

    if (horizontal) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < edgeSize; x++) {
          const left = (y * width + x) * 4;
          const right = (y * width + (width - 1 - x)) * 4;
          blendPair(left, right);
        }
      }
    } else {
      for (let y = 0; y < edgeSize; y++) {
        for (let x = 0; x < width; x++) {
          const top = (y * width + x) * 4;
          const bottom = ((height - 1 - y) * width + x) * 4;
          blendPair(top, bottom);
        }
      }
    }
    context.putImageData(image, 0, 0);

    const TextureClass = globalThis.PIXI?.Texture;
    if (!TextureClass?.from) throw new Error("PIXI.Texture.from não está disponível.");
    return TextureClass.from(workCanvas);
  }

  createDuplicate(mesh) {
    const SpriteClass = globalThis.PIXI?.Sprite;
    if (!SpriteClass || !mesh.texture) throw new Error("PIXI.Sprite ou a textura do Background não está disponível.");
    const sprite = new SpriteClass(mesh.texture);
    if (mesh.anchor && sprite.anchor) sprite.anchor.copyFrom(mesh.anchor);
    if (mesh.scale && sprite.scale) sprite.scale.copyFrom(mesh.scale);
    if (mesh.pivot && sprite.pivot) sprite.pivot.copyFrom(mesh.pivot);
    if (mesh.skew && sprite.skew) sprite.skew.copyFrom(mesh.skew);
    sprite.rotation = mesh.rotation;
    sprite.alpha = mesh.alpha;
    sprite.tint = mesh.tint ?? 0xFFFFFF;
    sprite.blendMode = mesh.blendMode;
    sprite.visible = mesh.visible;
    sprite.renderable = mesh.renderable;
    sprite.eventMode = "none";
    sprite.position.set(mesh.position.x, mesh.position.y);
    return sprite;
  }

  getVisibleExtent(horizontal) {
    const screen = canvas.app?.renderer?.screen;
    const scale = horizontal ? canvas.stage?.scale?.x : canvas.stage?.scale?.y;
    const pixels = horizontal ? screen?.width : screen?.height;
    if (Number.isFinite(pixels) && Number.isFinite(scale) && scale > 0) return pixels / scale;
    const dimensions = canvas.dimensions;
    return horizontal ? dimensions?.width ?? this.loopSize : dimensions?.height ?? this.loopSize;
  }

  createLoopMeshes(mesh, direction) {
    const parent = mesh.parent;
    if (!parent) throw new Error("O Background não possui um parent no Canvas.");
    const horizontal = direction === "left" || direction === "right";
    this.loopSize = Math.abs(horizontal ? mesh.width : mesh.height);
    if (!Number.isFinite(this.loopSize) || this.loopSize <= 0) throw new Error("Dimensão inválida do Background para repetição.");

    // Cover the visible Canvas on both sides of the original Background.
    const count = Math.max(2, Math.ceil(this.getVisibleExtent(horizontal) / this.loopSize) + 2);
    const index = parent.getChildIndex(mesh);
    for (let i = -count; i <= count; i++) {
      if (i === 0) continue;
      const duplicate = this.createDuplicate(mesh);
      parent.addChildAt(duplicate, Math.min(parent.children.length, index + 1 + this.loopMeshes.length));
      this.loopMeshes.push(duplicate);
      this.copyOffsets.push(i);
    }
  }

  start(options = {}, { broadcast = true } = {}) {
    if (!this.isGM && broadcast) { ui.notifications.warn("Somente o Mestre pode controlar o movimento do cenário."); return false; }
    const mesh = this.currentBackground;
    if (!mesh) { ui.notifications.warn("Não foi possível encontrar o Background da cena atual."); return false; }
    const direction = String(options.direction ?? "left").toLowerCase();
    if (!["left", "right", "up", "down"].includes(direction)) { ui.notifications.warn("Direção inválida. Use left, right, up ou down."); return false; }
    const speed = Number(options.speed ?? 80);
    if (!Number.isFinite(speed) || speed <= 0 || speed > 2000) { ui.notifications.warn("A velocidade deve ser entre 1 e 2000 pixels por segundo."); return false; }

    this.stop({ broadcast: false, restore: true });
    try {
      this.mesh = mesh;
      this.originalTexture = mesh.texture;
      const horizontal = direction === "left" || direction === "right";
      this.processedTexture = this.prepareSeamlessTexture(mesh, horizontal);
      const originalWidth = mesh.width;
      const originalHeight = mesh.height;
      mesh.texture = this.processedTexture;
      // Preserve the Background's existing on-canvas dimensions and transform.
      mesh.width = originalWidth;
      mesh.height = originalHeight;
      this.primary = canvas.primary;
      this.origin = { x: mesh.position.x, y: mesh.position.y };
      this.options = { direction, speed };
      this.lastSceneId = canvas.scene?.id ?? null;
      this.createLoopMeshes(mesh, direction);
      this.active = true;
      this.paused = false;
      this.elapsedBeforePause = 0;
      this.phaseOffset = 0;
      this.startedAt = performance.now();
      this.ticker = canvas.app?.ticker;
      if (!this.ticker) throw new Error("Ticker do Canvas indisponível.");
      this.tickHandler = () => this.tick();
      this.ticker.add(this.tickHandler);
      this.updateLoopPositions(0);
      if (broadcast && this.isGM) game.socket.emit(SOCKET_NAME, { action: "start", options: this.options, sceneId: this.lastSceneId });
      console.info(`[${MODULE_ID}] Continuous background loop started`, { ...this.options, copies: this.loopMeshes.length });
      return true;
    } catch (error) {
      console.error(`[${MODULE_ID}] Could not start loop:`, error);
      this.cleanupLoopMeshes();
      this.restoreOriginalTexture();
      this.resetState();
      ui.notifications.error(`Canvas Motion: não foi possível iniciar. ${error.message}`);
      return false;
    }
  }

  getDirectionSign() {
    return ["left", "up"].includes(this.options.direction) ? -1 : 1;
  }

  updateLoopPositions(distance) {
    if (!this.mesh || !this.origin || !this.options) return;
    const horizontal = ["left", "right"].includes(this.options.direction);
    const signedOffset = this.phaseOffset + this.getDirectionSign() * distance;
    const offset = ((signedOffset % this.loopSize) + this.loopSize) % this.loopSize;
    const setPosition = (sprite, index) => {
      const shift = index * this.loopSize + offset;
      sprite.position.set(
        this.origin.x + (horizontal ? shift : 0),
        this.origin.y + (horizontal ? 0 : shift)
      );
    };
    setPosition(this.mesh, 0);
    this.loopMeshes.forEach((sprite, i) => setPosition(sprite, this.copyOffsets[i]));
    this.primary.renderDirty = true;
  }

  tick() {
    if (!this.active || this.paused || !this.mesh || !this.primary) return;
    if (!canvas?.ready || canvas.primary !== this.primary || (canvas.scene?.id ?? null) !== this.lastSceneId) {
      this.stop({ broadcast: false, restore: false });
      return;
    }
    // Ticker deltaMS avoids relying on frame count and keeps speed in pixels/second.
    const deltaMS = Number(canvas.app?.ticker?.deltaMS);
    const elapsedFrame = Number.isFinite(deltaMS) && deltaMS > 0 ? deltaMS : 0;
    this.elapsedBeforePause += elapsedFrame;
    this.updateLoopPositions((this.options.speed * this.elapsedBeforePause) / 1000);
  }

  pause({ broadcast = true } = {}) {
    if (!this.active || this.paused) return false;
    this.paused = true;
    if (broadcast && this.isGM) game.socket.emit(SOCKET_NAME, { action: "pause" });
    return true;
  }

  resume({ broadcast = true } = {}) {
    if (!this.active || !this.paused) return false;
    this.paused = false;
    if (broadcast && this.isGM) game.socket.emit(SOCKET_NAME, { action: "resume" });
    return true;
  }

  reverse({ broadcast = true } = {}) {
    if (!this.active || !this.options) return false;
    // Keep the current visual offset and change only the travel direction.
    const horizontal = ["left", "right"].includes(this.options.direction);
    const currentSignedOffset = this.phaseOffset + this.getDirectionSign() * (this.options.speed * this.elapsedBeforePause) / 1000;
    const currentOffset = ((currentSignedOffset % this.loopSize) + this.loopSize) % this.loopSize;
    this.options.direction = ({ left: "right", right: "left", up: "down", down: "up" })[this.options.direction];
    this.phaseOffset = currentOffset;
    this.elapsedBeforePause = 0;
    this.primary.renderDirty = true;
    if (broadcast && this.isGM) game.socket.emit(SOCKET_NAME, { action: "reverse" });
    return true;
  }

  restoreOriginalTexture() {
    if (this.mesh && this.originalTexture) {
      this.mesh.texture = this.originalTexture;
      this.primary && (this.primary.renderDirty = true);
    }
    if (this.processedTexture) this.processedTexture.destroy(true);
    this.originalTexture = null;
    this.processedTexture = null;
  }

  cleanupLoopMeshes() {
    for (const sprite of this.loopMeshes) {
      sprite.parent?.removeChild(sprite);
      sprite.destroy({ children: true, texture: false, baseTexture: false });
    }
    this.loopMeshes = [];
    this.copyOffsets = [];
  }

  stop({ broadcast = true, restore = true } = {}) {
    const wasActive = this.active;
    if (this.ticker && this.tickHandler) this.ticker.remove(this.tickHandler);
    if (restore && this.mesh && this.origin) {
      this.mesh.position.set(this.origin.x, this.origin.y);
      if (this.primary) this.primary.renderDirty = true;
    }
    this.cleanupLoopMeshes();
    this.restoreOriginalTexture();
    this.resetState();
    if (broadcast && wasActive && this.isGM) game.socket.emit(SOCKET_NAME, { action: "stop" });
    return wasActive;
  }

  resetState() {
    this.active = false; this.paused = false; this.mesh = null; this.originalTexture = null; this.processedTexture = null; this.loopMeshes = [];
    this.primary = null; this.ticker = null; this.tickHandler = null; this.origin = null;
    this.options = null; this.elapsedBeforePause = 0; this.lastSceneId = null;
    this.loopSize = 0; this.copyOffsets = []; this.phaseOffset = 0;
  }

  status() {
    return { active: this.active, paused: this.paused, direction: this.options?.direction ?? null,
      speed: this.options?.speed ?? null, sceneId: this.lastSceneId,
      copies: this.loopMeshes.length, loop: this.active ? "multi-sprite" : null,
      seamlessPreparation: this.active ? "edge-blend" : null };
  }

  handleSocket(message) {
    if (!message || this.isGM) return;
    switch (message.action) {
      case "start": if (message.sceneId === (canvas.scene?.id ?? null)) this.start(message.options, { broadcast: false }); break;
      case "pause": this.pause({ broadcast: false }); break;
      case "resume": this.resume({ broadcast: false }); break;
      case "reverse": this.reverse({ broadcast: false }); break;
      case "stop": this.stop({ broadcast: false }); break;
    }
  }
}

const canvasMotion = new BackgroundMotion();
Hooks.once("init", () => console.info(`[${MODULE_ID}] Initializing`));
Hooks.once("ready", () => {
  game.canvasMotion = {
    start: (options) => canvasMotion.start(options), pause: () => canvasMotion.pause(),
    resume: () => canvasMotion.resume(), reverse: () => canvasMotion.reverse(),
    stop: () => canvasMotion.stop(), status: () => canvasMotion.status()
  };
  game.socket.on(SOCKET_NAME, (message) => canvasMotion.handleSocket(message));
  Hooks.on("canvasTearDown", () => canvasMotion.stop({ broadcast: false, restore: false }));
  console.info(`[${MODULE_ID}] Ready — use game.canvasMotion.start({ direction: "left", speed: 80 }) in the console as GM.`);
});
