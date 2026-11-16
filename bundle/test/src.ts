// Where the code under test is, written the way bun names a module, so mock.module() replaces the module the code
// imports through its @core/@lib aliases and relative paths
import path from "path";

export const SRC = path.resolve(import.meta.dir, "../src").replaceAll("\\", "/") + "/";
