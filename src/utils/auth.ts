import { FastifyRequest } from 'fastify';
import { UserRole, ADMIN_PERMISSIONS, AdminPermission } from '@/types/auth';

/**
 * Check if user has admin privileges
 */
export function isAdmin(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

/**
 * Check if user has moderator or higher privileges
 */
export function isModerator(role: UserRole): boolean {
  return role === UserRole.MODERATOR || isAdmin(role);
}

/**
 * Check if user has super admin privileges
 */
export function isSuperAdmin(role: UserRole): boolean {
  return role === UserRole.SUPER_ADMIN;
}

/**
 * Check if user has specific permission
 */
export function hasPermission(role: UserRole, permission: AdminPermission): boolean {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return true; // Super admin has all permissions
    
    case UserRole.ADMIN:
      // Admin has most permissions except super admin specific ones
      return permission !== 'system:manage_config';
    
    case UserRole.MODERATOR:
      // Moderator has limited permissions
      const moderatorPermissions = [
        ADMIN_PERMISSIONS.FLAGS.UPDATE_STATUS,
        ADMIN_PERMISSIONS.FLAGS.VIEW_ALL,
        ADMIN_PERMISSIONS.STAKES.VIEW_ALL,
        ADMIN_PERMISSIONS.VAPPS.SUSPEND,
      ];
      return moderatorPermissions.includes(permission);
    
    default:
      return false;
  }
}

/**
 * Middleware to check if user is admin
 */
export function requireAdmin(request: FastifyRequest, reply: any, done: () => void) {
  const user = (request as any).user;
  
  if (!user) {
    return reply.code(401).send({ error: 'Authentication required' });
  }
  
  if (!isAdmin(user.role)) {
    return reply.code(403).send({ 
      error: 'Admin privileges required',
      required_role: 'ADMIN',
      current_role: user.role 
    });
  }
  
  done();
}

/**
 * Middleware to check if user is moderator or higher
 */
export function requireModerator(request: FastifyRequest, reply: any, done: () => void) {
  const user = (request as any).user;
  
  if (!user) {
    return reply.code(401).send({ error: 'Authentication required' });
  }
  
  if (!isModerator(user.role)) {
    return reply.code(403).send({ 
      error: 'Moderator privileges required',
      required_role: 'MODERATOR',
      current_role: user.role 
    });
  }
  
  done();
}

/**
 * Middleware to check specific permission
 */
export function requirePermission(permission: AdminPermission) {
  return function(request: FastifyRequest, reply: any, done: () => void) {
    const user = (request as any).user;
    
    if (!user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    
    if (!hasPermission(user.role, permission)) {
      return reply.code(403).send({ 
        error: 'Insufficient permissions',
        required_permission: permission,
        current_role: user.role 
      });
    }
    
    done();
  };
}

/**
 * Check if user can access resource (either admin or owns the resource)
 */
export function canAccessResource(
  userRole: UserRole, 
  userId: string, 
  resourceOwnerId: string
): boolean {
  return isAdmin(userRole) || userId === resourceOwnerId;
}

/**
 * Get user permissions based on role
 */
export function getUserPermissions(role: UserRole): AdminPermission[] {
  const permissions: AdminPermission[] = [];
  
  // Check each permission
  Object.values(ADMIN_PERMISSIONS).forEach(category => {
    Object.values(category).forEach(permission => {
      if (hasPermission(role, permission as AdminPermission)) {
        permissions.push(permission as AdminPermission);
      }
    });
  });
  
  return permissions;
}
