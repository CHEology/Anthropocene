export function createPrng(seed) {
    let state = seed >>> 0;
    if (state === 0) {
        state = 0x9e3779b9;
    }
    return {
        next() {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            return (state >>> 0) / 0x100000000;
        },
        nextInt(min, max) {
            return Math.floor(this.next() * (max - min + 1)) + min;
        },
        pick(items) {
            return items[this.nextInt(0, items.length - 1)];
        },
    };
}
