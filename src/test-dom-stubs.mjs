// Test-only, never published. Imported by test-jsx-loader.mjs so every `node --test` process gets it.
// jsdom has no DOMMatrixReadOnly, and xyflow's `useUpdateNodeInternals()` / viewport transform parsing
// reads `window.DOMMatrixReadOnly` (-> "TypeError: window.DOMMatrixReadOnly is not a constructor").
// Tests build their own `new JSDOM(...)`, so the stub is added where every window comes from: the
// `JSDOM.prototype.window` getter. An identity matrix is all the transform parsing needs.
import { createRequire } from "node:module";

class DOMMatrixReadOnlyStub {
	constructor(init) {
		this.a = 1;
		this.b = 0;
		this.c = 0;
		this.d = 1;
		this.e = 0;
		this.f = 0;
		this.m11 = 1;
		this.m12 = 0;
		this.m13 = 0;
		this.m14 = 0;
		this.m21 = 0;
		this.m22 = 1;
		this.m23 = 0;
		this.m24 = 0;
		this.m31 = 0;
		this.m32 = 0;
		this.m33 = 1;
		this.m34 = 0;
		this.m41 = 0;
		this.m42 = 0;
		this.m43 = 0;
		this.m44 = 1;
		this.is2D = true;
		this.isIdentity = true;
		void init;
	}
}

globalThis.DOMMatrixReadOnly ??= DOMMatrixReadOnlyStub;

try {
	const { JSDOM } = createRequire(import.meta.url)("jsdom");
	const desc = Object.getOwnPropertyDescriptor(JSDOM.prototype, "window");
	if (desc?.get && !desc.get.__w6wDomMatrixStub) {
		const orig = desc.get;
		const patched = function () {
			const win = orig.call(this);
			if (win && win.DOMMatrixReadOnly === undefined) win.DOMMatrixReadOnly = DOMMatrixReadOnlyStub;
			return win;
		};
		patched.__w6wDomMatrixStub = true;
		Object.defineProperty(JSDOM.prototype, "window", { ...desc, get: patched });
	}
} catch {
	// jsdom not installed for this package: nothing to patch.
}
