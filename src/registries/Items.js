import { manhattan2D } from "../utils/Math.js";

export function makeItemRegistry() {
    return {
        bucket_empty: {
            id: "bucket_empty",
            name: "Empty Bucket",
            icon: "bucket_empty.png",
            stack: 1,
            onUse: ({ player, world, hit }) => {
                // Fill from water source or pick up placed water
                if (hit.placeY !== 1 && hit.y !== 1) return false;

                if (hit.hitBlockId === "water_source") {
                    player.inventory.replaceSelected("bucket_water", 1);
                    return true;
                }
                if (hit.hitBlockId === "water") {
                    // Pick up placed water
                    world.setBlock(hit.x, hit.y, hit.z, "air");
                    player.inventory.replaceSelected("bucket_water", 1);
                    return true;
                }
                return false;
            }
        },

        bucket_water: {
            id: "bucket_water",
            name: "Water Bucket",
            icon: "bucket_water.png",
            stack: 1,
            onUse: ({ player, world, hit }) => {
                // Place a water block on top layer y=1:
                // - in an empty air cell at Y=1, OR
                // - onto dirt/grass/farmland by replacing it.
                // Use place position when aiming at a face; otherwise replace targeted.
                let tx = hit.placeX, ty = hit.placeY, tz = hit.placeZ;

                // Only allow placements at y=1
                if (ty !== 1) {
                    // If we are pointing at y=1 block, allow replacing it
                    if (hit.y === 1) {
                        tx = hit.x; ty = 1; tz = hit.z;
                    } else {
                        return false;
                    }
                }

                const cur = world.getBlock(tx, ty, tz);
                if (cur === "subsoil" || ty === 0) return false;
                if (cur === "water_source") return false;

                // If replacing farmland, remove crop
                if (cur === "farmland") world.clearCrop(tx, tz);

                // Place water (allowed on air or replacing dirt-ish)
                if (cur === "air" || cur === "dirt" || cur === "grass" || cur === "farmland") {
                    world.setBlock(tx, 1, tz, "water");
                    player.inventory.replaceSelected("bucket_empty", 1);
                    return true;
                }
                return false;
            }
        },

        hoe_wood: {
            id: "hoe_wood",
            name: "Wooden Hoe",
            icon: "hoe.png",
            stack: 1,
            onUse: ({ world, hit }) => {
                if (hit.y !== 1) return false;

                const id = world.getBlock(hit.x, hit.y, hit.z);
                if (id !== "dirt" && id !== "grass") return false;

                world.setBlock(hit.x, 1, hit.z, "farmland");
                // Hydration check happens in world rules each update; it will revert if needed.
                return true;
            }
        },

        shovel_wood: {
            id: "shovel_wood",
            name: "Wooden Shovel",
            icon: "shovel.png",
            stack: 1,
            // Shovel “use” does nothing (breaking handled by LMB)
        },

        seeds_wheat: {
            id: "seeds_wheat",
            name: "Wheat Seeds",
            icon: "seeds.png",
            stack: 64,
            onUse: ({ player, world, hit }) => {
                if (hit.y !== 1) return false;
                const id = world.getBlock(hit.x, 1, hit.z);
                if (id !== "farmland") return false;
                if (world.hasCrop(hit.x, hit.z)) return false;

                // Plant wheat
                if (!player.inventory.consumeSelected(1)) return false;
                world.plantCrop(hit.x, hit.z, "wheat");
                return true;
            }
        },

        dirt_item: {
            id: "dirt_item",
            name: "Dirt",
            icon: "dirt_item.png",
            stack: 64,
            onUse: ({ player, world, hit }) => {
                // Place dirt on empty Y=1 cell only
                const tx = hit.placeX, ty = hit.placeY, tz = hit.placeZ;
                if (ty !== 1) return false;

                const cur = world.getBlock(tx, 1, tz);
                if (cur !== "air") return false;

                if (!player.inventory.consumeSelected(1)) return false;
                world.setBlock(tx, 1, tz, "dirt");
                // world will regrow grass later (unless hoed)
                return true;
            }
        },

        wheat: {
            id: "wheat",
            name: "Wheat",
            icon: "wheat.png",
            stack: 64,
        },
    };
}
