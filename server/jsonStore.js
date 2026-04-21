const fs = require("fs");
const path = require("path");

const fsp = fs.promises;

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value));
}

async function ensureDirExists(targetPath) {
  const dir = path.dirname(targetPath);
  await fsp.mkdir(dir, { recursive: true });
}

async function writeFileSafely(filePath, data) {
  await ensureDirExists(filePath);
  const tmpPath = `${filePath}.tmp`;
  const payload = JSON.stringify(data, null, 2) + "\n";
  await fsp.writeFile(tmpPath, payload, "utf-8");
  await fsp.rename(tmpPath, filePath);
}

function createJsonStore({ filePath, defaultValue }) {
  if (!filePath) throw new Error("filePath requerido para createJsonStore");

  let cache = null;
  let loadingPromise = null;
  let writeChain = Promise.resolve();

  async function loadFromDisk() {
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      try {
        const raw = await fsp.readFile(filePath, "utf-8");
        cache = JSON.parse(raw);
      } catch (err) {
        if (err.code !== "ENOENT") {
          console.warn(`No se pudo leer ${filePath}, usando fallback:`, err.message || err);
        }
        cache = cloneDeep(defaultValue);
        try {
          await writeFileSafely(filePath, cache);
        } catch (writeErr) {
          console.error(`Error inicializando ${filePath}:`, writeErr.message || writeErr);
        }
      }
      return cache;
    })();

    try {
      await loadingPromise;
    } finally {
      loadingPromise = null;
    }
    return cache;
  }

  async function read() {
    await writeChain;
    if (cache === null) await loadFromDisk();
    return cloneDeep(cache);
  }

  async function write(nextValueOrUpdater) {
    writeChain = writeChain.then(async () => {
      if (cache === null) await loadFromDisk();

      const currentSnapshot = cloneDeep(cache);
      const nextValue =
        typeof nextValueOrUpdater === "function"
          ? await nextValueOrUpdater(currentSnapshot)
          : nextValueOrUpdater;

      if (nextValue === undefined) {
        throw new Error(`Updater para ${filePath} devolvió undefined`);
      }

      cache = nextValue;
      await writeFileSafely(filePath, cache);
      return cloneDeep(cache);
    });

    return writeChain.catch((err) => {
      console.error(`Error escribiendo ${filePath}:`, err.message || err);
      throw err;
    });
  }

  return { filePath, read, write };
}

module.exports = { createJsonStore };
