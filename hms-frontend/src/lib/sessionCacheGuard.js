import { useAuthStore } from '@/store/authStore';
import { resetClientCache } from '@/lib/queryClient';

/**
 * Whose data the cache currently holds. The user id catches a different person, the hospital id
 * catches the same person looking at a different tenant - the two ways the cached rows can stop
 * belonging to the session that is on screen.
 */
function identityOf(state) {
  if (!state?.isAuthenticated || !state?.user) return null;
  return `${state.user.id || ''}|${state.user.hospitalId || ''}`;
}

/**
 * Safety net behind the explicit resets in the auth store: whoever changes the signed-in
 * identity - a future session-restore path, a token swap, a devtools setState - the cache is
 * dropped before any screen can render the previous identity's rows.
 */
export function installSessionCacheGuard() {
  let current = identityOf(useAuthStore.getState());

  useAuthStore.subscribe((state) => {
    const next = identityOf(state);
    if (next === current) return;
    current = next;
    resetClientCache();
  });
}
