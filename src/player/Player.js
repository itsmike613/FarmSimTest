import * as THREE from "../vendor/three.module.js";
import { Controls } from "./Controls.js";
import { Physics } from "./Physics.js";

export class Player {
    constructor({ camera, domElement, world, items, ui }) {
        this.camera = camera;
        this.domElement = domElement;
        this.world = world;
        this.items = items;
        this.ui = ui;

        this.controls = new Controls(domElement, camera);
        this.physics = new Physics(world);

        // Simple inventory (hotbar only)
        this.inventory = new HotbarInventory(items, ui);

        // Spawn loadout
        this.inventory.setSlot(0, { id: "bucket_empty", count: 1 });
        this.inventory.setSlot(1, { id: "hoe_wood", count: 1 });
        this.inventory.setSlot(2, { id: "shovel_wood", count: 1 });
        this.inventory.setSlot(3, { id: "seeds_wheat", count: 5 });
        // rest empty
        this.inventory.selectSlot(0);

        // Spawn position (center-ish, above ground)
        this.position = new THREE.Vector3(world.sizeX / 2 + 0.5, 2.2, world.sizeZ / 2 + 0.5);
        this.velocity = new THREE.Vector3(0, 0, 0);

        this.camera.position.copy(this.position);
    }

    update(dt) {
        this.controls.update(dt);

        // Movement settings (Minecraft-ish)
        const walk = 4.3;
        const sprint = 6.2;
        const speed = this.controls.sprint ? sprint : walk;

        // Build wish direction from camera yaw (controls stores yaw)
        const wish = this.controls.getWishDir(); // Vector3 xz normalized
        const accel = 28;

        // Horizontal accel
        this.velocity.x += wish.x * accel * dt;
        this.velocity.z += wish.z * accel * dt;

        // Clamp horizontal speed
        const h = Math.hypot(this.velocity.x, this.velocity.z);
        if (h > speed) {
            const k = speed / h;
            this.velocity.x *= k;
            this.velocity.z *= k;
        }

        // Friction
        const friction = this.physics.onGround ? 12 : 2;
        this.velocity.x -= this.velocity.x * friction * dt;
        this.velocity.z -= this.velocity.z * friction * dt;

        // Gravity
        this.velocity.y -= 20 * dt;

        // Jump
        if (this.controls.jumpPressed && this.physics.onGround) {
            this.velocity.y = 8.0;
        }

        // Move + collide (AABB)
        const res = this.physics.moveAABB(this.position, this.velocity, dt);
        this.position.copy(res.position);
        this.velocity.copy(res.velocity);

        this.camera.position.copy(this.position);
        this.camera.quaternion.copy(this.controls.getCameraQuat());
    }

    isNearBlockCenter(x, y, z, dist) {
        const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
        const dx = this.position.x - cx;
        const dy = this.position.y - cy;
        const dz = this.position.z - cz;
        return (dx * dx + dy * dy + dz * dz) <= dist * dist;
    }
}

class HotbarInventory {
    constructor(items, ui) {
        this.items = items;
        this.ui = ui;

        this.hotbar = new Array(9).fill(null);
        this.selected = 0;
    }

    setSlot(i, stack) {
        this.hotbar[i] = stack ? { ...stack } : null;
    }

    selectSlot(i) {
        this.selected = Math.max(0, Math.min(8, i));
    }

    scrollSlot(dir) {
        // dir: 1 or -1 from wheel
        this.selected = (this.selected + (dir > 0 ? 1 : -1) + 9) % 9;
    }

    getSelected() {
        return this.hotbar[this.selected];
    }

    consumeSelected(n) {
        const s = this.getSelected();
        if (!s || s.count < n) return false;
        s.count -= n;
        if (s.count <= 0) this.hotbar[this.selected] = null;
        return true;
    }

    replaceSelected(newId, newCount) {
        this.hotbar[this.selected] = { id: newId, count: newCount };
    }

    addItem(id, count) {
        const def = this.items[id];
        if (!def) return false;

        // Try stack into existing
        if (def.stack > 1) {
            for (let i = 0; i < 9; i++) {
                const s = this.hotbar[i];
                if (s && s.id === id && s.count < def.stack) {
                    const add = Math.min(count, def.stack - s.count);
                    s.count += add;
                    count -= add;
                    if (count <= 0) return true;
                }
            }
        }

        // Place into empty slot(s)
        for (let i = 0; i < 9; i++) {
            if (!this.hotbar[i]) {
                const put = Math.min(count, def.stack);
                this.hotbar[i] = { id, count: put };
                count -= put;
                if (count <= 0) return true;
            }
        }
        return false;
    }
}
