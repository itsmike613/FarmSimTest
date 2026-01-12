export class Hotbar {
    constructor(items) {
        this.items = items;
        this.container = null;
        this.slots = [];
    }

    mount(container) {
        this.container = container;
        container.innerHTML = "";
        this.slots = [];

        for (let i = 0; i < 9; i++) {
            const slot = document.createElement("div");
            slot.className = "hotbar-slot";
            slot.dataset.index = String(i);

            const img = document.createElement("img");
            img.alt = "";
            img.style.display = "none";

            const count = document.createElement("div");
            count.className = "hotbar-count";
            count.textContent = "";

            slot.appendChild(img);
            slot.appendChild(count);
            container.appendChild(slot);

            this.slots.push({ slot, img, count });
        }
    }

    render(hotbar) {
        const selected = hotbar.selected ?? 0; // supports either raw array or inventory object
        const stacks = Array.isArray(hotbar) ? hotbar : hotbar.hotbar;
        const sel = Array.isArray(hotbar) ? 0 : hotbar.selected;

        for (let i = 0; i < 9; i++) {
            const s = stacks[i];
            const el = this.slots[i];

            el.slot.classList.toggle("selected", i === sel);

            if (!s) {
                el.img.style.display = "none";
                el.img.src = "";
                el.count.textContent = "";
                continue;
            }

            const def = this.items[s.id];
            const icon = def?.icon;
            if (icon) {
                el.img.style.display = "block";
                el.img.src = `./assets/textures/${icon}`;
            } else {
                el.img.style.display = "none";
            }

            el.count.textContent = (def?.stack > 1 && s.count > 1) ? String(s.count) : "";
        }
    }
}
