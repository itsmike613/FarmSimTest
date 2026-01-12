import * as THREE from "../../vendor/three.module.js";

export class CropMesher {
    constructor({ scene, world, crops, textures, camera }) {
        this.scene = scene;
        this.world = world;
        this.crops = crops;
        this.textures = textures;
        this.camera = camera;

        this._group = new THREE.Group();
        this.scene.add(this._group);

        this._planes = [];
        this._geom = new THREE.PlaneGeometry(0.9, 0.9);
    }

    rebuild() {
        // Clear
        for (const p of this._planes) {
            this._group.remove(p);
            p.geometry.dispose();
            p.material.dispose();
        }
        this._planes = [];

        for (let x = 0; x < this.world.sizeX; x++) {
            for (let z = 0; z < this.world.sizeZ; z++) {
                const crop = this.world.getCrop(x, z);
                if (!crop) continue;

                const def = this.crops[crop.id];
                const texName = def.textures[crop.stage] ?? def.textures[def.textures.length - 1];
                const tex = this.textures.cropTexture(crop.id, texName);

                const mat = new THREE.MeshLambertMaterial({
                    map: tex,
                    transparent: true,
                    alphaTest: 0.3,
                });

                const plane = new THREE.Mesh(this._geom, mat);
                plane.position.set(x + 0.5, 1.1, z + 0.5);
                // Slight scale per stage if texture missing
                const s = 0.45 + 0.15 * crop.stage;
                plane.scale.setScalar(s);

                plane.userData.isCrop = true;
                plane.userData.cropXZ = { x, z };

                this._planes.push(plane);
                this._group.add(plane);
            }
        }
    }

    updateBillboards() {
        // Face camera on Y only
        for (const p of this._planes) {
            const dx = this.camera.position.x - p.position.x;
            const dz = this.camera.position.z - p.position.z;
            p.rotation.y = Math.atan2(dx, dz);
        }
    }
}
