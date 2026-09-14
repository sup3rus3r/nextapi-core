import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { listFilesRecursive } from "./fsutil.mjs";

// Minimal USTAR (POSIX tar) writer/reader, gzip'd via Node's built-in zlib.
// No third-party archiver dependency — matches this CLI's existing
// zero-build-step, minimal-dependency convention (see lib/manifest.mjs's
// hand-rolled semver engine for the same rationale). Only what this CLI
// needs: regular files, no symlinks/permissions/ownership preservation.

const BLOCK_SIZE = 512;

function padBuffer(buf, blockSize = BLOCK_SIZE) {
  const remainder = buf.length % blockSize;
  if (remainder === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(blockSize - remainder)]);
}

function writeOctal(value, length) {
  return value.toString(8).padStart(length - 1, "0") + "\0";
}

function checksum(header) {
  let sum = 0;
  for (let i = 0; i < header.length; i++) sum += header[i];
  return sum;
}

function buildHeader(relPath, size) {
  const header = Buffer.alloc(BLOCK_SIZE);
  header.write(relPath.slice(0, 100), 0, "utf8");
  header.write(writeOctal(0o644, 8), 100, "utf8"); // mode
  header.write(writeOctal(0, 8), 108, "utf8"); // uid
  header.write(writeOctal(0, 8), 116, "utf8"); // gid
  header.write(writeOctal(size, 12), 124, "utf8"); // size
  header.write(writeOctal(0, 12), 136, "utf8"); // mtime
  header.write("        ", 148, "utf8"); // checksum placeholder (8 spaces)
  header.write("0", 156, "utf8"); // typeflag: regular file
  header.write("ustar\0", 257, "utf8"); // magic
  header.write("00", 263, "utf8"); // version

  const sum = checksum(header);
  header.write(writeOctal(sum, 8), 148, "utf8");
  return header;
}

/**
 * Packs every file under srcDir into a gzip'd tar buffer, with paths in the
 * archive relative to srcDir (using forward slashes regardless of platform,
 * per the tar spec).
 */
export function createTarball(srcDir) {
  const files = listFilesRecursive(srcDir);
  const chunks = [];

  for (const filePath of files) {
    const relPath = path.relative(srcDir, filePath).split(path.sep).join("/");
    const content = fs.readFileSync(filePath);
    chunks.push(buildHeader(relPath, content.length));
    chunks.push(padBuffer(content));
  }

  chunks.push(Buffer.alloc(BLOCK_SIZE * 2)); // end-of-archive marker
  const tar = Buffer.concat(chunks);
  return zlib.gzipSync(tar);
}

/**
 * Extracts a gzip'd tar buffer into destDir, creating directories as needed.
 * Rejects any entry whose relative path would escape destDir (path
 * traversal via "../" in a maliciously-crafted archive from the registry).
 */
export function extractTarball(gzipBuffer, destDir) {
  const tar = zlib.gunzipSync(gzipBuffer);
  const written = [];
  let offset = 0;

  while (offset + BLOCK_SIZE <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK_SIZE);
    offset += BLOCK_SIZE;

    if (header.every((byte) => byte === 0)) break; // end-of-archive marker

    const nameRaw = header.toString("utf8", 0, 100);
    const name = nameRaw.replace(/\0.*$/s, "");
    if (!name) break;

    const sizeRaw = header.toString("utf8", 124, 136).replace(/\0.*$/s, "").trim();
    const size = parseInt(sizeRaw, 8) || 0;

    const destPath = path.join(destDir, name);
    const resolvedDest = path.resolve(destPath);
    const resolvedRoot = path.resolve(destDir);
    if (!resolvedDest.startsWith(resolvedRoot + path.sep) && resolvedDest !== resolvedRoot) {
      throw new Error(`Refusing to extract '${name}': escapes destination directory.`);
    }

    const content = tar.subarray(offset, offset + size);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content);
    written.push(destPath);

    offset += Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
  }

  return written;
}
