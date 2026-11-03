import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from './stores/session.js';
import PlannerView from './views/PlannerView.vue';

declare module 'vue-router' {
  interface RouteMeta {
    /** Only for signed-in admins */
    admin?: boolean;
    /** Full-screen page without the app header (projector, print, phone at the table) */
    bare?: boolean;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'planner', component: PlannerView },
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    { path: '/status', name: 'status', component: () => import('./views/StatusView.vue') },
    { path: '/admin', name: 'admin', component: () => import('./views/admin/EventsView.vue'), meta: { admin: true } },
    {
      path: '/admin/events/:eventId',
      component: () => import('./views/admin/EventAdminView.vue'),
      meta: { admin: true },
      children: [
        { path: '', name: 'admin-setup', component: () => import('./views/admin/EventSetup.vue') },
        { path: 'persons', name: 'admin-persons', component: () => import('./views/admin/EventPersons.vue') },
        { path: 'competitions', name: 'admin-competitions', component: () => import('./views/admin/EventCompetitions.vue') },
        { path: 'competitions/:competitionId', name: 'admin-competition', component: () => import('./views/admin/CompetitionAdmin.vue') },
        { path: 'desk', name: 'admin-desk', component: () => import('./views/admin/MatchDesk.vue') },
      ],
    },
    { path: '/admin/events/:eventId/qr', name: 'admin-qr', component: () => import('./views/admin/QrSheetView.vue'), meta: { admin: true, bare: true } },
    {
      path: '/e/:slug',
      component: () => import('./views/public/PublicEventView.vue'),
      children: [
        { path: '', name: 'public-event', component: () => import('./views/public/PublicOverview.vue') },
        { path: 'c/:competitionId', name: 'public-competition', component: () => import('./views/public/PublicCompetition.vue') },
      ],
    },
    { path: '/e/:slug/table/:table', name: 'table-entry', component: () => import('./views/public/TableEntryView.vue'), meta: { bare: true } },
    { path: '/e/:slug/display', name: 'display', component: () => import('./views/public/DisplayView.vue'), meta: { bare: true } },
  ],
});

router.beforeEach(async (to) => {
  if (!to.matched.some((r) => r.meta.admin)) return true;
  const session = useSessionStore();
  if (!session.checked) await session.check().catch(() => null);
  return session.user ? true : { name: 'login', query: { redirect: to.fullPath } };
});
