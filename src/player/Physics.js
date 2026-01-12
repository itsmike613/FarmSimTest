import * as THREE from "../vendor/three.module.js";

export class Physics {
    constructor(world) {
        this.world = world;
        this.onGround = false;

        // Player AABB (Minecraft-ish)
        this.half = new THREE.Vector3(0.3, 0.9, 0.3);
        this.stepHeight = 0.6;
    }

    moveAABB(pos, vel, dt) {
        const p = pos.clone();
        const v = vel.clone();

        this.onGround = false;

        // Try step if horizontal movement collides
        const desired = p.clone().addScaledVector(v, dt);

        // Move axis-by-axis for stable collisions
        const moved = this._moveAxis(p, v, dt, "x");
        this._moveAxis(moved.p, moved.v, dt, "z");
        const afterHoriz = { p: moved.p, v: moved.v };

        // If horizontal blocked, try step-up
        if (this._horizBlocked(pos, desired)) {
            const stepPos = pos.clone();
            stepPos.y += this.stepHeight;

            if (!this._collides(stepPos)) {
                // try move at stepped height
                const sp = stepPos.clone();
                const sv = v.clone();
                const a = this._moveAxis(sp, sv, dt, "x");
                this._moveAxis(a.p, a.v, dt, "z");

                // then fall down
                const b = this._moveAxis(a.p, a.v, dt, "y");
                return { position: b.p, velocity: b.v };
            }
        }

        // Vertical move
        const res = this._moveAxis(afterHoriz.p, afterHoriz.v, dt, "y");
        return { position: res.p, velocity: res.v };
    }

    _moveAxis(p, v, dt, axis) {
        p[axis] += v[axis] * dt;

        if (!this._collides(p)) return { p, v };

        // Resolve collision by backing out in small increments
        const sign = Math.sign(v[axis]) || 1;
        const step = 0.02 * sign;

        for (let i = 0; i < 60; i++) {
            p[axis] -= step;
            if (!this._collides(p)) break;
        }

        // Stop velocity on that axis
        v[axis] = 0;

        if (axis === "y" && sign < 0) {
            this.onGround = true;
        }

        return { p, v };
    }

    _horizBlocked(from, to) {
        // Check if moving in XZ causes collision (ignore Y)
        const test = from.clone();
        test.x = to.x;
        if (this._collides(test)) return true;
        test.x = from.x;
        test.z = to.z;
        if (this._collides(test)) return true;
        test.x = to.x;
        if (this._collides(test)) return true;
        return false;
    }

    _collides(centerPos) {
        // Player AABB corners -> check overlapped blocks (solid)
        const minX = centerPos.x - this.half.x;
        const maxX = centerPos.x + this.half.x;
        const minY = centerPos.y - this.half.y;
        const maxY = centerPos.y + this.half.y;
        const minZ = centerPos.z - this.half.z;
        const maxZ = centerPos.z + this.half.z;

        const x0 = Math.floor(minX);
        const x1 = Math.floor(maxX);
        const y0 = Math.floor(minY);
        const y1 = Math.floor(maxY);
        const z0 = Math.floor(minZ);
        const z1 = Math.floor(maxZ);

        for (let x = x0; x <= x1; x++) {
            for (let y = y0; y <= y1; y++) {
                for (let z = z0; z <= z1; z++) {
                    if (this.world.isSolidAt(x, y, z)) return true;
                }
            }
        }
        return false;
    }
}
