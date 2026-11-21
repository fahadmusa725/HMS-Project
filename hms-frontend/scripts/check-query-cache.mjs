/**
 * Proves the client-side cache cannot carry one session's data into the next one.
 *
 * The leak this guards: log out of hospital A, log in as hospital B - for the second or two the
 * first refetch takes, the dashboard and the appointments queue render hospital A's rows,
 * because the TanStack cache is a module-level singleton that survives a client-side logout and
 * every query key in this app is tenant-agnostic (['hospital-patients', search, page],
 * ['patient-appointments-mine'], ['dashboard-summary', 30]).
 *
 * The real modules are loaded through Vite's SSR graph, so what is exercised below is the
 * shipping query client, auth store, session guard and axios interceptor - not a copy of them.
 * Run with `npm run check:cache`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../src');

const failures = [];
const checks = [];

function check(label, condition, detail) {
  if (condition) {
    checks.push(label);
    return;
  }
  failures.push(detail ? `${label} - ${detail}` : label);
}

// --- the few browser globals the modules touch at import time ----------------------
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();
// zustand's persist middleware reads window.localStorage, not the bare global, and pathname
// /login keeps the axios interceptor from attempting a real navigation.
globalThis.window = {
  location: { pathname: '/login', href: 'http://localhost/login' },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
};

// Two different tenants, and two different patients inside them - the shape the API returns.
const HOSPITAL_A_USER = {
  id: '6650000000000000000000a1',
  name: 'Dr Anita Rao',
  email: 'anita@hospital-a.test',
  role: 'hospital_admin',
  hospitalId: '6650000000000000000000aa',
  hospitalName: 'Hospital A',
  hospitalLogoUrl: 'https://res.example.test/hospital-a.png',
  mustChangePassword: false,
};
const HOSPITAL_B_USER = {
  id: '6650000000000000000000b1',
  name: 'Dr Bhavna Shah',
  email: 'bhavna@hospital-b.test',
  role: 'hospital_admin',
  hospitalId: '6650000000000000000000bb',
  hospitalName: 'Hospital B',
  hospitalLogoUrl: 'https://res.example.test/hospital-b.png',
  mustChangePassword: false,
};

// The keys the dashboard and the appointments queue actually use on mount.
const SESSION_QUERY_KEYS = [
  ['dashboard-summary', 30],
  ['opd-queue', 'dashboard-today'],
  ['opd-queue', '2026-11-15', ''],
  ['doctors-list'],
  ['hospital-patients', '', 1],
  ['patient-appointments-mine'],
];

function seedCacheAsHospitalA(queryClient) {
  for (const key of SESSION_QUERY_KEYS) {
    queryClient.setQueryData(key, [{ patientName: 'Ravi Kumar', hospital: 'Hospital A' }]);
  }
}

const cacheSize = (queryClient) => queryClient.getQueryCache().getAll().length;

const server = await createServer({
  root: resolve(HERE, '..'),
  configFile: resolve(HERE, '../vite.config.js'),
  // Only here to transform modules for import - no HMR socket, no listening port.
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const { queryClient, resetClientCache } = await server.ssrLoadModule('/src/lib/queryClient.js');
  const { useAuthStore } = await server.ssrLoadModule('/src/store/authStore.js');
  const { installSessionCacheGuard } = await server.ssrLoadModule('/src/lib/sessionCacheGuard.js');
  const { default: api } = await server.ssrLoadModule('/src/lib/api.js');

  // The app has to arm the guard; loading it here only proves it works, not that it is wired.
  const mainSource = readFileSync(resolve(SRC, 'main.jsx'), 'utf8');
  check(
    'main.jsx installs the session guard before rendering',
    /installSessionCacheGuard\(\)/.test(mainSource)
  );

  installSessionCacheGuard();

  // 1. explicit logout -----------------------------------------------------------------
  useAuthStore.getState().setAuthSession('token-hospital-a', HOSPITAL_A_USER);
  seedCacheAsHospitalA(queryClient);
  check('a signed-in session can hold cached rows', cacheSize(queryClient) > 0);

  useAuthStore.getState().logout();
  check(
    'logout leaves the query cache empty',
    cacheSize(queryClient) === 0,
    `${cacheSize(queryClient)} entries survived`
  );
  check('logout drops the session token', useAuthStore.getState().token === null);
  const persistedAuth = JSON.parse(localStorage.getItem('careflow-auth') || '{}');
  check('logout drops the persisted token too', persistedAuth?.state?.token == null);
  check('logout drops the persisted user too', persistedAuth?.state?.user == null);

  // 2. forced logouts from the axios interceptor --------------------------------------
  // A revoked token (401) and a blocked account (403) both end the session without the user
  // touching the sign-out button, so they have to wipe the cache just the same.
  const forceLogout = (error) => api.interceptors.response.handlers[0].rejected(error).catch(() => {});

  for (const [status, response] of [
    [401, { status: 401, data: { message: 'Session expired. Please sign in again.' } }],
    [403, { status: 403, data: { code: 'HOSPITAL_SUSPENDED', message: 'Your hospital is suspended.' } }],
  ]) {
    useAuthStore.getState().setAuthSession('token-hospital-a', HOSPITAL_A_USER);
    seedCacheAsHospitalA(queryClient);
    await forceLogout({ response });
    check(
      `a forced logout (${status}) leaves the query cache empty`,
      cacheSize(queryClient) === 0,
      `${cacheSize(queryClient)} entries survived`
    );
    check(`a forced logout (${status}) ends the session`, useAuthStore.getState().isAuthenticated === false);
  }

  // 3. user switch without an explicit logout -----------------------------------------
  // setState deliberately bypasses the auth store's own actions: this is the session guard
  // alone, the net under any future session-restore or token-swap path.
  useAuthStore.getState().setAuthSession('token-hospital-a', HOSPITAL_A_USER);
  seedCacheAsHospitalA(queryClient);
  useAuthStore.setState({ token: 'token-hospital-b', user: HOSPITAL_B_USER, isAuthenticated: true });
  check(
    'switching to another user clears the cache',
    cacheSize(queryClient) === 0,
    `${cacheSize(queryClient)} entries survived`
  );

  // Same user, different hospital (a staff member moved between tenants).
  useAuthStore.getState().setAuthSession('token-hospital-a', HOSPITAL_A_USER);
  seedCacheAsHospitalA(queryClient);
  useAuthStore.setState({ user: { ...HOSPITAL_A_USER, hospitalId: HOSPITAL_B_USER.hospitalId } });
  check(
    'switching to another hospital clears the cache',
    cacheSize(queryClient) === 0,
    `${cacheSize(queryClient)} entries survived`
  );

  // 4. a response that lands after logout ----------------------------------------------
  useAuthStore.getState().setAuthSession('token-hospital-a', HOSPITAL_A_USER);
  let releaseOldSession;
  const staleFetch = queryClient.fetchQuery({
    queryKey: ['opd-queue', '2026-11-15', ''],
    staleTime: 0,
    queryFn: () =>
      new Promise((resolveRows) => {
        releaseOldSession = resolveRows;
      }),
  });
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  useAuthStore.getState().logout();
  releaseOldSession([{ patientName: 'Ravi Kumar', hospital: 'Hospital A' }]);
  await staleFetch.catch(() => {});
  check(
    'an in-flight response from the old session cannot repopulate the cache',
    cacheSize(queryClient) === 0,
    `${cacheSize(queryClient)} entries reappeared`
  );

  // 5. the branding exception ----------------------------------------------------------
  useAuthStore.getState().setAuthSession('token-hospital-a', HOSPITAL_A_USER);
  const brand = JSON.parse(localStorage.getItem('careflow-hospital-brand') || '{}');
  check(
    'the remembered login-screen brand holds no patient data',
    Object.keys(brand).sort().join(',') === 'logoUrl,name',
    `keys: ${Object.keys(brand).join(',') || 'none'}`
  );

  resetClientCache();
} finally {
  await server.close();
}

// --- report -------------------------------------------------------------------------
for (const label of checks) console.log(`  ok  ${label}`);

if (failures.length > 0) {
  console.log('\nFAIL');
  for (const failure of failures) console.log(`  ${failure}`);
} else {
  console.log(`\nAll checks pass: ${checks.length} assertions, the cache is empty after logout and after a user switch.`);
}

// Vite's module graph keeps its file watchers open past close(), so the run is ended explicitly.
// The empty write is awaited first: on a piped stdout it resolves only once the report above has
// been flushed, which is what stops a CI log from ending mid-line.
await new Promise((flushed) => process.stdout.write('', flushed));
process.exit(failures.length > 0 ? 1 : 0);
