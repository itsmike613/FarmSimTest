import { Hotbar } from "./Hotbar.js";

export class UI {
    constructor({ items }) {
        this.items = items;
        this.hotbarUI = new Hotbar(items);
    }

    mount(container) {
        this.hotbarUI.mount(container);
    }

    setHotbar(hotbar) {
        this.hotbarUI.render(hotbar);
    }
}
