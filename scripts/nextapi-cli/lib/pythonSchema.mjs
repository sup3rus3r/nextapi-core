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

// Matches both `class Foo(Bar):` and `class Foo:` (no base at all) - a
// class header is not required to have parentheses in Python, and requiring
// them here previously meant a class declared without an explicit base
// (rare, but real) silently failed to match at all.
const CLASS_HEADER_RE = /^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/gm;
const FIELD_LINE_RE = /^\s{4}(\w+)\s*:\s*([\w\[\].,\s|]+?)(?:\s*=.*)?$/;

/**
 * Finds the data-model class in a models_mongo.py file - the sibling of
 * whatever findCollectionClassName finds (e.g. UserMongo next to
 * UserCollection).
 *
 * Deliberately does NOT require the literal string "BaseModel" in the base
 * class list - a real published module inheriting from a shared/aliased
 * base (e.g. `class Foo(MongoBaseModel):`, or `BaseModel` imported under a
 * different name) would otherwise be silently rejected outright, which is
 * worse than the false positive this guards against: a module that isn't
 * even trying to be a Pydantic model wouldn't have FIELD_LINE_RE-shaped
 * lines in its body anyway, so requiring at least one such line is a more
 * reliable "is this actually a data model" signal than string-matching the
 * inheritance clause. Only real exclusion is by name - a class ending in
 * "Collection" is always the helper, never the model, by this codebase's
 * own established convention (see findCollectionClassName in
 * mainPyMerge.mjs, which already relies on the same naming rule).
 */
export function findPydanticModelSource(content) {
  content = content.replace(/\r\n/g, "\n");
  const headers = [...content.matchAll(CLASS_HEADER_RE)];
  for (let i = 0; i < headers.length; i++) {
    const [, className] = headers[i];
    if (className.endsWith("Collection")) continue;

    const bodyStart = headers[i].index + headers[i][0].length;
    const bodyEnd = i + 1 < headers.length ? headers[i + 1].index : content.length;
    const body = content.slice(bodyStart, bodyEnd);

    // Require at least one real field-shaped line - this is what actually
    // distinguishes a data model from an unrelated helper/exception/mixin
    // class that happens to live in the same file and isn't named
    // *Collection (e.g. a custom ObjectId wrapper like PyObjectId above).
    const hasFieldLine = body.split("\n").some((line) => FIELD_LINE_RE.test(line));
    if (!hasFieldLine) continue;

    return { className, body };
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

const CREATE_METHOD_RE = /^\s{4}(?:async\s+)?def\s+create\s*\(/m;
const PARAM_RE = /^(\w+)\s*:\s*([\w\[\].,\s|]+?)(?:\s*=\s*(.*))?$/;

/**
 * A real, published module doesn't always model its document with a
 * Pydantic class - core's OWN real UserCollection (backend/models_mongo.py)
 * only ever takes/returns plain dicts too, and a module can legitimately be
 * written the same way: a single *Collection class with classmethods, no
 * separate schema layer at all (confirmed against a real published module
 * that does exactly this, matching the host's own style deliberately). For
 * a module shaped like that, the closest thing to a field list is its own
 * create() classmethod's parameter list - the keyword parameters (beyond
 * the leading cls/db) it accepts to build a new document, with a default
 * value marking a parameter optional the same way Optional[]/Field(...)
 * does for a Pydantic field.
 *
 * This is intentionally a fallback checked only when no Pydantic model was
 * found (see parseModuleModelFields) - a module that HAS a real Pydantic
 * model is still parsed from that, since it's the more precise, structured
 * source of truth when one exists.
 */
export function extractFieldsFromCreateSignature(content) {
  content = content.replace(/\r\n/g, "\n");
  const match = content.match(CREATE_METHOD_RE);
  if (!match) return null;

  // Find the matching close-paren by tracking depth char-by-char from the
  // open-paren onward - the signature spans multiple lines with nested
  // [...] in type annotations, so a line-based regex can't safely find
  // where the parameter list actually ends.
  const openParenIndex = content.indexOf("(", match.index);
  let depth = 0;
  let closeParenIndex = -1;
  for (let i = openParenIndex; i < content.length; i++) {
    if (content[i] === "(") depth++;
    else if (content[i] === ")") {
      depth--;
      if (depth === 0) {
        closeParenIndex = i;
        break;
      }
    }
  }
  if (closeParenIndex === -1) return null;

  const paramList = content.slice(openParenIndex + 1, closeParenIndex);
  // Split on top-level commas only - a comma inside a type annotation's
  // own [...] (e.g. "Dict[str, int]") must not split the parameter list.
  const params = [];
  let current = "";
  let bracketDepth = 0;
  for (const ch of paramList) {
    if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth--;
    if (ch === "," && bracketDepth === 0) {
      params.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) params.push(current);

  const fields = {};
  for (const rawParam of params) {
    const trimmed = rawParam.trim().replace(/\n/g, " ").replace(/\s+/g, " ");
    if (!trimmed || trimmed === "cls" || trimmed === "db") continue;
    const paramMatch = trimmed.match(PARAM_RE);
    if (!paramMatch) continue; // an untyped param (rare, and unusable as a field spec) - skip rather than guess

    const [, name, rawType, defaultValue] = paramMatch;
    const pythonType = rawType.trim().replace(/^Optional\[(.+)\]$/, "$1");
    const optional = /^Optional\[/.test(rawType.trim()) || defaultValue !== undefined;
    fields[name] = { pythonType, optional };
  }

  return Object.keys(fields).length > 0 ? fields : null;
}

/**
 * Reads a module's placed models_mongo.py (post-placement, under
 * backend/<pkg>/models_mongo.py) and returns its document's fields, or null
 * if the file doesn't exist or no field source could be found. Tries a
 * Pydantic model first (the more precise, structured source when one
 * exists), then falls back to a dict-based *Collection class's own
 * create() signature - see extractFieldsFromCreateSignature for why that
 * fallback is necessary at all.
 */
export function parseModuleModelFields(modelsPath) {
  if (!fs.existsSync(modelsPath)) return null;
  const content = fs.readFileSync(modelsPath, "utf8");

  const found = findPydanticModelSource(content);
  if (found) return extractFields(found.body);

  return extractFieldsFromCreateSignature(content);
}
