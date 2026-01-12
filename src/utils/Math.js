export function randRange(a, b) {
    return a + Math.random() * (b - a);
}

export function manhattan2D(x1, z1, x2, z2) {
    return Math.abs(x1 - x2) + Math.abs(z1 - z2);
}
