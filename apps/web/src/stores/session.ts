import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../lib/api.js';

export interface User {
  id: string;
  username: string;
}

export const useSessionStore = defineStore('session', () => {
  const user = ref<User | null>(null);
  /** Whether the session has been checked once since page load */
  const checked = ref(false);

  async function check() {
    try {
      user.value = (await api<{ user: User | null }>('GET', '/api/auth/me')).user;
    } finally {
      checked.value = true;
    }
    return user.value;
  }

  async function login(username: string, password: string) {
    user.value = (await api<{ user: User }>('POST', '/api/auth/login', { username, password })).user;
    checked.value = true;
  }

  async function logout() {
    await api('POST', '/api/auth/logout');
    user.value = null;
  }

  return { user, checked, check, login, logout };
});
