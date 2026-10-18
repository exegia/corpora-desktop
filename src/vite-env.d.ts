/// <reference types="vite/client" />

declare const __APP_VERSION__: string

declare module 'virtual:corpora-web-routes' {
  const routes: import('react-router').RouteObject[]
  export default routes
}
