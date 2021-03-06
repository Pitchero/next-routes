/* global jest, describe, test, expect */
import React from 'react'
import ReactShallowRenderer from 'react-test-renderer/shallow'
import NextLink from 'next/link'
import nextRoutes from '../dist'

const renderer = new ReactShallowRenderer()

const setupRoute = (...args) => {
  const routes = nextRoutes().add(...args)
  const route = routes.routes[routes.routes.length - 1]
  return {routes, route}
}

describe('Routes', () => {
  const setup = (...args) => {
    const {routes, route} = setupRoute(...args)
    const testRoute = expected => expect(route).toMatchObject(expected)
    return {routes, route, testRoute}
  }

  test('add with object', () => {
    setup({name: 'a'}).testRoute({name: 'a', pattern: '/a', page: '/a'})
  })

  test('add with name', () => {
    setup('a').testRoute({name: 'a', pattern: '/a', page: '/a'})
  })

  test('add with name and pattern', () => {
    setup('a', '/:a').testRoute({name: 'a', pattern: '/:a', page: '/a'})
  })

  test('add with name, pattern and page', () => {
    setup('a', '/:a', 'b').testRoute({name: 'a', pattern: '/:a', page: '/b'})
  })

  test('add with pattern and page', () => {
    setup('/:a', 'b').testRoute({name: null, pattern: '/:a', page: '/b'})
  })

  test('add with only pattern throws', () => {
    expect(() => setup('/:a')).toThrow()
  })

  test('add with existing name throws', () => {
    expect(() => nextRoutes().add('a').add('a')).toThrow()
  })

  test('add multiple unnamed routes', () => {
    expect(nextRoutes().add('/a', 'a').add('/b', 'b').routes.length).toBe(2)
  })

  test('page with leading slash', () => {
    setup('a', '/', '/b').testRoute({page: '/b'})
  })

  test('page index becomes /', () => {
    setup('index', '/').testRoute({page: '/'})
  })

  test('match and merge params into query', () => {
    const routes = nextRoutes().add('a').add('b', '/:a?/b/:b').add('c')
    const {query} = routes.match('/b/b?b=x&c=c')
    expect(query).toMatchObject({b: 'b', c: 'c'})
    expect(query).not.toHaveProperty('a')
  })

  test('match and merge escaped params', () => {
    const routes = nextRoutes().add('a', '/a/:b')
    const {query} = routes.match('/a/b%20%2F%20b')
    expect(query).toMatchObject({b: 'b / b'})
    expect(query).not.toHaveProperty('a')
  })

  test('generate urls from params', () => {
    const {route} = setup('a', '/a/:b/:c+')
    const params = {b: 'b', c: [1, 2], d: 'd'}
    const expected = {as: '/a/b/1/2?d=d', href: '/a?b=b&c=1%2F2&d=d'}
    expect(route.getUrls(params)).toEqual(expected)
    expect(setup('a').route.getUrls()).toEqual({as: '/a', href: '/a?'})
  })

  test('generate urls with params that need escaping', () => {
    const {route} = setup('a', '/a/:b')
    const params = {b: 'b b'}
    const expected = {as: '/a/b%20b', href: '/a?b=b%20b'}
    expect(route.getUrls(params)).toEqual(expected)
    expect(setup('a').route.getUrls()).toEqual({as: '/a', href: '/a?'})
  })

  test('do not pass "null" for params that have null values', () => {
    const {route} = setup('a', '/a/:b/:c?')
    const params = {b: 'b', c: null, d: undefined}
    const expected = {as: '/a/b?', href: '/a?b=b'}
    expect(route.getUrls(params)).toEqual(expected)
    expect(setup('a').route.getUrls()).toEqual({as: '/a', href: '/a?'})
  })

  test('ensure "as" when path match is empty', () => {
    expect(setup('a', '/:a?').route.getAs()).toEqual('/')
  })

  test('with custom Link and Router', () => {
    const CustomLink = () => <div />
    const CustomRouter = {}
    const {Link, Router} = nextRoutes({Link: CustomLink, Router: CustomRouter})
    expect(renderer.render(<Link />).type).toBe(CustomLink)
    expect(Router).toBe(CustomRouter)
  })

  test('clubRoute no external domain', () => {
    const {routes} = setupRoute('a', '/a/:b')
    const { urls: {as, href} } = routes.clubRoute({folder: 'test-club'}, 'a', {b: 1})
    expect(as).toEqual('/clubs/test-club/a/1')
    expect(href).toEqual('/a?b=1')
  })

  test('clubRoute no external domain', () => {
    const {routes} = setupRoute('a', '/a/:b')
    const { urls: {as, href} } = routes.clubRoute({folder: 'test-club', externalDomain: 'www.test-club.com'}, 'a', {b: 1})
    expect(as).toEqual('/a/1')
    expect(href).toEqual('/a?b=1')
  })
})

