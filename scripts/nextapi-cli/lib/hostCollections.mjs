// A small, explicit, hand-maintained registry of the host app's OWN Mongo
// collections - not derived by introspecting backend/models_mongo.py at
// sync time, since that file can itself be edited by the project owner. A
// static, versioned list of what core ships by default is simpler and more
// predictable than trying to infer it live.
//
// This is the piece that lets sync/collectionSchemaMatch.mjs recognize when
// a module's declared backend.collection ("users") corresponds to a REAL
// collection the host already has, so it can offer to link the module to
// the real data instead of letting it silently create a disconnected
// duplicate (module_<scope>_<id>__users) - the bug this whole mechanism
// exists to close.
//
// Add a new entry here whenever core ships another collection worth
// exposing to modules this way (e.g. api_clients) - no other file needs to
// change to support a new host collection, only this map.
export const HOST_COLLECTIONS = {
  users: {
    // The real classmethod-holding class in the host's own models_mongo.py.
    collectionClass: "UserCollection",
    // Relative to BACKEND_DIR - the host's own file, never a module's copy.
    modelsPath: "models_mongo.py",
    // Mirrors backend/models_mongo.py's real UserMongo field list exactly.
    // Keep these in sync by hand if that model ever changes - there is no
    // live introspection here, see the module docstring above for why.
    fields: {
      id: { pythonType: "PyObjectId", optional: true },
      username: { pythonType: "str" },
      email: { pythonType: "str" },
      role: { pythonType: "str" },
      hashed_password: { pythonType: "str" },
      created_at: { pythonType: "datetime", optional: true },
    },
    // Which UserCollection classmethods a linked module may call, keyed by
    // the conceptual operation name a module's own generated code would
    // reach for. Used to drive the DB-call rewrite in
    // collectionSchemaMatch.mjs's linkToHostCollection, not just the field
    // comparison above.
    operations: {
      list: "list_all",
      get_by_id: "find_by_id",
      get_by_username: "find_by_username",
      get_by_email: "find_by_email",
      create: "create",
      update_role: "update_role",
      delete: "delete",
    },
  },
};

export function findHostCollection(declaredName) {
  if (!declaredName) return null;
  return HOST_COLLECTIONS[declaredName] ?? null;
}
