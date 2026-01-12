import * as THREE from "../vendor/three.module.js";

import { Time } from "./Time.js";
import { World } from "../world/World.js";
import { Renderer } from "../render/Renderer.js";
import { UI } from "../ui/UI.js";
import { Player } from "../player/Player.js";
import { Targeting } from "../render/Targeting.js";

import { makeBlockRegistry } from "../registries/Blocks.js";
import { makeItemRegistry } from "../registries/Items.js";
import { makeCropRegistry } from "../registries/Crops.js";

export class Game {
    constructor({ canvas }) {
        this.canvas = canvas;

        this.blocks = makeBlockRegistry();
        this.items = makeItemRegistry();
        this.crops = makeCropRegistry();

        this.world = new World({
            sizeX: 64,
            sizeZ: 64,
            height: 2,
            blocks: this.blocks,
            crops: this.crops,
        });

        this.renderer = new Renderer({
            canvas: this.canvas,
            world: this.world,
            blocks: this.blocks,
            crops: this.crops,
        });

        this.ui = new UI({
            items: this.items,
            blocks: this.blocks,
            crops: this.crops,
        });

        this.player = new Player({
            camera: this.renderer.camera,
            domElement: this.canvas,
            world: this.world,
            items: this.items,
            ui: this.ui,
        });

        this.targeting = new Targeting({
            camera: this.renderer.camera,
            renderer: this.renderer.renderer,
            scene: this.renderer.scene,
            world: this.world,
        });

        this.time = new Time();
        this._running = false;

        // Wire events for interaction.
        this._bindInput();
    }

    start() {
        this._running = true;

        // Initial build
        this.world.generateFlatIsland();
        this.renderer.buildStatic();
        this.renderer.rebuildDynamic(); // top-layer + water + farmland
        this.renderer.rebuildCrops();

        // UI
        this.ui.mount(document.getElementById("hotbar"));
        this.ui.setHotbar(this.player.inventory);

        // Render loop
        this.time.start((dt, t) => this._tick(dt, t));

        // Resize
        window.addEventListener("resize", () => this.renderer.resize());
        this.renderer.resize();
    }

    _bindInput() {
        // Pointer lock on click
        window.addEventListener("click", () => {
            if (!this.player.controls.isLocked()) this.player.controls.lock();
        });

        // Mouse buttons
        window.addEventListener("mousedown", (e) => {
            if (!this.player.controls.isLocked()) return;
            if (e.button === 0) this._handleLeftClick();
            if (e.button === 2) this._handleRightClick();
        });

        // Prevent context menu
        window.addEventListener("contextmenu", (e) => e.preventDefault());

        // Hotbar selection
        window.addEventListener("keydown", (e) => {
            if (e.code.startsWith("Digit")) {
                const n = Number(e.code.replace("Digit", ""));
                if (n >= 1 && n <= 9) {
                    this.player.inventory.selectSlot(n - 1);
                    this.ui.setHotbar(this.player.inventory);
                }
            }
        });

        window.addEventListener("wheel", (e) => {
            if (!this.player.controls.isLocked()) return;
            this.player.inventory.scrollSlot(Math.sign(e.deltaY));
            this.ui.setHotbar(this.player.inventory);
        }, { passive: true });
    }

    _handleLeftClick() {
        const hit = this.targeting.pickBlock(5);
        if (!hit) return;

        const { x, y, z } = hit;

        // Harvest crops first if present
        if (this.world.hasCrop(x, z)) {
            const crop = this.world.getCrop(x, z);
            if (crop && crop.stage === crop.maxStage) {
                // Harvest
                this.world.clearCrop(x, z);

                // Drops: 1 wheat most of time, 2 wheat 10%
                const count = (Math.random() < 0.10) ? 2 : 1;
                this.player.inventory.addItem("wheat", count);
                this.ui.setHotbar(this.player.inventory);

                this.renderer.rebuildCrops();
                return;
            }
        }

        // Block breaking (only top layer y=1, never break Y=0)
        if (y !== 1) return;

        const id = this.world.getBlock(x, y, z);
        const def = this.blocks[id];
        if (!def) return;
        if (!def.breakable) return;

        // Water source indestructible
        if (id === "water_source") return;

        // If farmland removed, remove crop
        if (id === "farmland") {
            this.world.clearCrop(x, z);
            this.renderer.rebuildCrops();
        }

        // Break and drop dirt if dirt/grass/farmland
        if (id === "dirt" || id === "grass" || id === "farmland") {
            this.world.setBlock(x, y, z, "air");
            // Simple auto-pickup if near
            if (this.player.isNearBlockCenter(x, y, z, 2.0)) {
                this.player.inventory.addItem("dirt_item", 1);
                this.ui.setHotbar(this.player.inventory);
            }
            // Grass regrowth timer if left as dirt later, handled by world rules.
        } else if (id === "water") {
            this.world.setBlock(x, y, z, "air");
        } else {
            // generic
            this.world.setBlock(x, y, z, "air");
        }

        this.renderer.rebuildDynamic();
    }

    _handleRightClick() {
        const selected = this.player.inventory.getSelected();
        if (!selected) return;

        const hit = this.targeting.pickBlockOrFace(5);
        if (!hit) return;

        const { x, y, z, placeX, placeY, placeZ, hitBlockId } = hit;

        // Item handler
        const itemDef = this.items[selected.id];
        if (!itemDef) return;

        const ctx = {
            game: this,
            player: this.player,
            world: this.world,
            blocks: this.blocks,
            items: this.items,
            selected,
            hit: { x, y, z, hitBlockId, placeX, placeY, placeZ }
        };

        const used = itemDef.onUse?.(ctx) ?? false;
        if (used) {
            this.ui.setHotbar(this.player.inventory);
            this.renderer.rebuildDynamic();
            this.renderer.rebuildCrops();
        }
    }

    _tick(dt, t) {
        // Update world rules (hydration, regrowth, crop growth)
        this.world.update(dt, t);

        // Player movement/physics
        this.player.update(dt);

        // Target outline
        const hit = this.targeting.pickBlock(5);
        this.renderer.setTargetOutline(hit);

        // Rebuild meshes when world flags changes
        if (this.world.consumeDirtyBlocks()) this.renderer.rebuildDynamic();
        if (this.world.consumeDirtyCrops()) this.renderer.rebuildCrops();

        this.renderer.render();
    }
}
