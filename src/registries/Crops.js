export function makeCropRegistry() {
    return {
        wheat: {
            id: "wheat",
            // 4 stages total: 0..3
            stages: 4,
            // Total growth time 45s; each stage ~15s
            stageTime: 15,
            // Optional texture files; fallback if missing
            textures: ["crop_wheat_0.png", "crop_wheat_1.png", "crop_wheat_2.png", "crop_wheat_3.png"],
        }
    };
}
