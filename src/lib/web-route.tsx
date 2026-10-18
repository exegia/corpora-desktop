import {
  useActionData, useLoaderData, useMatches, useParams, useRouteError,
  type ActionFunction, type LoaderFunction, type RouteObject,
} from 'react-router'
import type { ComponentType } from 'react'

export type WebRouteModule = {
  default?: ComponentType<any>
  ErrorBoundary?: ComponentType<any>
  clientLoader?: LoaderFunction
  clientAction?: ActionFunction
  handle?: RouteObject['handle']
  shouldRevalidate?: RouteObject['shouldRevalidate']
}

// Framework routes receive props; data-router routes expose the same data
// through hooks. Keep that difference here, outside the Web source.
export function adaptRoute(module: WebRouteModule) {
  const Component = module.default
  const Boundary = module.ErrorBoundary
  function RouteComponent() {
    const props = {
      loaderData: useLoaderData(), actionData: useActionData(),
      params: useParams(), matches: useMatches(),
    }
    return Component ? <Component {...props} /> : null
  }
  function ErrorBoundary() {
    const error = useRouteError()
    const params = useParams()
    return Boundary ? <Boundary error={error} params={params} /> : null
  }
  return {
    Component: Component ? RouteComponent : undefined,
    ErrorBoundary: Boundary ? ErrorBoundary : undefined,
    loader: module.clientLoader, action: module.clientAction,
    handle: module.handle, shouldRevalidate: module.shouldRevalidate,
  }
}
