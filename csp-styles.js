/* csp-styles.js - lets the portal keep its inline styles while the security
 * policy refuses style attributes (style-src-attr 'none').
 *
 * Styles are written as data-cs="<token>|color:red" instead of style="color:red"
 * and applied here through the CSSOM (element.style), which the policy does not
 * restrict. The token is random per page load and never sent anywhere, so it
 * works the way a CSP nonce does: markup injected into the page (a field that
 * slipped past escaping) cannot know it, and its data-cs is dropped unapplied.
 * A plain style="" anywhere is simply refused by the browser.
 *
 * index.html's own static markup cannot know the token, so it uses
 * data-cs-boot="...", honoured only until window.ctgEndCspBoot() runs - from a
 * script placed after the last static markup and before the first app script,
 * that is, before any data has been rendered.
 *
 * Styles are applied synchronously when markup goes in through innerHTML,
 * outerHTML or insertAdjacentHTML, so code that reads el.style or measures an
 * element straight after rendering sees what an inline style gave it. A
 * MutationObserver catches every other way in. Must load first, in <head>.
 */
;(function () {
  'use strict'
  var bytes = new Uint8Array(12)
  ;(window.crypto || window.msCrypto).getRandomValues(bytes)
  var TOKEN = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2) }).join('') + '|'
  Object.defineProperty(window, '__cs', { value: TOKEN, writable: false, configurable: false, enumerable: false })

  var boot = true

  /* Apply declarations as one cssText, so shorthands written with var() (which
     the CSSOM cannot split into longhands until computed time) survive. Anything
     the code already set on the element goes last, so it still wins - the order
     an inline style followed by el.style.x = ... would have given. */
  function apply(el, css) {
    if (!css || !el.style) return
    var cur = el.style.cssText
    el.style.cssText = cur ? css + ';' + cur : css
  }
  function one(el) {
    var v = el.getAttribute('data-cs')
    if (v != null) {
      el.removeAttribute('data-cs')
      if (v.indexOf(TOKEN) === 0) apply(el, v.slice(TOKEN.length))
    }
    if (el.hasAttribute('data-cs-boot')) {
      var b = el.getAttribute('data-cs-boot')
      el.removeAttribute('data-cs-boot')
      if (boot) apply(el, b)
    }
  }
  function process(root) {
    if (!root) return
    if (root.nodeType === 1) one(root)
    if (!root.querySelectorAll) return
    var list = root.querySelectorAll('[data-cs],[data-cs-boot]')
    for (var i = 0; i < list.length; i++) one(list[i])
  }
  function marked(v) { return typeof v === 'string' && v.indexOf('data-cs') !== -1 }

  // Synchronous paths.
  function wrapSetter(proto, prop, after) {
    var d = Object.getOwnPropertyDescriptor(proto, prop)
    if (!d || !d.set) return
    Object.defineProperty(proto, prop, {
      configurable: true, enumerable: d.enumerable, get: d.get,
      set: function (v) { var ctx = after === 'parent' ? this.parentNode : this; d.set.call(this, v); if (marked(v)) process(ctx) }
    })
  }
  wrapSetter(Element.prototype, 'innerHTML', 'self')
  wrapSetter(Element.prototype, 'outerHTML', 'parent')
  if (window.ShadowRoot) wrapSetter(ShadowRoot.prototype, 'innerHTML', 'self')
  var iah = Element.prototype.insertAdjacentHTML
  Element.prototype.insertAdjacentHTML = function (pos, html) {
    var p = String(pos).toLowerCase()
    var ctx = (p === 'beforebegin' || p === 'afterend') ? this.parentNode : this
    iah.call(this, pos, html)
    if (marked(html)) process(ctx)
  }
  var ccf = Range.prototype.createContextualFragment
  Range.prototype.createContextualFragment = function (html) {
    var f = ccf.call(this, html)
    if (marked(html)) process(f)
    return f
  }

  // Everything else (appendChild of parsed nodes, setAttribute('data-cs', ...)).
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i]
      if (r.type === 'attributes') { if (r.target.nodeType === 1) one(r.target); continue }
      for (var j = 0; j < r.addedNodes.length; j++) process(r.addedNodes[j])
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-cs', 'data-cs-boot'] })

  // index.html's static markup, then no more data-cs-boot.
  window.ctgEndCspBoot = function () { process(document.documentElement); boot = false }
  // For documents this page writes into another window (print views): they
  // inherit the policy but not this script.
  window.ctgApplyCs = function (doc) { if (doc) process(doc.documentElement || doc) }
})()
