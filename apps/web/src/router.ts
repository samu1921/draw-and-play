import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from './stores/session.js';

declare module 'vue-router' {
  interface RouteMeta {
    /** Only for signed-in users (both roles) */
    admin?: boolean;
    /** Only for the admin role; the registration desk is sent to the players instead */
    adminRole?: boolean;
    /** Full-screen page without the app header (projector, print, phone at the table) */
    bare?: boolean;
    /** i18n key of the page name in the browser tab */
    title?: string;
    /** Public page: the browser tab shows the event alone */
    publicPage?: boolean;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    // The tournament management is the start page; signed-out visitors land on the sign-in
    { path: '/', redirect: { name: 'admin' } },
    { path: '/status', redirect: '/' },
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { title: 'nav.login' } },
    { path: '/admin', name: 'admin', component: () => import('./views/admin/EventsView.vue'), meta: { title: 'nav.events', admin: true } },
    { path: '/admin/planner', name: 'planner', component: () => import('./views/PlannerView.vue'), meta: { title: 'nav.planner', admin: true } },
    {
      path: '/admin/events/:eventId',
      component: () => import('./views/admin/EventAdminView.vue'),
      meta: { admin: true },
      children: [
        { path: '', name: 'admin-event', component: () => import('./views/admin/EventDashboard.vue'), meta: { title: 'admin.tabs.overview' } },
        { path: 'settings', name: 'admin-setup', component: () => import('./views/admin/EventSetup.vue'), meta: { title: 'admin.tabs.setup', adminRole: true } },
        { path: 'persons', name: 'admin-persons', component: () => import('./views/admin/EventPersons.vue'), meta: { title: 'admin.tabs.persons' } },
        { path: 'competitions', name: 'admin-competitions', component: () => import('./views/admin/EventCompetitions.vue'), meta: { title: 'admin.tabs.competitions' } },
        { path: 'competitions/:competitionId', name: 'admin-competition', component: () => import('./views/admin/CompetitionAdmin.vue'), meta: { title: 'admin.tabs.competitions' } },
        { path: 'desk', name: 'admin-desk', component: () => import('./views/admin/MatchDesk.vue'), meta: { title: 'admin.tabs.desk', adminRole: true } },
        { path: 'displays', name: 'admin-displays', component: () => import('./views/admin/EventDisplays.vue'), meta: { title: 'admin.tabs.displays', adminRole: true } },
        { path: 'print', name: 'admin-print-menu', component: () => import('./views/admin/EventPrint.vue'), meta: { title: 'admin.tabs.print' } },
        { path: 'audit', name: 'admin-audit', component: () => import('./views/admin/EventAudit.vue'), meta: { title: 'admin.tabs.audit', adminRole: true } },
      ],
    },
    {
      path: '/admin/events/:eventId/print/:kind(scoresheets|schedule|competitions|results|certificates)',
      name: 'admin-print',
      component: () => import('./views/admin/PrintView.vue'),
      meta: { admin: true, bare: true, title: 'admin.tabs.print' },
    },
    {
      path: '/admin/events/:eventId/viewer-notice',
      name: 'admin-viewer-notice',
      component: () => import('./views/admin/ViewerNoticeView.vue'),
      meta: { admin: true, adminRole: true, bare: true },
    },
    { path: '/admin/events/:eventId/qr', name: 'admin-qr', component: () => import('./views/admin/QrSheetView.vue'), meta: { admin: true, adminRole: true, bare: true } },
    { path: '/admin/users', name: 'admin-users', component: () => import('./views/admin/UsersView.vue'), meta: { title: 'nav.users', admin: true, adminRole: true } },
    { path: '/account', name: 'account', component: () => import('./views/AccountView.vue'), meta: { title: 'nav.account', admin: true } },
    {
      path: '/e/:slug',
      component: () => import('./views/public/PublicEventView.vue'),
      children: [
        { path: '', name: 'public-event', component: () => import('./views/public/PublicOverview.vue'), meta: { publicPage: true } },
        { path: 'c/:competitionId', name: 'public-competition', component: () => import('./views/public/PublicCompetition.vue'), meta: { publicPage: true } },
      ],
    },
    { path: '/e/:slug/table/:table', name: 'table-entry', component: () => import('./views/public/TableEntryView.vue'), meta: { bare: true, publicPage: true } },
    { path: '/e/:slug/display/:profileId?', name: 'display', component: () => import('./views/public/DisplayView.vue'), meta: { bare: true, publicPage: true } },
  ],
});

router.beforeEach(async (to) => {
  if (!to.matched.some((r) => r.meta.admin)) return true;
  const session = useSessionStore();
  if (!session.checked) await session.check().catch(() => null);
  if (!session.user) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.matched.some((r) => r.meta.adminRole) && !session.isAdmin) {
    return typeof to.params.eventId === 'string' ? { name: 'admin-event', params: { eventId: to.params.eventId } } : { name: 'admin' };
  }
  return true;
});
