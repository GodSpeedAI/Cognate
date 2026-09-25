// Registers happy-dom globals before any test module evaluates @testing-library/react.
// `screen` binds to document.body at import time, and ES module imports are hoisted above ordinary
// module statements — so registration must live in a module imported *before* @testing-library, not
// in a `register()` call between imports (CG-UI-001, spec §25.2).
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

export { GlobalRegistrator };
