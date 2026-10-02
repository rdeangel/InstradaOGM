export type ActorRef = {
  id: string;
  role: string;
};

export type TargetRef = {
  id: string;
  role: string;
};

export type TargetChange = {
  role?: string;
  password?: boolean;
  email?: boolean;
  twoFactor?: boolean;
};

export type ModifyDecision = {
  allowed: boolean;
  reason?: string;
};

const PRIVILEGED_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

export function canActorModifyTarget(
  actor: ActorRef,
  target: TargetRef | null,
  change: TargetChange,
): ModifyDecision {
  if (!PRIVILEGED_ROLES.has(actor.role)) {
    return { allowed: false, reason: 'Insufficient role to modify users.' };
  }

  if (actor.role === 'ADMIN' && change.role === 'SUPER_ADMIN') {
    return { allowed: false, reason: 'ADMIN cannot assign SUPER_ADMIN.' };
  }

  if (!target) {
    return { allowed: true };
  }

  const roleChanging = change.role !== undefined && change.role !== target.role;
  const sensitiveOnSuperAdmin = target.role === 'SUPER_ADMIN'
    && !!(change.password || change.email || change.twoFactor);

  if (actor.role === 'ADMIN' && sensitiveOnSuperAdmin) {
    return { allowed: false, reason: 'ADMIN cannot change a SUPER_ADMIN password, email, or 2FA.' };
  }

  if (roleChanging) {
    if (actor.id === target.id) {
      return { allowed: false, reason: `${actor.role} cannot change their own role.` };
    }
    if (actor.role === 'ADMIN' && target.role === 'ADMIN') {
      return { allowed: false, reason: 'ADMIN cannot change another ADMIN role.' };
    }
    if (actor.role === 'ADMIN' && target.role === 'SUPER_ADMIN') {
      return { allowed: false, reason: 'ADMIN cannot change SUPER_ADMIN role.' };
    }
  }

  return { allowed: true };
}

export function shouldAutoLinkOidcByEmail(existingRole: string): boolean {
  return existingRole !== 'ADMIN' && existingRole !== 'SUPER_ADMIN';
}
