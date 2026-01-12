import { manhattan2D } from "../utils/Math.js";

/**
 * Rules:
 * - Farmland must be within 4 Manhattan distance of any water block (water_source or water).
 *   If not, it reverts to dirt after ~3 seconds.
 * - Dirt (not farmland) regrows to grass after 10–20 seconds.
 * - Crops grow through stages; if farmland reverts, crop removed.
 */
export function applyWorldRules(world) {
    const { sizeX, sizeZ } = world;

    for (let x = 0; x < sizeX; x++) {
        for (let z = 0; z < sizeZ; z++) {
            const top = world.getBlock(x, 1, z);
            const i2 = world.idx2(x, z);

            // Grass regrowth
            if (top === "dirt") {
                const at = world._grassAt[i2];
                if (at > 0 && world._now >= at) {
                    world._data[world.idx(x, 1, z)] = "grass";
                    world._grassAt[i2] = 0;
                    world._dirtyBlocks = true;
                }
            }

            // Farmland hydration + reversion
            if (top === "farmland") {
                const hydrated = isFarmlandHydrated(world, x, z, 4);

                if (!hydrated) {
                    if (world._revertAt[i2] === 0) {
                        world._revertAt[i2] = world._now + 3.0;
                    } else if (world._now >= world._revertAt[i2]) {
                        // Revert to dirt
                        world._data[world.idx(x, 1, z)] = "dirt";
                        world._revertAt[i2] = 0;
                        world._grassAt[i2] = world._now + (10 + Math.random() * 10);
                        // Remove crop
                        if (world.hasCrop(x, z)) world.clearCrop(x, z);
                        world._dirtyBlocks = true;
                    }
                } else {
                    // Hydrated -> clear timer
                    world._revertAt[i2] = 0;
                }
            }

            // Crop growth
            const crop = world.getCrop(x, z);
            if (crop) {
                // If block not farmland anymore -> remove crop
                if (top !== "farmland") {
                    world.clearCrop(x, z);
                    continue;
                }

                if (crop.stage < crop.maxStage && world._now >= crop.nextAt) {
                    crop.stage++;
                    crop.nextAt = world._now + crop.stageTime;
                    world._dirtyCrops = true;
                }
            }
        }
    }
}

function isFarmlandHydrated(world, x, z, dist) {
    // Search diamond area (Manhattan)
    for (let dx = -dist; dx <= dist; dx++) {
        const rem = dist - Math.abs(dx);
        for (let dz = -rem; dz <= rem; dz++) {
            const nx = x + dx;
            const nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= world.sizeX || nz >= world.sizeZ) continue;
            const id = world.getBlock(nx, 1, nz);
            if (id === "water" || id === "water_source") return true;
        }
    }
    return false;
}
