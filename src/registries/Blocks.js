export function makeBlockRegistry() {
    // Block IDs are strings for extensibility.
    return {
        air: {
            id: "air",
            solid: false,
            breakable: false,
            textures: null,
        },

        subsoil: {
            id: "subsoil",
            solid: true,
            breakable: false, // never break Y=0
            textures: { all: "subsoil.png" },
        },

        dirt: {
            id: "dirt",
            solid: true,
            breakable: true,
            textures: { all: "dirt.png" },
        },

        grass: {
            id: "grass",
            solid: true,
            breakable: true,
            // Minecraft-ish: top grass, bottom dirt, sides dirt (simple look)
            textures: { top: "grass_top.png", bottom: "dirt.png", side: "dirt.png" },
        },

        farmland: {
            id: "farmland",
            solid: true,
            breakable: true,
            textures: { all: "farmland.png" },
        },

        water_source: {
            id: "water_source",
            solid: true,
            breakable: false, // infinite indestructible source
            textures: { all: "water.png" },
        },

        water: {
            id: "water",
            solid: true,
            breakable: true,
            textures: { all: "water.png" },
        },
    };
}
