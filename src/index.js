import pathToRegexp from 'path-to-regexp'
import React from 'react'
import {parse} from 'url'
import NextLink from 'next/link'
import NextRouter from 'next/router'

module.exports = opts => new Routes(opts)

class Routes {
  constructor ({
    Link = NextLink,
    Router = NextRouter,
    appDomain
  } = {}) {
    this.routes = []
    this.appDomain = appDomain
    this.Link = this.getLink(Link)
    this.Router = this.getRouter(Router)
    this.clubsFolderRegex = pathToRegexp('/clubs/:folder([a-zA-Z0-9_-]+)(.*)')
  }

  add (name, pattern, page) {
    let options
    if (name instanceof Object) {
      options = name
      name = options.name
    } else {
      if (name[0] === '/') {
        page = pattern
        pattern = name
        name = null
      }
      options = {name, pattern, page}
    }

    if (this.findByName(name)) {
      throw new Error(`Route "${name}" already exists`)
    }

    this.routes.push(new Route(options))
    return this
  }

  findByName (name) {
    if (name) {
      return this.routes.filter(route => route.name === name)[0]
    }
  }

  stripClubsFolderPath (pathname) {
    const folderPatternMatch = this.clubsFolderRegex.exec(pathname)
    if (!folderPatternMatch) {
      return pathname
    }

    const folder = folderPatternMatch[1]
    const prefix = `/clubs/${folder}`
    const stripped = pathname.substr(prefix.length)
    return stripped.charAt(0) === '/' ? stripped : `/${stripped}`
  }

  match (url, hostname) {
    const parsedUrl = parse(url, true)
    const {query} = parsedUrl
    let pathname = parsedUrl.pathname
    if (hostname === this.appDomain) {
      pathname = this.stripClubsFolderPath(parsedUrl.pathname)
    }

    return this.routes.reduce((result, route) => {
      if (result.route) return result
      const params = route.match(pathname)
      if (!params) return result
      return {...result, route, params, query: {...query, ...params}}
    }, {query, parsedUrl})
  }

  findAndGetUrls (nameOrUrl, params) {
    const route = this.findByName(nameOrUrl)

    if (route) {
      return {route, urls: route.getUrls(params), byName: true}
    } else {
      const {route, query} = this.match(nameOrUrl)
      const href = route ? route.getHref(query) : nameOrUrl
      const urls = {href, as: nameOrUrl}
      return {route, urls}
    }
  }

  clubRoute (club, name, params) {
    const route = this.findByName(name)
    const urls = route.getUrls(params)

    if (!club.externalDomain) {
      urls.as = `/clubs/${club.folder}${urls.as}`
    }

    return {route, urls}
  }

  getRequestHandler (app, customHandler) {
    const nextHandler = app.getRequestHandler()

    return (req, res) => {
      // Ensure any double slashes at the start of the path get stripped via a redirect.
      // e.g. `//calendar` becomes `/calendar`
      if (req.originalUrl.startsWith('//')) {
        res.redirect(308, req.originalUrl.substr(1))
      }

      const {route, query, parsedUrl} = this.match(req.url, req.hostname)

      if (route) {
        if (customHandler) {
          customHandler({req, res, route, query})
        } else {
          app.render(req, res, route.page, query)
        }
      } else {
        nextHandler(req, res, parsedUrl)
      }
    }
  }

  getLink (Link) {
    const LinkRoutes = props => {
      const {route, params, to, ...newProps} = props
      const nameOrUrl = route || to

      if (nameOrUrl) {
        Object.assign(newProps, this.findAndGetUrls(nameOrUrl, params).urls)
      }

      return <Link {...newProps} />
    }
    return LinkRoutes
  }

  getRouter (Router) {
    const wrap = method => (route, params, options) => {
      const {byName, urls: {as, href}} = this.findAndGetUrls(route, params)
      return Router[method](href, as, byName ? options : params)
    }

    Router.pushRoute = wrap('push')
    Router.replaceRoute = wrap('replace')
    Router.prefetchRoute = wrap('prefetch')
    Router.pushClubRoute = (club, name, params, options) => {
      const { urls: {as, href} } = this.clubRoute(club, name, params)
      return Router['push'](href, as, options)
    }
    Router.replaceClubRoute = (club, name, params, options) => {
      const { urls: {as, href} } = this.clubRoute(club, name, params)
      return Router['replace'](href, as, options)
    }
    return Router
  }
}

class Route {
  constructor ({name, pattern, page = name, meta}) {
    if (!name && !page) {
      throw new Error(`Missing page to render for route "${pattern}"`)
    }

    this.name = name
    this.pattern = pattern || `/${name}`
    this.page = page.replace(/(^|\/)index$/, '').replace(/^\/?/, '/')
    this.regex = pathToRegexp(this.pattern, this.keys = [])
    this.keyNames = this.keys.map(key => key.name)
    this.toPath = pathToRegexp.compile(this.pattern)
    this.meta = meta
  }

  match (path) {
    const values = this.regex.exec(path)
    if (values) {
      return this.valuesToParams(values.slice(1))
    }
  }

  valuesToParams (values) {
    return values.reduce((params, val, i) => {
      if (val === undefined) return params
      return Object.assign(params, {
        [this.keys[i].name]: decodeURIComponent(val)
      })
    }, {})
  }

  getHref (params = {}) {
    return `${this.page}?${toQuerystring(params)}`
  }

  getAs (params = {}) {
    const as = this.toPath(params) || '/'
    const keys = Object.keys(params)
    const qsKeys = keys.filter(key => this.keyNames.indexOf(key) === -1)

    if (!qsKeys.length) return as

    const qsParams = qsKeys.reduce((qs, key) => Object.assign(qs, {
      [key]: params[key]
    }), {})

    return `${as}?${toQuerystring(qsParams)}`
  }

  getUrls (params) {
    const as = this.getAs(params)
    const href = this.getHref(params)
    return {as, href}
  }
}

const toQuerystring = obj => Object.keys(obj)
  .filter(key => obj[key] !== null && obj[key] !== undefined)
  .map(key => {
    let value = obj[key]

    if (Array.isArray(value)) {
      value = value.join('/')
    }
    return [
      encodeURIComponent(key),
      encodeURIComponent(value)
    ].join('=')
  }).join('&')
