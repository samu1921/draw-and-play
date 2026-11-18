import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, ApiRequestError } from '../lib/api.js';
import { clearSnapshots, readSnapshot, writeSnapshot } from '../lib/snapshot.js';

/** admin: everything; desk (registration desk): players, entries and attendance */
export type UserRole = 'admin' | 'desk';

export interface User {
  id: string;
  username: string;
  role: UserRole;
}

/** The signed-in user, kept with the staff snapshots, so the desk still opens when it is reloaded offline */
const USER_KEY = 'user';

export const useSessionStore = defineStore('session', () => {
  const user = ref<User | null>(null);
  /** Whether the session has been checked once since page load */
  const checked = ref(false);
  const isAdmin = computed(() => user.value?.role === 'admin');

  function remember(value: User | null) {
    user.value = value;
    // Someone else on this device does not get the snapshots of the previous user
    if (!value || readSnapshot<User>('staff', USER_KEY)?.id !== value.id) clearSnapshots('staff');
    if (value) writeSnapshot('staff', USER_KEY, value);
  }

  async function check() {
    try {
      remember((await api<{ user: User | null }>('GET', '/api/auth/me')).user);
    } catch (e) {
      // Without a connection the last known sign-in counts; the server still checks every request.
      if (e instanceof ApiRequestError && e.status === 0) user.value = readSnapshot<User>('staff', USER_KEY);
      else throw e;
    } finally {
      checked.value = true;
    }
    return user.value;
  }

  async function login(username: string, password: string) {
    remember((await api<{ user: User }>('POST', '/api/auth/login', { username, password })).user);
    checked.value = true;
  }

  async function logout() {
    await api('POST', '/api/auth/logout');
    remember(null);
  }

  return { user, checked, isAdmin, check, login, logout };
});
