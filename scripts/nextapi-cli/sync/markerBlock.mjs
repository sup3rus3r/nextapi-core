// Shared marker-block convention from docs §6: every generated region is bounded
// by `>>> nextapi:<key> (auto-generated, do not edit)` / `<<< nextapi:<key>`
// (comment syntax varies by language). `sync` only ever rewrites content strictly
// between its own markers, so a file can carry multiple independent marker pairs
// (validated with three in main.py) without disturbing surrounding hand-written code.
export function upsertMarkerBlock(content, key, newBodyLines, commentPrefix = "#") {
  const startMarker = `${commentPrefix} >>> nextapi:${key} (auto-generated, do not edit)`;
  const endMarker = `${commentPrefix} <<< nextapi:${key}`;
  const body = newBodyLines.join("\n");
  const block = `${startMarker}\n${body}\n${endMarker}`;

  const pattern = new RegExp(
    `${escapeRegex(startMarker)}[\\s\\S]*?${escapeRegex(endMarker)}`
  );

  if (pattern.test(content)) {
    return content.replace(pattern, block);
  }
  return null; // marker pair not found; caller must insert it fresh
}

export function hasMarkerBlock(content, key, commentPrefix = "#") {
  const startMarker = `${commentPrefix} >>> nextapi:${key} (auto-generated, do not edit)`;
  return content.includes(startMarker);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
