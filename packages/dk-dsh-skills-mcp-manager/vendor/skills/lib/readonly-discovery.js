import { promises as fs } from "node:fs";
import { resolve, join, relative, sep } from "node:path";
const MAX_DEPTH = 6;
const MAX_DIRECTORIES = 2e3;
const MAX_ENTRIES = 2e4;
const identity = (path) => process.platform === "win32" ? path.toLowerCase() : path;
function validDiscoveryName(name) {
  return typeof name === "string" && (name === "." || name.length <= 1024 && name.split("/").every(
    (part) => part.length > 0 && part.length <= 255 && !part.startsWith(".") && !/[\\:*?"<>|\0]/.test(part) && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part)
  ));
}
const absent = error => ["ENOENT", "ENOTDIR", "FS_NOT_FOUND", "FS_NOT_DIRECTORY"].includes(error.code);
// Shared by the management inventory and runtime provider; never authorizes writes.
async function discoverReadonlyEntries(root, { fileSystem, signal } = {}) {
  const rootPath = resolve(root);
  const queue = [{ path: rootPath, depth: 0, ancestors: new Set() }];
  const byName = new Map();
  const directories = [];
  let entries = 0;
  let exists = false;
  let truncated = false;
  let complete = true;
  const checkedStat = async path => {
    if (fileSystem && !await fileSystem.stat(await fileSystem.resolve(path), signal))
      throw Object.assign(new Error("Path not found"), { code: "FS_NOT_FOUND" });
    return fs.lstat(path);
  };
  const failed = error => {
    signal?.throwIfAborted();
    if (absent(error)) return;
    if (fileSystem) throw error; // Never turn a sandbox denial into host filesystem fallback.
    complete = false;
  };
  for (let cursor = 0; cursor < queue.length; cursor++) {
    signal?.throwIfAborted();
    const current = queue[cursor];
    directories.push(current.path); // Include absent and empty roots so creation is watched.
    try {
      const listing = fileSystem
        ? await fileSystem.listDir(await fileSystem.resolve(current.path))
        : await fs.readdir(current.path, { withFileTypes: true });
      if (current.depth === 0) exists = true;
      const realDirectory = await fs.realpath(current.path);
      const key = identity(realDirectory);
      if (current.ancestors.has(key)) continue;
      const ancestors = new Set(current.ancestors).add(key);
      const docPath = join(current.path, "SKILL.md");
      let docStat;
      try { docStat = await checkedStat(docPath); }
      catch (error) { failed(error); }
      const bundle = docStat?.isFile() && !docStat.isSymbolicLink();
      const add = async (name, kind, path, entryPath) => {
        if (!validDiscoveryName(name)) return;
        const realDocPath = await fs.realpath(path);
        const realEntryPath = kind === "bundle" ? realDirectory : realDocPath;
        if (kind === "flat" && byName.has(name)) return;
        byName.set(name, { name, kind, docPath: path, entryPath, realDocPath, realEntryPath,
          linked: identity(resolve(entryPath)) !== identity(realEntryPath) });
      };
      if (bundle) {
        await add(relative(rootPath, current.path).split(sep).join("/") || ".", "bundle", docPath, current.path);
        continue; // A bundle owns its references, scripts and other resources.
      }
      for (const item of listing.sort((a, b) => a.name.localeCompare(b.name))) {
        signal?.throwIfAborted();
        if (++entries > MAX_ENTRIES) { truncated = true; break; }
        const path = join(current.path, item.name);
        const name = relative(rootPath, path).split(sep).join("/");
        if (!validDiscoveryName(name) || identity(item.name) === "node_modules") continue;
        try {
          const stat = await checkedStat(path);
          if (stat.isDirectory() || stat.isSymbolicLink()) {
            if (stat.isSymbolicLink() && !(await fs.stat(path)).isDirectory()) continue;
            if (current.depth >= MAX_DEPTH || queue.length >= MAX_DIRECTORIES) { truncated = true; continue; }
            queue.push({ path, depth: current.depth + 1, ancestors });
          } else if (stat.isFile() && item.name.toLowerCase().endsWith(".md") && item.name.toLowerCase() !== "skill.md") {
            await add(name.slice(0, -3), "flat", path, path);
          }
        } catch (error) { failed(error); }
      }
      if (entries > MAX_ENTRIES) break;
    } catch (error) { failed(error); }
  }
  return { exists, entries: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)), directories, truncated, complete: complete && !truncated };
}
export { discoverReadonlyEntries, validDiscoveryName };
