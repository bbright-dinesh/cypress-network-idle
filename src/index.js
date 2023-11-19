/// <reference types="cypress" />

const logPrefix = '**network-idle**'

// reset all counters after every test
// because Cypress resets all intercepts
// https://github.com/bahmutov/cypress-network-idle/issues/54
Cypress.on('test:after:run', () => {
  const env = Cypress.env()
  Cypress._.each(env, (value, key) => {
    if (key.startsWith('networkIdleCounters_')) {
      delete env[key]
    }
  })
})

function waitForIdle(counters, timeLimitMs, timeout, interval) {
  counters.started = +new Date()
  counters.finished = null
  const log = 'log' in counters ? counters.log : true
  if (timeLimitMs === undefined || timeLimitMs === 0) {
    // set default timeout to 2000ms
    timeLimitMs = 2000
  }
  if (log) {
    cy.log(`${logPrefix} for ${timeLimitMs} ms`)
  }

  // cy.wrap(`${logPrefix} waiting...`, { timeout, log }).then(check)
  check()

  function resetCounters() {
    counters.callCount = 0
    counters.currentCallCount = 0
    counters.lastNetworkAt = null
  }

  function check() {
    const d = +new Date()
    const t = counters.lastNetworkAt || counters.started
    const waited = d - counters.started
    const elapsed = d - t

    if (elapsed > timeLimitMs && !counters.currentCallCount) {
      if (log) {
        cy.log(`${logPrefix} finished after ${waited} ms`)
        cy.log(`${elapsed} ms elapsed and current network call count is ${counters.currentCallCount}`)
      }
      
      cy.wrap(
        {
          started: counters.started,
          finished: d,
          waited,
          callCount: counters.callCount,
        },
        { log: false },
      )
      resetCounters()
      return
    } else if (counters.currentCallCount) {
      // Increase the timeLimitMs by 3x the currentCallCount
      // to allow for the network to finish
      if (log) {
        cy.log(
          `${logPrefix} waiting for ${counters.currentCallCount} network calls to finish`,
        )
      }
      timeLimitMs += counters.currentCallCount * 3
    }

    if (waited > timeout) {
      // resetCounters()
      // throw new Error(`Network is busy. Failed after ${waited} ms`)
      cy.log("Seems network is busy. Let's wait a bit more")
    }

    cy.wait(interval, { log: false }).then(check)
  }
}

function waitForNetworkIdleImpl({
  method,
  pattern,
  timeLimitMs,
  timeout,
  interval,
  log,
}) {
  if (typeof log === 'undefined') {
    log = true
  }
  const counters = {
    callCount: 0,
    currentCallCount: 0,
    lastNetworkAt: null,
    log,
  }

  cy.intercept('*', (req) => {
    counters.callCount += 1
    counters.currentCallCount += 1
    counters.lastNetworkAt = +new Date()
    // console.log('req %s %s', req.method, req.url, counters.lastNetworkAt)
    console.log("Request count " , counters.currentCallCount)
    // seems using event callbacks allows the other stubs to be called
    // https://github.com/bahmutov/cypress-network-idle/issues/8
    req.on('response', (res) => {
      counters.lastNetworkAt = +new Date()
      counters.callCount -= 1
      counters.currentCallCount -= 1
      //cy.log(`Received response ${res.statusCode}`)
      // console.log('res %s %s', req.method, req.url, counters.lastNetworkAt)
      // console.log(res.body)
      console.log("Response count ", counters.currentCallCount)
    })
  })

  waitForIdle(counters, timeLimitMs, timeout, interval)
}

function isCommandOptions(x) {
  return typeof x === 'object' && ('timeout' in x || 'log' in x)
}

function parseArgs(a1, a2, a3, a4) {
  let method = '*'
  let pattern = '*'
  let timeLimitMs = 2000
  let timeout = Cypress.config('responseTimeout')
  let interval = 200
  let log = true

  if (typeof a1 === 'number') {
    timeLimitMs = a1
    timeout = Math.max(timeout, timeLimitMs * 3)
    if (isCommandOptions(a2)) {
      timeout = a2.timeout || timeout
      interval = a2.interval || interval
      log = 'log' in a2 ? a2.log : log
    }
  } else if (typeof a1 === 'string' && typeof a2 === 'number') {
    pattern = a1
    timeLimitMs = a2
    timeout = Math.max(timeout, timeLimitMs * 3)
    if (isCommandOptions(a3)) {
      timeout = a3.timeout || timeout
      interval = a3.interval || interval
      log = 'log' in a3 ? a3.log : log
    }
  } else if (typeof a1 === 'string' && typeof a2 === 'string') {
    method = a1
    pattern = a2
    if (typeof a3 === 'number') {
      timeLimitMs = a3
    }
    timeout = Math.max(timeout, timeLimitMs * 3)
    if (isCommandOptions(a3)) {
      timeout = a3.timeout || timeout
      interval = a3.interval || interval
      log = 'log' in a3 ? a3.log : log
    }
    if (isCommandOptions(a4)) {
      timeout = a4.timeout || timeout
      interval = a4.interval || interval
      log = 'log' in a4 ? a4.log : log
    }
  } else {
    throw new Error('Invalid arguments')
  }

  return { method, pattern, timeLimitMs, timeout, interval, log }
}

function waitForNetworkIdle(...args) {
  const { method, pattern, timeLimitMs, timeout, interval, log } = parseArgs(
    ...args,
  )

  if (typeof pattern === 'string' && pattern.startsWith('@')) {
    const alias = pattern.slice(1)

    const counters = Cypress.env(`networkIdleCounters_${alias}`)
    if (!counters) {
      throw new Error(`cypress-network-idle: "${alias}" not found`)
    }

    // console.log({ alias, counters: structuredClone(counters) })
    return waitForIdle(counters, timeLimitMs, timeout, interval)
  }

  waitForNetworkIdleImpl({
    method,
    pattern,
    timeLimitMs,
    timeout,
    interval,
    log,
  })
}

Cypress.Commands.add('waitForNetworkIdle', waitForNetworkIdle)
