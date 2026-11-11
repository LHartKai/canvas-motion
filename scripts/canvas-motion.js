/**
 * Canvas Motion
 * Foundry VTT V14
 *
 * 0.1.0: Background-only motion.
 *
 * Implementation note:
 * The background is rendered inside Foundry's canvas primary group.
 * This first version deliberately avoids translating the entire primary
 * group because that would also move foreground canvas content such as
 * drawings, tiles, and potentially other placeables.
 *
 * The animation renderer will be connected after confirming the exact V14
 * background sprite lifecycle and texture sizing. No scene documents are
 * modified by this module.
 */

const MODULE_ID = "canvas-motion";

Hooks.once("init", () => {
  console.info(`[${MODULE_ID}] Initializing`);
});

Hooks.once("ready", () => {
  console.info(`[${MODULE_ID}] Ready — background-only prototype scaffold`);
});
