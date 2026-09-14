import { backendPackageNameForKey, collectionNameForKey, namespacedPathForKey } from "../lib/moduleId.mjs";

// Step 4 of docs §6: compute every route path and every backend package name
// this batch would claim, and abort before writing anything if two modules
// collide. Checks the NAMESPACED values (post scope-prefixing, docs §9.5.2),
// not the raw manifest-declared ones — two scoped modules both declaring
// /profile in their manifests do not actually collide once installed
// (@alice/profile-page lands at /alice/profile, @bob/profile-page at
// /bob/profile), so checking the raw declared path here would produce false
// positives for the exact case namespacing exists to allow. `order` entries
// are RESOLVED KEYS (see registryFetch.mjs) - a plain id for the ordinary
// case, or "id::version" for one of several coexisting shareable:false
// installs, which the *ForKey helpers already account for.
export function checkCollisions(order, manifests) {
  const routePaths = new Map(); // installed path -> resolved key
  const backendPackages = new Map(); // package name -> resolved key
  const collections = new Map(); // mongo collection name -> resolved key

  for (const key of order) {
    const manifest = manifests.get(key);

    for (const route of manifest.frontend?.routes ?? []) {
      const installPath = namespacedPathForKey(key, manifest, route.path);
      const existing = routePaths.get(installPath);
      if (existing && existing !== key) {
        throw new Error(
          `Route collision: both '${existing}' and '${key}' install to frontend route '${installPath}'.`
        );
      }
      routePaths.set(installPath, key);
    }

    const pkgName = backendPackageNameForKey(key, manifest);
    const existingPkg = backendPackages.get(pkgName);
    if (existingPkg && existingPkg !== key) {
      throw new Error(`Backend package collision: '${pkgName}' claimed by both '${existingPkg}' and '${key}'.`);
    }
    backendPackages.set(pkgName, key);

    const declaredCollection = manifest.backend?.collection;
    if (declaredCollection) {
      const collectionName = collectionNameForKey(key, manifest, declaredCollection);
      const existingCollection = collections.get(collectionName);
      if (existingCollection && existingCollection !== key) {
        throw new Error(
          `Mongo collection collision: '${collectionName}' claimed by both '${existingCollection}' and '${key}'.`
        );
      }
      collections.set(collectionName, key);
    }
  }
}
