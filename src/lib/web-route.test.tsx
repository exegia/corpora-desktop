import { expect, test } from 'bun:test'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { renderToStaticMarkup } from 'react-dom/server'
import { adaptRoute } from './web-route'

test('Web routes receive loader data, params and matches through component props', async () => {
  const router = createMemoryRouter([{
    path: '/corpus/:id',
    ...adaptRoute({
      clientLoader: ({ params }) => ({ title: `Corpus ${params.id}` }),
      default: ({ loaderData, params, matches }) =>
        <p>{loaderData.title}:{params.id}:{matches.length}</p>,
    }),
  }], { initialEntries: ['/'] })
  try {
    await router.navigate('/corpus/42')
    expect(renderToStaticMarkup(<RouterProvider router={router} />)).toContain('Corpus 42:42:1')
  } finally { router.dispose() }
})

test('Web client actions and error boundaries retain their framework props', async () => {
  const router = createMemoryRouter([{
    path: '/',
    ...adaptRoute({
      clientAction: async ({ request }) => ({ name: (await request.formData()).get('name') }),
      default: ({ actionData }) => <p>{actionData?.name}</p>,
    }),
  }, {
    path: '/error',
    ...adaptRoute({
      clientLoader: () => { throw new Error('Expected failure') },
      ErrorBoundary: ({ error }) => <p>{error.message}</p>,
    }),
  }])
  try {
    const formData = new FormData()
    formData.set('name', 'Saved corpus')
    await router.navigate('/', { formMethod: 'post', formData })
    expect(renderToStaticMarkup(<RouterProvider router={router} />)).toContain('Saved corpus')
    await router.navigate('/error')
    expect(renderToStaticMarkup(<RouterProvider router={router} />)).toContain('Expected failure')
  } finally { router.dispose() }
})
