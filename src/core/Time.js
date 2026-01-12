export class Time {
    constructor() {
        this._last = 0;
        this._t = 0;
        this._raf = 0;
    }

    start(cb) {
        this._last = performance.now();
        const loop = (now) => {
            const dt = Math.min(0.05, (now - this._last) / 1000);
            this._last = now;
            this._t += dt;
            cb(dt, this._t);
            this._raf = requestAnimationFrame(loop);
        };
        this._raf = requestAnimationFrame(loop);
    }

    stop() {
        cancelAnimationFrame(this._raf);
    }
}
