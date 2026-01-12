import * as THREE from "../vendor/three.module.js";
import { TextureBank } from "../utils/Textures.js";
import { BlockMesher } from "./meshes/BlockMesher.js";
import { CropMesher } from "./meshes/CropMesher.js";

export class Renderer {
    constructor({ canvas, world, blocks, crops }) {
        this.canvas = canvas;
        this.world = world;
        this.blocks = blocks;
        this.crops = crops;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x8fb6ff);

        this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 300);
        this.camera.position.set(world.sizeX / 2, 2.6, world.sizeZ / 2);

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

        // Basic lights
        const sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.position.set(50, 80, 30);
        this.scene.add(sun);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));

        // Texture bank (loads local textures if present; otherwise generated)
        this.textures = new TextureBank("./assets/textures/");

        // Meshers
        this.blockMesher = new BlockMesher({
            scene: this.scene,
            world: this.world,
            blocks: this.blocks,
            textures: this.textures,
        });

        this.cropMesher = new CropMesher({
            scene: this.scene,
            world: this.world,
            crops: this.crops,
            textures: this.textures,
            camera: this.camera,
        });

        // Target outline
        this._outline = this._makeOutline();
        this.scene.add(this._outline);
    }

    async buildStatic() {
        await this.textures.ready();
        this.blockMesher.buildBottomLayer();
    }

    rebuildDynamic() {
        this.blockMesher.buildTopLayerDynamic();
    }

    rebuildCrops() {
        this.cropMesher.rebuild();
    }

    resize() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    render() {
        // Make crops face camera (billboard)
        this.cropMesher.updateBillboards();
        this.renderer.render(this.scene, this.camera);
    }

    setTargetOutline(hit) {
        if (!hit) {
            this._outline.visible = false;
            return;
        }
        this._outline.visible = true;
        this._outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    }

    _makeOutline() {
        const geom = new THREE.BoxGeometry(1.02, 1.02, 1.02);
        const edges = new THREE.EdgesGeometry(geom);
        const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
        const lines = new THREE.LineSegments(edges, mat);
        lines.visible = false;
        return lines;
    }
}
