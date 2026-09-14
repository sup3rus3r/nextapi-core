import fs from "node:fs";

// A regex-based field extractor for a Pydantic BaseModel class body - the
// same tier of complexity as mainPyMerge.mjs's findCollectionClassName
// regex, not a real AST parser (no Python-parsing dependency exists
// anywhere in this CLI, and introducing one is out of scope for what this
// needs to do). Deliberately lossy: a field it can't confidently parse is
// simply omitted from the result rather than guessed at, since a false
// negative here just falls through to sync/collectionSchemaMatch.mjs's
// "incompatible, here's why" report - the correct failure mode is "didn't
// notice a match," never "silently wrote to the wrong shape."

const CLASS_HEADER_RE = /^class\s+(\w+)\s*\(([^)]*)\)\s*:/gm;
const FIELD_LINE_RE = /^\s{4}(\w+)\s*:\s*([\w\[\].,\s|]+?)(?:\s*=.*)?$/;

/**
 * Finds the Pydantic model class in a models_mongo.py file - the sibling of
 * whatever findCollectionClassName finds (e.g. UserMongo next to
 * UserCollection): a class whose base includes "BaseModel" and whose name
 * does NOT end in "Collection".
 */
export function findPydanticModelSource(content) {
  content = content.replace(/\r\n/g, "\n");
  const headers = [...content.matchAll(CLASS_HEADER_RE)];
  for (let i = 0; i < headers.length; i++) {
    const [, className, bases] = headers[i];
    if (className.endsWith("Collection")) continue;
    if (!/\bBaseModel\b/.test(bases)) continue;

    const bodyStart = headers[i].index + headers[i][0].length;
    const bodyEnd = i + 1 < headers.length ? headers[i + 1].index : content.length;
    return { className, body: content.slice(bodyStart, bodyEnd) };
  }
  return null;
}

/**
 * Extracts a {fieldName: pythonTypeString} map from a Pydantic model's class
 * body. FIELD_LINE_RE only matches lines indented exactly 4 spaces with a
 * "name: type" shape, which already excludes model_config's own line (an
 * assignment with no type annotation) and anything inside its dict body
 * (indented 8+ spaces) - no separate config-block tracking needed.
 */
export function extractFields(classBody) {
  const fields = {};

  for (const line of classBody.replace(/\r\n/g, "\n").split("\n")) {
    const match = line.match(FIELD_LINE_RE);
    if (!match) continue;

    const [, name, rawType] = match;
    const pythonType = rawType.trim().replace(/^Optional\[(.+)\]$/, "$1");
    const optional = /^Optional\[/.test(rawType.trim()) || /=\s*(None|Field\(default=None)/.test(line);
    fields[name] = { pythonType, optional };
  }

  return fields;
}

/**
 * Reads a module's placed models_mongo.py (post-placement, under
 * backend/<pkg>/models_mongo.py) and returns its Pydantic model's fields, or
 * null if the file doesn't exist or no matching class is found.
 */
export function parseModuleModelFields(modelsPath) {
  if (!fs.existsSync(modelsPath)) return null;
  const content = fs.readFileSync(modelsPath, "utf8");
  const found = findPydanticModelSource(content);
  if (!found) return null;
  return extractFields(found.body);
}
