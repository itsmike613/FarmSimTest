// Stub: reserve for future NPCs / items-on-ground / animals etc.
export class EntitySystem {
    constructor() {
        this.entities = [];
    }
    add(entity) { this.entities.push(entity); }
    update(dt) {
        for (const e of this.entities) e.update?.(dt);
    }
}
