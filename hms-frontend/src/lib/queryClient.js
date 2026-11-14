import { QueryClient, QueryCache } from '@tanstack/react-query';
import { toast } from 'sonner';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    /**
     * One consistent error surface for every failed read. Screens with their own error panel
     * keep it; screens that only render a table no longer look like "there is no data" when
     * the request actually failed.
     * 401/403 are skipped: the axios interceptor already logs the user out or redirects.
     * The fixed toast id means a polling query that keeps failing replaces one toast instead
     * of stacking a new one every interval.
     */
    onError: (error) => {
      const status = error?.response?.status;
      if (status === 401 || status === 403) return;
      const message = error?.response?.data?.message || error?.message;
      toast.error(message ? `Could not load data: ${message}` : 'Could not load data. Please try again.', {
        id: 'query-load-error',
      });
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      // Deliberately short: most of this app is operational data (queue, stock, bills) that
      // changes while the tab is open. Screens that can live with staler data set a longer
      // staleTime themselves.
      staleTime: 30 * 1000,
    },
  },
});
