import { createBrowserRouter, ScrollRestoration } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { ExegiaProvider } from '@exegia/corpora-ui'
import * as root from '@corpora-web/root'
import { AnchoredToastProvider, ToastProvider } from '@corpora-web/components/ui/toast'
import { applyTheme, getThemePreference, resolveTheme } from '@corpora-web/lib/theme'
import routes from 'virtual:corpora-web-routes'
import { adaptRoute } from '../lib/web-route'

applyTheme(resolveTheme(getThemePreference()))

const router = createBrowserRouter([{
  id: 'root',
  ...adaptRoute(root),
  Component: function Root() {
    return <><root.default /><ScrollRestoration /></>
  },
  HydrateFallback: () => null,
  children: routes,
}])

/** The real Web route tree, rendered inside Desktop's React root. */
export function CorporaWeb() {
  return (
    <ExegiaProvider>
      <ToastProvider>
        <AnchoredToastProvider>
          <RouterProvider router={router} />
        </AnchoredToastProvider>
      </ToastProvider>
    </ExegiaProvider>
  )
}
