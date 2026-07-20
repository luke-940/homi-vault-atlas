import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export const insideOrEqual = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

export async function resolvePathThroughExistingAncestor(value) {
  let cursor = path.resolve(value);
  const suffix = [];
  while (true) {
    let exists = false;
    try {
      await lstat(cursor);
      exists = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (exists) {
      const resolved = await realpath(cursor);
      return path.join(resolved, ...suffix);
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`Path boundary blocked: no existing ancestor for ${value}.`);
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
}
