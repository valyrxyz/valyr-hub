export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  reputation: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  USER = 'USER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

export interface APIKey {
  id: string;
  name: string;
  keyHash: string;
  userId: string;
  permissions: string[];
  isActive: boolean;
  lastUsed?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export const ADMIN_PERMISSIONS = {
  FLAGS: {
    UPDATE_STATUS: 'flags:update_status',
    DELETE: 'flags:delete',
    VIEW_ALL: 'flags:view_all',
  },
  STAKES: {
    SLASH: 'stakes:slash',
    RESTORE: 'stakes:restore',
    VIEW_ALL: 'stakes:view_all',
  },
  USERS: {
    BAN: 'users:ban',
    UNBAN: 'users:unban',
    UPDATE_ROLE: 'users:update_role',
    VIEW_ALL: 'users:view_all',
  },
  VAPPS: {
    DELETE: 'vapps:delete',
    FORCE_VERIFY: 'vapps:force_verify',
    SUSPEND: 'vapps:suspend',
  },
  SYSTEM: {
    VIEW_METRICS: 'system:view_metrics',
    MANAGE_CONFIG: 'system:manage_config',
    VIEW_LOGS: 'system:view_logs',
  },
} as const;

export type AdminPermission = typeof ADMIN_PERMISSIONS[keyof typeof ADMIN_PERMISSIONS][keyof typeof ADMIN_PERMISSIONS[keyof typeof ADMIN_PERMISSIONS]];

