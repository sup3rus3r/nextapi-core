import fs from "node:fs";
import { MongoClient } from "mongodb";
import { BACKEND_ENV_PATH } from "./paths.mjs";

/**
 * Extracts a single KEY's raw value from a dotenv-style file, or null if the
 * file doesn't exist or the key isn't set. Deliberately not a full .env
 * parser (no quoting/escaping/multiline support) - mirrors envMerge.mjs's
 * own parseEnvKeys in scope, just returning the value instead of only the
 * key. Last-write-wins if a key appears twice, matching how dotenv/
 * python-dotenv itself resolves duplicates.
 */
export function readEnvValue(envPath, key) {
  if (!fs.existsSync(envPath)) return null;
  const content = fs.readFileSync(envPath, "utf8");
  let value = null;
  const re = new RegExp(`^\\s*${key}\\s*=(.*)$`);
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(re);
    if (match) value = match[1].trim().replace(/^["']|["']$/g, "");
  }
  return value || null;
}

/**
 * Best-effort read of the host's own Mongo connection settings straight out
 * of backend/.env - the same two vars backend/database_mongo.py itself reads
 * via os.getenv, with the same fallback defaults, so a host that never
 * bothered to override them in .env is still sampled correctly rather than
 * treated as unreachable.
 */
export function readMongoConnectionInfo() {
  const uri = readEnvValue(BACKEND_ENV_PATH, "MONGO_URI") ?? "mongodb://localhost:27017";
  const dbName = readEnvValue(BACKEND_ENV_PATH, "MONGO_DB_NAME") ?? "learning_scheduler";
  return { uri, dbName };
}

/**
 * Connects to the host's real MongoDB, counts how many documents in
 * `collectionName` are MISSING each field in `fieldNames`, and returns
 * { totalCount, missingCounts: { [field]: number } } - or null if Mongo
 * isn't reachable, or the collection has zero documents (nothing meaningful
 * to sample; a brand-new host DB should never look like a "demote
 * everything" prompt-storm).
 *
 * FAILS SOFT, ALWAYS: this reaches outside the CLI's own process into a live
 * database the CLI has never previously touched, for a feature that is
 * explicitly a check layered on top of the existing declared-schema
 * comparison (mirrors sync/devServerReload.mjs's own "reach outside the
 * process, fail soft, never throw" - sync must remain fully usable when
 * Mongo is down, unreachable, auth-walled, or simply not yet running for
 * reasons that have nothing to do with this feature). A short
 * serverSelectionTimeoutMS keeps a down/unreachable Mongo from hanging the
 * whole sync run.
 */
export async function sampleFieldPresence(collectionName, fieldNames) {
  if (fieldNames.length === 0) return null;
  const { uri, dbName } = readMongoConnectionInfo();

  let client;
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
    await client.connect();
    const collection = client.db(dbName).collection(collectionName);

    const totalCount = await collection.estimatedDocumentCount();
    if (totalCount === 0) return null;

    const missingCounts = {};
    for (const field of fieldNames) {
      missingCounts[field] = await collection.countDocuments({ [field]: { $exists: false } });
    }
    return { totalCount, missingCounts };
  } catch {
    return null; // unreachable/auth error/etc - degrade silently, exactly like devServerReload.mjs
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // already closed/never opened - nothing to do
      }
    }
  }
}