describe('Request handler', () => {
  const setup = url => {
    const routes = nextRoutes({appDomain: 'test.app'})
    const nextHandler = jest.fn()
    const app = {getRequestHandler: () => nextHandler, render: jest.fn()}
    return {app, routes, req: {originalUrl: url, url}, res: {}}
  }

  test('find route and call render', () => {
    const {routes, app, req, res} = setup('/a')
    const {route, query} = routes.add('a').match('/a')
    routes.getRequestHandler(app)(req, res)
    expect(app.render).toBeCalledWith(req, res, route.page, query)
  })

  test('find route and call custom handler', () => {
    const {routes, app, req, res} = setup('/a')
    const {route, query} = routes.add('a').match('/a')
    const customHandler = jest.fn()
    const expected = expect.objectContaining({req, res, route, query})
    routes.getRequestHandler(app, customHandler)(req, res)
    expect(customHandler).toBeCalledWith(expected)
  })

  test('find no route and call next handler', () => {
    const {routes, app, req, res} = setup('/a')
    const {parsedUrl} = routes.match('/a')
    routes.getRequestHandler(app)(req, res)
    expect(app.getRequestHandler()).toBeCalledWith(req, res, parsedUrl)
  })

  test('find route and call render with club folder prefix', () => {
    const {routes, app, req, res} = setup('/calendar')
    routes.add({
      name: 'calendar',
      pattern: '/calendar',
      page: 'calendar/index'
    })
    const {route, query} = routes.match('/clubs/testclub/calendar', 'test.app')
    routes.getRequestHandler(app)(req, res)
    expect(app.render).toBeCalledWith(req, res, route.page, query)
  })

  test('find route and call render with club folder prefix and external domain', () => {
    const {routes, app, req, res} = setup('/clubs/testclub/calendar')
    routes.add({
      name: 'calendar_with_folder',
      pattern: '/clubs/testclub/calendar',
      page: 'calendar/index'
    })
    routes.add({
      name: 'calendar_without_folder',
      pattern: '/calendar',
      page: 'calendar/index'
    })
    const {route: externalRoute, query: externalQuery} = routes.match('/clubs/testclub/calendar', 'www.externaldomain.com')
    routes.getRequestHandler(app)(req, res)
    expect(app.render).toBeCalledWith(req, res, externalRoute.page, externalQuery)
    expect(externalRoute.name).toBe('calendar_with_folder')

    const {route, query} = routes.match('/clubs/testclub/calendar', 'test.app')
    routes.getRequestHandler(app)(req, res)
    expect(app.render).toBeCalledWith(req, res, route.page, query)
    expect(route.name).toBe('calendar_without_folder')
  })
})

describe('Link', () => {
  const setup = (...args) => {
    const {routes, route} = setupRoute(...args)
    const {Link} = routes
    const props = {children: <a>hello</a>}
    const testLink = (addProps, expected) => {
      const actual = renderer.render(<Link {...props} {...addProps} />)
      expect(actual.type).toBe(NextLink)
      expect(actual.props).toEqual({...props, ...expected})
    }
    return {routes, route, testLink}
  }

  test('with name and params', () => {
    const {route, testLink} = setup('a', '/a/:b')
    testLink({route: 'a', params: {b: 'b'}}, route.getUrls({b: 'b'}))
  })

  test('with route url', () => {
    const {routes, route, testLink} = setup('/a/:b', 'a')
    testLink({route: '/a/b'}, route.getUrls(routes.match('/a/b').query))
  })

  test('with to', () => {
    const {routes, route, testLink} = setup('/a/:b', 'a')
    testLink({to: '/a/b'}, route.getUrls(routes.match('/a/b').query))
  })

  test('with route not found', () => {
    setup('a').testLink({route: '/b'}, {href: '/b', as: '/b'})
  })

  test('without route', () => {
    setup('a').testLink({href: '/'}, {href: '/'})
  })
})

const routerMethods = ['push', 'replace', 'prefetch']

describe(`Router ${routerMethods.join(', ')}`, () => {
  const setup = (...args) => {
    const {routes, route} = setupRoute(...args)
    const testMethods = (args, expected) => {
      routerMethods.forEach(method => {
        const Router = routes.getRouter({[method]: jest.fn()})
        Router[`${method}Route`](...args)
        expect(Router[method]).toBeCalledWith(...expected)
      })
    }
    return {routes, route, testMethods}
  }

  test('with name and params', () => {
    const {route, testMethods} = setup('a', '/a/:b')
    const {as, href} = route.getUrls({b: 'b'})
    testMethods(['a', {b: 'b'}, {}], [href, as, {}])
  })

  test('with route url', () => {
    const {routes, testMethods} = setup('/a', 'a')
    const {route, query} = routes.match('/a')
    const {as, href} = route.getUrls(query)
    testMethods(['/a', {}], [href, as, {}])
  })

  test('with route not found', () => {
    setup('a').testMethods(['/b', {}], ['/b', '/b', {}])
  })
})

describe(`Router pushClubRoute`, () => {
  test('Club with no domain', () => {
    const {routes} = setupRoute('a', '/a/:b')
    const mockPush = jest.fn()
    const Router = routes.getRouter({push: mockPush})
    Router.pushClubRoute({folder: 'testclub'}, 'a', {b: 1}, {})
    expect(mockPush).toBeCalledWith('/a?b=1', '/clubs/testclub/a/1', {})
  })

  test('Club with external domain', () => {
    const {routes} = setupRoute('a', '/a/:b')
    const mockPush = jest.fn()
    const Router = routes.getRouter({push: mockPush})
    Router.pushClubRoute({folder: 'testclub', externalDomain: 'www.test-club.com'}, 'a', {b: 1}, {})
    expect(mockPush).toBeCalledWith('/a?b=1', '/a/1', {})
  })
})

describe(`Router replaceClubRoute`, () => {
  test('Club with no domain', () => {
    const {routes} = setupRoute('a', '/a/:b')
    const mockReplace = jest.fn()
    const Router = routes.getRouter({replace: mockReplace})
    Router.replaceClubRoute({folder: 'testclub'}, 'a', {b: 1}, {})
    expect(mockReplace).toBeCalledWith('/a?b=1', '/clubs/testclub/a/1', {})
  })

  test('Club with external domain', () => {
    const {routes} = setupRoute('a', '/a/:b')
    const mockReplace = jest.fn()
    const Router = routes.getRouter({replace: mockReplace})
    Router.replaceClubRoute({folder: 'testclub', externalDomain: 'www.test-club.com'}, 'a', {b: 1}, {})
    expect(mockReplace).toBeCalledWith('/a?b=1', '/a/1', {})
  })
})
