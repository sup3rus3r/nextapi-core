import fs from "node:fs";
import { IndentationText, Project, SyntaxKind } from "ts-morph";
import { ROUTES_TS_PATH } from "../lib/paths.mjs";
import { backendPackageNameForKey, namespacedPathForKey } from "../lib/moduleId.mjs";

function toRouteConstName(key, manifest) {
  // Reuse the same scope-safe slug as the backend package name (module_alice_profile_page),
  // just uppercased and without the leading "MODULE_" — a scoped id's '@'/'/'
  // must never reach a generated TS identifier the same way it must never
  // reach a generated Python one. backendPackageNameForKey already accounts
  // for a shareable:false module staged at more than one version, so two
  // coexisting installs of the same module get two distinct route consts.
  return backendPackageNameForKey(key, manifest).replace(/^module_/, "").toUpperCase();
}

// Step 7 of docs §6 (routes.ts). Uses a real TS AST (ts-morph) rather than
// regex/string-splice, per the open question resolved in docs §10 — a module's
// RBAC entry is appended/updated in the `Routes` const object and the
// `ProtectedRoutes` array, keyed by path so re-sync updates rather than
// duplicates. CRLF is preserved (the repo's line-ending convention) since
// ts-morph normalizes to LF internally when printing.
export function mergeRoutesTs(order, manifests) {
  const original = fs.readFileSync(ROUTES_TS_PATH, "utf8");
  const usesCrlf = original.includes("\r\n");

  const project = new Project({
    useInMemoryFileSystem: false,
    manipulationSettings: { indentationText: IndentationText.TwoSpaces },
  });
  const sourceFile = project.addSourceFileAtPath(ROUTES_TS_PATH);

  const routesDecl = sourceFile.getVariableDeclarationOrThrow("Routes");
  const routesInitializer = routesDecl.getInitializerOrThrow();
  // Routes is declared as `{...} as const`, so unwrap the AsExpression to reach
  // the actual object literal.
  const routesObj =
    routesInitializer.getKind() === SyntaxKind.AsExpression
      ? routesInitializer.asKindOrThrow(SyntaxKind.AsExpression).getExpressionIfKindOrThrow(SyntaxKind.ObjectLiteralExpression)
      : routesInitializer.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  const protectedRoutesDecl = sourceFile.getVariableDeclarationOrThrow("ProtectedRoutes");
  const protectedRoutesArray = protectedRoutesDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);

  // Prune entries for modules no longer in the current sync order (e.g. removed
  // via `nextapi remove`). Every module-owned entry carries a `description:
  // 'module: <key>'` marker (set below when the entry is created), so any such
  // entry whose resolved key isn't in `order` gets dropped, along with its
  // Routes const. The capture allows '@', '/', and ':' so both a scoped
  // module's marker (e.g. "module: @alice/profile-page") and a duplicated
  // shareable:false instance's compound key (e.g.
  // "module: @bob/foo::2.0.0") still match — the original [\w-]+ pattern
  // silently failed to match a scoped id at all, leaving its entry
  // un-prunable, before the '@'/'/' were added; ':' is added now for the
  // same reason.
  const orderSet = new Set(order);
  for (const el of protectedRoutesArray.getElements()) {
    if (el.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
    const obj = el.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const descProp = obj.getProperty("description");
    const descMatch = descProp?.getText().match(/module: ([\w@/:.-]+)/);
    if (!descMatch) continue;
    const owningModuleId = descMatch[1];
    if (!orderSet.has(owningModuleId)) {
      const pathProp = obj.getProperty("path");
      const pathMatch = pathProp?.getText().match(/Routes\.(\w+)/);
      protectedRoutesArray.removeElement(el);
      if (pathMatch) {
        const staleProp = routesObj.getProperty(pathMatch[1]);
        if (staleProp) staleProp.remove();
      }
    }
  }

  // Collect every module route across the batch, keyed by path.
  const moduleRoutes = [];
  for (const key of order) {
    const manifest = manifests.get(key);
    for (const route of manifest.frontend?.routes ?? []) {
      moduleRoutes.push({ moduleKey: key, manifest, ...route });
    }
  }

  for (const route of moduleRoutes) {
    const constName = toRouteConstName(route.moduleKey, route.manifest);
    // docs §9.5.2: the installed path is namespaced for scoped modules, so
    // the RBAC entry must point at where the route actually landed
    // (/alice/profile), not the author's literally-declared /profile.
    const installPath = namespacedPathForKey(route.moduleKey, route.manifest, route.path);

    const existingProp = routesObj.getProperty(constName);
    if (!existingProp) {
      routesObj.addPropertyAssignment({ name: constName, initializer: `'${installPath}'` });
    }

    // Remove any prior entry for this exact path (keyed by path, so re-sync
    // updates rather than duplicates — docs §6 step 7).
    const elements = protectedRoutesArray.getElements();
    for (const el of elements) {
      if (el.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
      const pathProp = el.asKindOrThrow(SyntaxKind.ObjectLiteralExpression).getProperty("path");
      if (pathProp && pathProp.getText().includes(`Routes.${constName}`)) {
        protectedRoutesArray.removeElement(el);
      }
    }

    const rolesLiteral = `[${route.allowedRoles.map((r) => `'${r}'`).join(", ")}]`;
    protectedRoutesArray.addElement(
      `{\n  path: Routes.${constName},\n  label: '${route.label}',\n  allowedRoles: ${rolesLiteral},\n  description: 'module: ${route.moduleKey}',\n}`
    );
  }

  sourceFile.saveSync();

  if (usesCrlf) {
    let content = fs.readFileSync(ROUTES_TS_PATH, "utf8");
    if (!content.includes("\r\n")) {
      content = content.replace(/\n/g, "\r\n");
      fs.writeFileSync(ROUTES_TS_PATH, content, "utf8");
    }
  }
}
