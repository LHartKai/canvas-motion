/**
 * Canvas Motion — seamless background loop prototype
 * Target: Foundry VTT V14
 *
 * Moves only canvas.primary.background and one visual duplicate.
 * The duplicate is placed directly after the background in the primary group.
 *
 * GM console API:
 *   game.canvasMotion.start({ direction: "left", speed: 80 })
 *   game.canvasMotion.pause()
 *   game.canvasMotion.resume()
 *   game.canvasMotion.reverse()
 *   game.canvasMotion.stop()
 *   game.canvasMotion.status()
 *
 * The source image must tile seamlessly on the selected axis.
 * Movement is visual only and is not saved to the Scene document.
 */

const MODULE_ID = "canvas-motion";
const SOCKET_NAME = `module.${MODULE_ID}`;

class BackgroundMotion {
  constructor() {
    this.active = false;
    this.paused = false;
    this.mesh = null;
    this.loopMesh = null;
    this.primary = null;
    this.ticker = null;
    this.tickHandler = null;
    this.origin = null;
    this.options = null;
    this.startedAt = 0;
    this.elapsedBeforePause = 0;
    this.lastSceneId = null;
    this.loopSize = 0;
  }

  get isGM() {
    return game.user?.isGM === true;
  }

  get currentBackground() {
    return canvas?.ready ? canvas.primary?.background : null;
  }

  createLoopMesh(mesh) {
    const SpriteClass = globalThis.PIXI?.Sprite;
    if (!SpriteClass || !mesh.texture) {
      throw new Error("PIXI.Sprite ou a textura do Background não está disponível.");
    }

    const duplicate = new SpriteClass(mesh.texture);
    if (mesh.anchor && duplicate.anchor) duplicate.anchor.copyFrom(mesh.anchor);
    if (mesh.scale && duplicate.scale) duplicate.scale.copyFrom(mesh.scale);
    if (mesh.pivot && duplicate.pivot) duplicate.pivot.copyFrom(mesh.pivot);
    if (mesh.skew && duplicate.skew) duplicate.skew.copyFrom(mesh.skew);

    duplicate.rotation = mesh.rotation;
    duplicate.alpha = mesh.alpha;
    duplicate.tint = mesh.tint ?? 0xFFFFFF;
    duplicate.blendMode = mesh.blendMode;
    duplicate.visible = mesh.visible;
    duplicate.renderable = mesh.renderable;
    duplicate.eventMode = "none";
    duplicate.position.set(mesh.position.x, mesh.position.y);

    const parent = mesh.parent;
    if (!parent) throw new Error("O Background não possui um parent no Canvas.");

    const backgroundIndex = parent.getChildIndex(mesh);
    parent.addChildAt(duplicate, backgroundIndex + 1);
    return duplicate;
  }

  start(options = {}, { broadcast = true } = {}) {
    if (!this.isGM && broadcast) {
      ui.notifications.warn("Somente o Mestre pode controlar o movimento do cenário.");
      return false;
    }

    const mesh = this.currentBackground;
    if (!mesh) {
      ui.notifications.warn("Não foi possível encontrar o Background da cena atual.");
      return false;
    }

    const direction = String(options.direction ?? "left").toLowerCase();
    const validDirections = ["left", "right", "up", "down"];
    if (!validDirections.includes(direction)) {
      ui.notifications.warn("Direção inválida. Use left, right, up ou down.");
      return false;
    }

    const speed = Number(options.speed ?? 80);
    if (!Number.isFinite(speed) || speed <= 0 || speed > 2000) {
      ui.notifications.warn("A velocidade deve ser um número entre 1 e 2000 pixels por segundo.");
      return false;
    }

    this.stop({ broadcast: false, restore: true });

    try {
      this.mesh = mesh;
      this.primary = canvas.primary;
      this.origin = { x: mesh.position.x, y: mesh.position.y };
      this.options = { direction, speed };
      this.loopMesh = this.createLoopMesh(mesh);
      this.loopSize = direction === "left" || direction === "right"
        ? Math.abs(mesh.width)
        : Math.abs(mesh.height);

      if (!Number.isFinite(this.loopSize) || this.loopSize <= 0) {
        throw new Error("Não foi possível determinar as dimensões do Background.");
      }

      this.active = true;
      this.paused = false;
      this.elapsedBeforePause = 0;
      this.startedAt = performance.now();
      this.lastSceneId = canvas.scene?.id ?? null;

      this.tickHandler = () => this.tick();
      this.ticker = canvas.app?.ticker;

      if (!this.ticker) throw new Error("O ticker de renderização do Canvas não está disponível.");

      this.ticker.add(this.tickHandler);
      this.updateLoopPositions(0);

      if (broadcast && this.isGM) {
        game.socket.emit(SOCKET_NAME, {
          action: "start",
          options: this.options,
          sceneId: this.lastSceneId
        });
      }

      console.info(`[${MODULE_ID}] Seamless background loop started`, this.options);
      return true;
    } catch (error) {
      console.error(`[${MODULE_ID}] Could not start background loop:`, error);
      this.cleanupLoopMesh();
      this.resetState();
      ui.notifications.error(`Canvas Motion: não foi possível iniciar o loop. ${error.message}`);
      return false;
    }
  }

