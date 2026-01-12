import * as THREE from "../vendor/three.module.js";

export class Targeting {
    constructor({ camera, renderer, scene, world }) {
        this.camera = camera;
        this.renderer = renderer;
        this.scene = scene;
        this.world = world;

        this.ray = new THREE.Raycaster();
        this.ray.far = 5;
    }

    pickBlock(maxDist = 5) {
        const hit = this._cast(maxDist);
        if (!hit) return null;
        return { x: hit.x, y: hit.y, z: hit.z };
    }

    pickBlockOrFace(maxDist = 5) {
        const hit = this._cast(maxDist);
        if (!hit) return null;
        return hit;
    }

    _cast(maxDist) {
        this.ray.setFromCamera({ x: 0, y: 0 }, this.camera);
        this.ray.far = maxDist;

        const intersects = this.ray.intersectObjects(this.scene.children, true);

        for (const it of intersects) {
            const obj = it.object;

            // Crop plane (harvest by left click is handled elsewhere; right click uses block)
            if (obj.userData?.isCrop) continue;

            // Instanced block mesh
            if (obj.isInstancedMesh && Number.isInteger(it.instanceId)) {
                const instanceId = it.instanceId;
                const pos = obj.userData?.instanceToPos?.[instanceId];
                if (!pos) continue;

                const x = pos.x, y = pos.y, z = pos.z;

                // Face-based placement: step into adjacent cell along hit normal
                const n = it.face?.normal;
                let placeX = x, placeY = y, placeZ = z;
                if (n) {
                    // Transform normal by instance rotation (none here), so ok as-is
                    placeX = x + Math.round(n.x);
                    placeY = y + Math.round(n.y);
                    placeZ = z + Math.round(n.z);
                }

                const hitBlockId = this.world.getBlock(x, y, z);

                return { x, y, z, placeX, placeY, placeZ, hitBlockId };
            }
        }
        return null;
    }
}
