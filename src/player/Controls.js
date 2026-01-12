import * as THREE from "../vendor/three.module.js";

export class Controls {
    constructor(domElement, camera) {
        this.domElement = domElement;
        this.camera = camera;

        this._locked = false;

        this.yaw = 0;
        this.pitch = 0;

        this.keys = new Set();
        this.jumpPressed = false;
        this.sprint = false;

        this._wish = new THREE.Vector3();

        this._bind();
    }

    _bind() {
        document.addEventListener("pointerlockchange", () => {
            this._locked = (document.pointerLockElement === this.domElement);
        });

        window.addEventListener("keydown", (e) => {
            this.keys.add(e.code);
            if (e.code === "Space") this.jumpPressed = true;
            if (e.code === "ControlLeft" || e.code === "ControlRight") this.sprint = true;
        });

        window.addEventListener("keyup", (e) => {
            this.keys.delete(e.code);
            if (e.code === "Space") this.jumpPressed = false;
            if (e.code === "ControlLeft" || e.code === "ControlRight") this.sprint = false;
        });

        window.addEventListener("mousemove", (e) => {
            if (!this._locked) return;
            const sens = 0.0022;
            this.yaw -= e.movementX * sens;
            this.pitch -= e.movementY * sens;
            this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
        });
    }

    lock() {
        this.domElement.requestPointerLock();
    }

    isLocked() {
        return this._locked;
    }

    update() {
        // Build wish direction in XZ from WASD relative to yaw
        const f = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
        const r = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);

        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);

        // Forward is -Z in camera space; map to world
        const wx = (r * cos + f * sin);
        const wz = (r * -sin + f * cos);

        this._wish.set(wx, 0, wz);
        if (this._wish.lengthSq() > 0) this._wish.normalize();
    }

    getWishDir() {
        return this._wish;
    }

    getCameraQuat() {
        // yaw around Y, pitch around X
        const q = new THREE.Quaternion();
        q.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
        return q;
    }
}
