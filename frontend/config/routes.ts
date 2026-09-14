
export type UserRole = 'admin' | 'guest' | 'user';

export interface RouteConfig {
  path        : string;
  label       : string;
  allowedRoles: UserRole[];
  description?: string;
}

export const Routes = {
  HOME        : '/',
  LOGIN       : '/login',
  REGISTER    : '/register',

  DOCS        : '/home',
  RBAC_TESTS  : '/rbac-tests',
  ADMIN_PANEL : '/admin',
  GUEST_PAGE  : '/guest'
} as const;


export const ProtectedRoutes: RouteConfig[] = [
  {
    path: Routes.DOCS,
    label: 'Docs',
    allowedRoles: ['admin', 'guest', 'user'],
    description: 'Framework and CLI documentation - accessible to all authenticated users',
  },
  {
    path: Routes.RBAC_TESTS,
    label: 'RBAC Tests',
    allowedRoles: ['admin', 'guest', 'user'],
    description: 'Session and role-based access control test panel',
  },
  {
    path: Routes.ADMIN_PANEL,
    label: 'Admin Panel',
    allowedRoles: ['admin'],
    description: 'Admin only - manage users and settings',
  },
  {
    path: Routes.GUEST_PAGE,
    label: 'Guest Page',
    allowedRoles: ['guest', 'admin'],
    description: 'Accessible to guests and admins',
  }
];


export function hasAccess(userRole: string | undefined, allowedRoles: UserRole[]): boolean {
  if (!userRole) return false;
  return allowedRoles.includes(userRole as UserRole);
}


export function getAccessibleRoutes(userRole: string | undefined): RouteConfig[] {
  if (!userRole) return [];
  return ProtectedRoutes.filter(route => hasAccess(userRole, route.allowedRoles));
}


export function canAccessPath(userRole: string | undefined, path: string): boolean {
  const route = ProtectedRoutes.find(r => r.path === path);
  if (!route) return true;
  return hasAccess(userRole, route.allowedRoles);
}
