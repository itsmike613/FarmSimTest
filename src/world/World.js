import { randRange } from "../utils/Math.js";
import { applyWorldRules } from "./WorldRules.js";

export class World {
    constructor({ sizeX, sizeZ, height, blocks, crops }) {
        this.sizeX = sizeX;
        this.sizeZ = sizeZ;
        this.height = height;

        this.blocks = blocks;
        this.crops = crops;

        // World storage: block ids by [x][y][z] flattened for speed
        this._data = new Array(sizeX * height * sizeZ).fill("air");

        // Crop storage per [x][z]
        this._crop = new Array(sizeX * sizeZ).fill(null);

        // Timers per [x][z] for grass regrowth and farmland reversion
        this._grassAt = new Float32Array(sizeX * sizeZ);
        this._revertAt = new Float32Array(sizeX * sizeZ);

        this._dirtyBlocks = true;
        this._dirtyCrops = true;

        // Place infinite water source on midpoint of north edge (z=0), y=1
        this.waterSource = { x: Math.floor(sizeX / 2), y: 1, z: 0 };
    }

    idx(x, y, z) {
        return x + this.sizeX * (y + this.height * z);
    }

    idx2(x, z) {
        return x + this.sizeX * z;
    }

    inBounds(x, y, z) {
        return x >= 0 && x < this.sizeX && z >= 0 && z < this.sizeZ && y >= 0 && y < this.height;
    }

    getBlock(x, y, z) {
        if (!this.inBounds(x, y, z)) return "air";
        return this._data[this.idx(x, y, z)];
    }

    setBlock(x, y, z, id) {
        if (!this.inBounds(x, y, z)) return;
        // Enforce: never break/replace Y=0
        if (y === 0) return;

        // Enforce: water source immutable
        if (this.getBlock(x, y, z) === "water_source") return;
        if (id === "water_source") return;

        this._data[this.idx(x, y, z)] = id;
        this._dirtyBlocks = true;

        // Schedule grass regrowth when dirt exists (and not farmland)
        if (id === "dirt") {
            this._grassAt[this.idx2(x, z)] = this._now + randRange(10, 20);
        }

        // If block changed away from farmland, clear revert timer
        if (id !== "farmland") {
            this._revertAt[this.idx2(x, z)] = 0;
        }
    }

    generateFlatIsland() {
        // Y=0: subsoil (unbreakable), Y=1: grass
        for (let x = 0; x < this.sizeX; x++) {
            for (let z = 0; z < this.sizeZ; z++) {
                this._data[this.idx(x, 0, z)] = "subsoil";
                this._data[this.idx(x, 1, z)] = "grass";
                this._grassAt[this.idx2(x, z)] = 0;
                this._revertAt[this.idx2(x, z)] = 0;
                this._crop[this.idx2(x, z)] = null;
            }
        }

        // Place water source
        const ws = this.waterSource;
        this._data[this.idx(ws.x, ws.y, ws.z)] = "water_source";

        this._dirtyBlocks = true;
        this._dirtyCrops = true;
    }

    // Crops
    hasCrop(x, z) {
        return !!this._crop[this.idx2(x, z)];
    }

    getCrop(x, z) {
        return this._crop[this.idx2(x, z)];
    }

    plantCrop(x, z, cropId) {
        const def = this.crops[cropId];
        if (!def) return false;

        this._crop[this.idx2(x, z)] = {
            id: cropId,
            stage: 0,
            maxStage: def.stages - 1,
            stageTime: def.stageTime,
            nextAt: this._now + def.stageTime,
        };
        this._dirtyCrops = true;
        return true;
    }

    clearCrop(x, z) {
        this._crop[this.idx2(x, z)] = null;
        this._dirtyCrops = true;
    }

    consumeDirtyBlocks() {
        const v = this._dirtyBlocks;
        this._dirtyBlocks = false;
        return v;
    }

    consumeDirtyCrops() {
        const v = this._dirtyCrops;
        this._dirtyCrops = false;
        return v;
    }

    update(dt, t) {
        this._now = t;
        applyWorldRules(this);
    }

    // Used by physics
    isSolidAt(x, y, z) {
        const id = this.getBlock(x, y, z);
        const def = this.blocks[id];
        return !!def?.solid;
    }
}
