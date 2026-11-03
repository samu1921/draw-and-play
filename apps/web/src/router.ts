import { createRouter, createWebHistory } from 'vue-router';
import PlannerView from './views/PlannerView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'planner', component: PlannerView },
    { path: '/status', name: 'status', component: () => import('./views/StatusView.vue') },
  ],
});