  updateLoopPositions(distance) {
    if (!this.mesh || !this.loopMesh || !this.origin || !this.options) return;

    const horizontal = this.options.direction === "left" || this.options.direction === "right";
    const size = this.loopSize;
    const offset = distance % size;

    let x = this.origin.x;
    let y = this.origin.y;
    let loopX = this.origin.x;
    let loopY = this.origin.y;

    switch (this.options.direction) {
      case "left":
        x -= offset;
        loopX = x + size;
        break;
      case "right":
        x += offset;
        loopX = x - size;
        break;
      case "up":
        y -= offset;
        loopY = y + size;
        break;
      case "down":
        y += offset;
        loopY = y - size;
        break;
    }

    this.mesh.position.set(x, y);
    this.loopMesh.position.set(loopX, loopY);
    this.primary.renderDirty = true;
  }

  tick() {
    if (!this.active || this.paused || !this.mesh || !this.primary) return;

    if (!canvas?.ready || canvas.primary !== this.primary ||
        (canvas.scene?.id ?? null) !== this.lastSceneId) {
      this.stop({ broadcast: false, restore: false });
      return;
    }

    const elapsed = this.elapsedBeforePause + (performance.now() - this.startedAt);
    const distance = (this.options.speed * elapsed) / 1000;
    this.updateLoopPositions(distance);
  }

  pause({ broadcast = true } = {}) {
    if (!this.active || this.paused) return false;
    this.tick();
    this.elapsedBeforePause += performance.now() - this.startedAt;
    this.paused = true;
    if (broadcast && this.isGM) game.socket.emit(SOCKET_NAME, { action: "pause" });
    return true;
  }

  resume({ broadcast = true } = {}) {
    if (!this.active || !this.paused) return false;
    this.startedAt = performance.now();
    this.paused = false;
    if (broadcast && this.isGM) game.socket.emit(SOCKET_NAME, { action: "resume" });
    return true;
  }

  reverse({ broadcast = true } = {}) {
    if (!this.active || !this.options) return false;

    const opposite = { left: "right", right: "left", up: "down", down: "up" };
    this.options.direction = opposite[this.options.direction];

    // Rebase at the currently visible position so reversing never jumps.
    this.origin = { x: this.mesh.position.x, y: this.mesh.position.y };
    this.loopSize = this.options.direction === "left" || this.options.direction === "right"
      ? Math.abs(this.mesh.width)
      : Math.abs(this.mesh.height);

    // Keep the duplicate on the correct side for the new direction.
    this.elapsedBeforePause = 0;
    this.startedAt = performance.now();
    this.updateLoopPositions(0);

    if (broadcast && this.isGM) game.socket.emit(SOCKET_NAME, { action: "reverse" });
    return true;
  }

  cleanupLoopMesh() {
    if (this.loopMesh) {
      this.loopMesh.parent?.removeChild(this.loopMesh);
      this.loopMesh.destroy({ children: true, texture: false, baseTexture: false });
    }
    this.loopMesh = null;
  }

  stop({ broadcast = true, restore = true } = {}) {
    const wasActive = this.active;

    if (this.ticker && this.tickHandler) this.ticker.remove(this.tickHandler);

    if (restore && this.mesh && this.origin) {
      this.mesh.position.set(this.origin.x, this.origin.y);
      if (this.primary) this.primary.renderDirty = true;
    }

    this.cleanupLoopMesh();
    this.resetState();

    if (broadcast && wasActive && this.isGM) game.socket.emit(SOCKET_NAME, { action: "stop" });
    return wasActive;
  }

  resetState() {
    this.active = false;
    this.paused = false;
    this.mesh = null;
    this.loopMesh = null;
    this.primary = null;
    this.ticker = null;
    this.tickHandler = null;
    this.origin = null;
    this.options = null;
    this.startedAt = 0;
    this.elapsedBeforePause = 0;
    this.lastSceneId = null;
    this.loopSize = 0;
  }

  status() {
    return {
      active: this.active,
      paused: this.paused,
      direction: this.options?.direction ?? null,
      speed: this.options?.speed ?? null,
      sceneId: this.lastSceneId,
      loop: this.active ? "seamless-repeat" : null
    };
  }

  handleSocket(message) {
    if (!message || this.isGM) return;
    switch (message.action) {
      case "start":
        if (message.sceneId === (canvas.scene?.id ?? null)) this.start(message.options, { broadcast: false });
        break;
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
    start: (options) => canvasMotion.start(options),
    pause: () => canvasMotion.pause(),
    resume: () => canvasMotion.resume(),
    reverse: () => canvasMotion.reverse(),
    stop: () => canvasMotion.stop(),
    status: () => canvasMotion.status()
  };

  game.socket.on(SOCKET_NAME, (message) => canvasMotion.handleSocket(message));
  Hooks.on("canvasTearDown", () => canvasMotion.stop({ broadcast: false, restore: false }));

  console.info(`[${MODULE_ID}] Ready — use game.canvasMotion.start({ direction: "left", speed: 80 }) in the console as GM.`);
});
