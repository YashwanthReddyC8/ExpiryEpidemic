import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const normalizeRole = (role) => (role === 'shop_owner' ? 'shopkeeper' : role);
const normalizeUser = (user) => (user ? { ...user, role: normalizeRole(user.role) } : user);

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      setAuth: ({ user, access_token, refresh_token }) =>
        set({ user: normalizeUser(user), accessToken: access_token, refreshToken: refresh_token }),

      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null }),

      isAuthenticated: () => {
        // Zustand computed value helper — call as useAuthStore.getState().isAuthenticated()
        const state = useAuthStore.getState();
        return !!state.accessToken;
      },
    }),
    {
      name: 'expiryguard-auth',
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...persistedState,
        user: normalizeUser(persistedState?.user ?? currentState.user),
      }),
    }
  )
);
