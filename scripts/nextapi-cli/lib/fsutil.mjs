import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function readJson(filePath, fallback = undefined) {
  if (!fs.existsSync(filePath)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function fileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

// Recursively copy a directory, returning the list of destination file paths written.
export function copyDirRecursive(srcDir, destDir) {
  const written = [];
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      written.push(...copyDirRecursive(srcPath, destPath));
    } else {
      fs.copyFileSync(srcPath, destPath);
      written.push(destPath);
    }
  }
  return written;
}

export function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
