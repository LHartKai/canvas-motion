/**
 * Canvas Motion — Background Motion prototype
 * Target: Foundry VTT V14
 *
 * This prototype translates only canvas.primary.background.
 * It intentionally does not move the PrimaryCanvasGroup.
 *
 * Test API (GM only):
 *   game.canvasMotion.start({ direction: "left", speed: 80 })
 *   game.canvasMotion.stop()
 *   game.canvasMotion.pause()
 *   game.canvasMotion.resume()
 *   game.canvasMotion.reverse()
 *   game.canvasMotion.status()
 *
 * Limitations of this first prototype:
 * - The image is translated as a single sprite; no seamless tiling/wrapping yet.
 * - Movement is visual only and is not saved to the Scene document.
 * - Requires a live Scene Canvas.
 */

const MODULE_ID = "canvas-motion";
const SOCKET_NAME = `module.${MODULE_ID}`;

class BackgroundMotion {
  constructor() {
    this.active = false;
    this.paused = false;
    this.mesh = null;
    this.primary = null;
    this.ticker = null;
    this.tickHandler = null;
    this.origin = null;
    this.options = null;
    this.startedAt = 0;
    this.elapsedBeforePause = 0;
    this.lastSceneId = null;
  }

  get isGM() {
    return game.user?.isGM === true;
  }

  get currentBackground() {
    return canvas?.ready ? canvas.primary?.background : null;
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

    this.mesh = mesh;
    this.primary = canvas.primary;
    this.origin = { x: mesh.position.x, y: mesh.position.y };
    this.options = { direction, speed };
    this.active = true;
    this.paused = false;
    this.elapsedBeforePause = 0;
    this.startedAt = performance.now();
    this.lastSceneId = canvas.scene?.id ?? null;

    this.tickHandler = () => this.tick();
    this.ticker = canvas.app?.ticker;

    if (!this.ticker) {
      this.resetState();
      ui.notifications.error("O ticker de renderização do Canvas não está disponível.");
      return false;
    }

    this.ticker.add(this.tickHandler);

    if (broadcast && this.isGM) {
      game.socket.emit(SOCKET_NAME, {
        action: "start",
        options: this.options,
        sceneId: this.lastSceneId
      });
    }

    console.info(`[${MODULE_ID}] Background motion started`, this.options);
    return true;
  }

  tick() {
    if (!this.active || this.paused || !this.mesh || !this.primary) return;

    // Stop safely if Foundry changed or destroyed the active scene canvas.
    if (!canvas?.ready || canvas.primary !== this.primary ||
        (canvas.scene?.id ?? null) !== this.lastSceneId) {
      this.stop({ broadcast: false, restore: false });
      return;
    }

    const elapsed = this.elapsedBeforePause + (performance.now() - this.startedAt);
    const distance = (this.options.speed * elapsed) / 1000;

    let x = this.origin.x;
    let y = this.origin.y;

    switch (this.options.direction) {
      case "left":  x -= distance; break;
      case "right": x += distance; break;
      case "up":    y -= distance; break;
      case "down":  y += distance; break;
    }

    this.mesh.position.set(x, y);

    // The primary group is cached. Mark it dirty so the changed background
    // mesh is included in the next cached render. Other children keep their
    // original transforms.
    this.primary.renderDirty = true;
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

    const opposite = {
      left: "right",
      right: "left",
      up: "down",
      down: "up"
    };
    this.options.direction = opposite[this.options.direction];
    this.rebaseAtCurrentPosition();

    if (broadcast && this.isGM) game.socket.emit(SOCKET_NAME, { action: "reverse" });
    return true;
  }

  rebaseAtCurrentPosition() {
    if (!this.mesh || !this.options) return;
    this.origin = { x: this.mesh.position.x, y: this.mesh.position.y };
    this.elapsedBeforePause = 0;
    this.startedAt = performance.now();
  }

  stop({ broadcast = true, restore = true } = {}) {
    const wasActive = this.active;

    if (this.ticker && this.tickHandler) this.ticker.remove(this.tickHandler);

    if (restore && this.mesh && this.origin) {
      this.mesh.position.set(this.origin.x, this.origin.y);
      if (this.primary) this.primary.renderDirty = true;
    }

    this.resetState();

    if (broadcast && wasActive && this.isGM) {
      game.socket.emit(SOCKET_NAME, { action: "stop" });
    }
    return wasActive;
  }

  resetState() {
    this.active = false;
    this.paused = false;
    this.mesh = null;
    this.primary = null;
    this.ticker = null;
    this.tickHandler = null;
    this.origin = null;
    this.options = null;
    this.startedAt = 0;
    this.elapsedBeforePause = 0;
    this.lastSceneId = null;
  }

  status() {
    return {
      active: this.active,
      paused: this.paused,
      direction: this.options?.direction ?? null,
      speed: this.options?.speed ?? null,
      sceneId: this.lastSceneId
    };
  }

  handleSocket(message) {
    if (!message || this.isGM) return;

    switch (message.action) {
      case "start":
        if (message.sceneId === (canvas.scene?.id ?? null)) {
          this.start(message.options, { broadcast: false });
        }
        break;
      case "pause": this.pause({ broadcast: false }); break;
      case "resume": this.resume({ broadcast: false }); break;
      case "reverse": this.reverse({ broadcast: false }); break;
      case "stop": this.stop({ broadcast: false }); break;
    }
  }
}

const canvasMotion = new BackgroundMotion();

Hooks.once("init", () => {
  console.info(`[${MODULE_ID}] Initializing`);
});

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

  Hooks.on("canvasTearDown", () => {
    canvasMotion.stop({ broadcast: false, restore: false });
  });

  console.info(`[${MODULE_ID}] Ready — use game.canvasMotion.start({ direction: "left", speed: 80 }) in the console as GM.`);
});
