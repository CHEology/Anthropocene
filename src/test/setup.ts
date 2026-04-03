import '@testing-library/jest-dom/vitest';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  value: ResizeObserverMock,
  writable: true,
});

if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ({
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      fill() {},
      stroke() {},
      strokeRect() {},
      clearRect() {},
      fillRect() {},
      createLinearGradient() {
        return { addColorStop() {} };
      },
      setTransform() {},
      arc() {},
      save() {},
      restore() {},
      fillText() {},
      setLineDash() {},
    }),
  });
}
