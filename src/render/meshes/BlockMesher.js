import * as THREE from "../../vendor/three.module.js";

export class BlockMesher {
    constructor({ scene, world, blocks, textures }) {
        this.scene = scene;
        this.world = world;
        this.blocks = blocks;
        this.textures = textures;

        this._group = new THREE.Group();
        this.scene.add(this._group);

        this._staticBottom = null;
        this._dynamicTop = null;

        // Shared geometry for most cubes
        this._cube = new THREE.BoxGeometry(1, 1, 1);
    }

    buildBottomLayer() {
        if (this._staticBottom) {
            this._group.remove(this._staticBottom);
            this._staticBottom.geometry.dispose();
            this._staticBottom.material.dispose?.();
        }

        const mat = new THREE.MeshLambertMaterial({
            map: this.textures.blockTexture("subsoil", { all: "subsoil.png" }).all,
        });

        const mesh = new THREE.InstancedMesh(this._cube, mat, this.world.sizeX * this.world.sizeZ);
        mesh.frustumCulled = false;

        let i = 0;
        const m = new THREE.Matrix4();
        for (let x = 0; x < this.world.sizeX; x++) {
            for (let z = 0; z < this.world.sizeZ; z++) {
                m.makeTranslation(x + 0.5, 0 + 0.5, z + 0.5);
                mesh.setMatrixAt(i++, m);
            }
        }
        mesh.instanceMatrix.needsUpdate = true;

        this._staticBottom = mesh;
        this._group.add(mesh);
    }

    buildTopLayerDynamic() {
        if (this._dynamicTop) {
            this._group.remove(this._dynamicTop);
            this._disposeGroup(this._dynamicTop);
        }

        const g = new THREE.Group();

        // We build separate instanced meshes by block type, except "grass" which uses a multi-material cube.
        // Top layer: y=1
        const counts = new Map();
        for (let x = 0; x < this.world.sizeX; x++) {
            for (let z = 0; z < this.world.sizeZ; z++) {
                const id = this.world.getBlock(x, 1, z);
                if (id === "air") continue;
                counts.set(id, (counts.get(id) || 0) + 1);
            }
        }

        for (const [id, count] of counts.entries()) {
            const def = this.blocks[id];
            if (!def) continue;

            let mesh;
            if (id === "grass") {
                mesh = this._makeGrassInstanced(count);
            } else if (id === "water" || id === "water_source") {
                mesh = this._makeSingleTextureInstanced(id, def, count, { transparent: true, opacity: 0.85 });
            } else {
                mesh = this._makeSingleTextureInstanced(id, def, count);
            }

            // Store id for targeting
            mesh.userData.blockId = id;
            mesh.userData.instanceToPos = []; // array of {x,y,z} by instanceId

            let i = 0;
            const m = new THREE.Matrix4();
            for (let x = 0; x < this.world.sizeX; x++) {
                for (let z = 0; z < this.world.sizeZ; z++) {
                    const bid = this.world.getBlock(x, 1, z);
                    if (bid !== id) continue;

                    m.makeTranslation(x + 0.5, 1 + 0.5, z + 0.5);
                    mesh.setMatrixAt(i, m);
                    mesh.userData.instanceToPos[i] = { x, y: 1, z };
                    i++;
                }
            }
            mesh.instanceMatrix.needsUpdate = true;
            mesh.frustumCulled = false;

            g.add(mesh);
        }

        this._dynamicTop = g;
        this._group.add(g);
    }

    _makeSingleTextureInstanced(id, def, count, extraMatProps = {}) {
        const tex = this.textures.blockTexture(id, def.textures).all;
        const mat = new THREE.MeshLambertMaterial({
            map: tex,
            ...extraMatProps
        });
        return new THREE.InstancedMesh(this._cube, mat, count);
    }

    _makeGrassInstanced(count) {
        // Multi-material box: top grass, bottom dirt, sides dirt
        const tex = this.textures.blockTexture("grass", this.blocks.grass.textures);
        const mats = [
            new THREE.MeshLambertMaterial({ map: tex.side }),   // +X
            new THREE.MeshLambertMaterial({ map: tex.side }),   // -X
            new THREE.MeshLambertMaterial({ map: tex.top }),    // +Y
            new THREE.MeshLambertMaterial({ map: tex.bottom }), // -Y
            new THREE.MeshLambertMaterial({ map: tex.side }),   // +Z
            new THREE.MeshLambertMaterial({ map: tex.side }),   // -Z
        ];
        return new THREE.InstancedMesh(this._cube, mats, count);
    }

    _disposeGroup(group) {
        group.traverse((obj) => {
            if (obj.isMesh || obj.isInstancedMesh) {
                obj.geometry?.dispose?.();
                if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
                else obj.material?.dispose?.();
            }
        });
    }
}
