import * as THREE from "../vendor/three.module.js";

export class TextureBank {
    constructor(basePath) {
        this.basePath = basePath;

        this._cache = new Map();
        this._ready = false;

        // Kick off a tiny preflight; textures load on demand anyway.
        this._promise = Promise.resolve().then(() => { this._ready = true; });
    }

    async ready() {
        return this._promise;
    }

    blockTexture(blockId, texDef) {
        // Returns { all } or {top,bottom,side} with fallback generation.
        if (!texDef) return { all: this._genPixelTex("#ff00ff") };

        if (texDef.all) {
            return { all: this._getOrLoad(`block:${blockId}:all`, texDef.all, this._fallbackColor(blockId)) };
        }

        return {
            top: this._getOrLoad(`block:${blockId}:top`, texDef.top, this._fallbackColor(blockId)),
            bottom: this._getOrLoad(`block:${blockId}:bottom`, texDef.bottom, this._fallbackColor("dirt")),
            side: this._getOrLoad(`block:${blockId}:side`, texDef.side, this._fallbackColor(blockId)),
        };
    }

    cropTexture(cropId, fileName) {
        return this._getOrLoad(`crop:${cropId}:${fileName}`, fileName, "#66ff66");
    }

    _getOrLoad(key, fileName, fallbackColor) {
        if (this._cache.has(key)) return this._cache.get(key);

        const tex = this._genPixelTex(fallbackColor); // placeholder immediately
        this._cache.set(key, tex);

        // Try load image; if missing, keep generated texture
        const loader = new THREE.TextureLoader();
        loader.load(
            `${this.basePath}${fileName}`,
            (loaded) => {
                loaded.magFilter = THREE.NearestFilter;
                loaded.minFilter = THREE.NearestFilter;
                loaded.colorSpace = THREE.SRGBColorSpace;
                this._cache.set(key, loaded);
            },
            undefined,
            () => {
                // missing file -> keep fallback
            }
        );

        return tex;
    }

    _genPixelTex(color) {
        const c = document.createElement("canvas");
        c.width = 16; c.height = 16;
        const ctx = c.getContext("2d");
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 16, 16);

        // Add tiny noise for “pixel” look
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = "rgba(0,0,0,0.08)";
            ctx.fillRect((Math.random() * 16) | 0, (Math.random() * 16) | 0, 1, 1);
        }

        const tex = new THREE.CanvasTexture(c);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    _fallbackColor(id) {
        switch (id) {
            case "subsoil": return "#5a3b2a";
            case "dirt": return "#7a4f35";
            case "grass": return "#4caf50";
            case "farmland": return "#6b3f2b";
            case "water":
            case "water_source": return "#3b7dff";
            default: return "#cccccc";
        }
    }
}
