import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
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
