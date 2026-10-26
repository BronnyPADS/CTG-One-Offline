/* fcr-docx.js - the Final Case Report as a Word document (.docx).
 *
 * The FCR is one PDF stitched together from the portal's own reports and the
 * patient's uploaded files (buildFCRDoc in app.js), which marks every page as
 * 'text' (a report the portal wrote: discharge summary, billing statement,
 * Day 1, exams, daily notes) or 'picture' (an uploaded scan, test result or
 * signed form). The Word copy keeps that order, page for page:
 *
 *  - a report page comes out as editable Word text, laid out like the PDF:
 *    each line where the PDF has it, the same fonts, sizes and bold, columns on
 *    tab stops, and a paragraph the PDF wrapped joined back into one so it
 *    re-wraps when edited. Rules and table borders are not carried over.
 *  - the Day 1 (ACE) report is written exactly as its own Word download is
 *    (day1-docx.js, from what the report recorded while it was drawn): real
 *    tables, its letterhead header and "Page X of Y" footer, in its own section.
 *  - an uploaded page is a picture of that page (pdf.js draws it at 150 dpi):
 *    nobody edits a scan, and a signature has to stay exactly as signed.
 *  - every page says "Page X of Y", numbered from the first page of the file
 *    to the last (19 Oct 2026): Word fields in each section's footer, so the
 *    numbers stay right when an edit moves the pages.
 *
 * The practice asked for editable text on 9 Oct 2026, after first choosing
 * pictures of every page. Sideways pictures get sideways Word pages; other
 * sizes are scaled to fit Letter. A report page pdf.js cannot read falls back
 * to its picture, and a page it cannot draw at all to a note saying so.
 *
 * A .docx is a zip of XML parts; JSZip (vendor/, loaded by ensureJSZip in
 * app.js) builds it in the browser - nothing leaves the device.
 */
;(function () {
  'use strict'

  var MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  var DPI = 150                 // print quality without a huge file
  var MAX_SIDE = 2400           // pixels; caps an oversized uploaded page
  var PAGE_W = 12240, PAGE_H = 15840, MARGIN = 360   // twips: Letter, 0.25in margins
  var M_PT = MARGIN / 20
  /* A page without the letterhead (an upload, the Medical Bill) keeps a little
     more room at the bottom for its page number, and a picture leaves room
     under it for the line it stands on. */
  var NUM_BOTTOM = 600, NUM_FOOTER = 320, PIC_SLACK = 80   // twips
  var NUM_BOX = { top: M_PT, bottom: NUM_BOTTOM / 20 }      // points: the text area of such a page
  var EMU_PER_TWIP = 635
  var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
  var tw = function (pt) { return Math.max(0, Math.round(pt * 20)) }

  /* ------------------------------ pictures ------------------------------ */

  // coverFootPt: paint white over the bottom this-many points, to hide an
  // uploaded report's own footer so the FCR's own footer is the only one.
  async function renderPage(pdf, n, coverFootPt) {
    var page = await pdf.getPage(n)
    var natural = page.getViewport({ scale: 1 })
    var scale = Math.min(DPI / 72, MAX_SIDE / Math.max(natural.width, natural.height))
    var vp = page.getViewport({ scale: scale })
    var c = document.createElement('canvas')
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height)
    var cx = c.getContext('2d')
    cx.fillStyle = '#FFFFFF'; cx.fillRect(0, 0, c.width, c.height)
    await page.render({ canvasContext: cx, viewport: vp }).promise
    if (coverFootPt) { var h = Math.ceil(coverFootPt * scale); cx.fillStyle = '#FFFFFF'; cx.fillRect(0, c.height - h, c.width, h) }
    var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.85) })
    var bytes = new Uint8Array(await blob.arrayBuffer())
    page.cleanup()
    c.width = 0; c.height = 0
    return { bytes: bytes, w: natural.width, h: natural.height }
  }

  async function placeholderPage(n) {
    var c = document.createElement('canvas')
    c.width = 1275; c.height = 1650
    var cx = c.getContext('2d')
    cx.fillStyle = '#FFFFFF'; cx.fillRect(0, 0, c.width, c.height)
    cx.fillStyle = '#333333'; cx.font = '28px sans-serif'
    cx.fillText('Page ' + n + ' of the Final Case Report could not be converted for Word.', 120, 300)
    cx.fillText('It is complete in the PDF version (Download FCR).', 120, 350)
    var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.85) })
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w: 612, h: 792 }
  }

  /* The picture's size in Word: the page's own shape, as large as fits inside
     the margins. A sideways page (wider than tall, as test results often are)
     gets a sideways Word page, so it prints full size rather than shrunk. */
  function wide(w, h) { return w > h }
  // hf: header/footer references for this section ('' when the file has none).
  function sectPr(land, hf) {
    return '<w:sectPr>' + (hf || '') + '<w:pgSz w:w="' + (land ? PAGE_H : PAGE_W) + '" w:h="' + (land ? PAGE_W : PAGE_H) + '"' + (land ? ' w:orient="landscape"' : '') + '/>' +
      '<w:pgMar w:top="' + MARGIN + '" w:right="' + MARGIN + '" w:bottom="' + NUM_BOTTOM + '" w:left="' + MARGIN + '" w:header="180" w:footer="' + NUM_FOOTER + '" w:gutter="0"/></w:sectPr>'
  }
  function fit(w, h) {
    var land = wide(w, h)
    var boxW = (land ? PAGE_H : PAGE_W) - 2 * MARGIN, boxH = (land ? PAGE_W : PAGE_H) - MARGIN - NUM_BOTTOM - PIC_SLACK
    var tw_ = boxW, th = boxW * h / w
    if (th > boxH) { th = boxH; tw_ = boxH * w / h }
    return { cx: Math.round(tw_ * EMU_PER_TWIP), cy: Math.round(th * EMU_PER_TWIP) }
  }

  function pictureXml(id, total, size) {
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + size.cx + '" cy="' + size.cy + '"/>' +
      '<wp:docPr id="' + id + '" name="Page ' + id + '" descr="Final Case Report, page ' + id + ' of ' + total + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="page-' + id + '.jpg"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="rIdP' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + size.cx + '" cy="' + size.cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  }

  /* The footer of a page without the letterhead (an upload, the Medical Bill):
     the reports' footer line - left, its text; right, "Page X of Y" at the
     margin (land: a sideways page) - in the reports' footer type. */
  function numberFooterXml(left, land) {
    var rp = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>'
    var text = function (s) { return '<w:r>' + rp + '<w:t xml:space="preserve">' + esc(s) + '</w:t></w:r>' }
    // A full field, every part sized, as the reports' footers have theirs (day1-docx.js).
    var field = function (instr) {
      return '<w:r>' + rp + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + rp + '<w:instrText xml:space="preserve"> ' + instr + ' \\* MERGEFORMAT </w:instrText></w:r>' +
        '<w:r>' + rp + '<w:fldChar w:fldCharType="separate"/></w:r>' + text('1') + '<w:r>' + rp + '<w:fldChar w:fldCharType="end"/></w:r>'
    }
    var tab = (land ? PAGE_H : PAGE_W) - 2 * MARGIN
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ' + NS + '><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="' + tab + '"/></w:tabs><w:spacing w:before="0" w:after="0"/></w:pPr>' +
      (left ? text(left) : '') + '<w:r>' + rp + '<w:tab/></w:r>' + text('Page ') + field('PAGE') + text(' of ') + field('NUMPAGES') + '</w:p></w:ftr>'
  }

  /* ------------------------------ text pages ------------------------------ */

  /* Map an embedded font's name to a real Word font. The uploaded ACE/discharge
     reports are set in Georgia; the others cover the usual Office faces so an
     uploaded report keeps its own typeface instead of defaulting to Times. */
  var FONTS = [[/courier/i, 'Courier New'], [/helvetica|arial/i, 'Arial'], [/times/i, 'Times New Roman'],
    [/georgia/i, 'Georgia'], [/calibri/i, 'Calibri'], [/cambria/i, 'Cambria'], [/verdana/i, 'Verdana'],
    [/tahoma/i, 'Tahoma'], [/trebuchet/i, 'Trebuchet MS'], [/garamond/i, 'Garamond']]
  function fontOf(page, styles, id) {
    var f = null
    try { if (page.commonObjs.has(id)) f = page.commonObjs.get(id) } catch (e) { f = null }
    var name = (f && f.name) || ''
    var fam = ''
    for (var k = 0; k < FONTS.length; k++) if (FONTS[k][0].test(name)) { fam = FONTS[k][1]; break }
    if (!fam) fam = (((f && f.fallbackName) || (styles[id] && styles[id].fontFamily) || '') === 'sans-serif') ? 'Arial' : 'Times New Roman'
    return {
      fam: fam,
      b: !!(f && (f.bold || f.black)) || /bold|black|heavy/i.test(name),
      i: !!(f && f.italic) || /italic|oblique/i.test(name)
    }
  }

  // The words on a report page, each with its place, size and font.
  /* Turn a pdf.js operator list into the same {op, a} graphics stream that
     readJsPdfPage produces for the portal's own reports, so an uploaded page's
     ruled tables and lines can be found and drawn the same way. pdf.js bundles
     a path into one constructPath([paintOp, subpaths, bbox]); each subpath is a
     flat [code, ...coords] list where 0=moveTo(2) 1=lineTo(2) 2=curveTo(6)
     4=closePath(0). Coordinates are in PDF user space - the same space as the
     text transforms readTextPage reads - so the two line up. */
  function opsToGfx(ol, OPS) {
    if (!ol || !OPS) return []
    var PAINT = {}
    PAINT[OPS.stroke] = 'S'; PAINT[OPS.closeStroke] = 's'
    PAINT[OPS.fill] = 'f'; PAINT[OPS.eoFill] = 'f'
    PAINT[OPS.fillStroke] = 'B'; PAINT[OPS.eoFillStroke] = 'B'
    PAINT[OPS.closeFillStroke] = 'b'; PAINT[OPS.closeEOFillStroke] = 'b'
    var arr = function (v) { if (v == null) return []; if (v.length !== undefined && typeof v !== 'string') return Array.prototype.slice.call(v); var o = [], k = 0; while (v[k] !== undefined) { o.push(v[k]); k++ } return o }
    var gfx = [], fn = ol.fnArray, ar = ol.argsArray
    for (var i = 0; i < fn.length; i++) {
      var op = fn[i], a = ar[i]
      if (op === OPS.save) gfx.push({ op: 'q', a: [] })
      else if (op === OPS.restore) gfx.push({ op: 'Q', a: [] })
      else if (op === OPS.transform) gfx.push({ op: 'cm', a: arr(a) })
      else if (op === OPS.setLineWidth) gfx.push({ op: 'w', a: arr(a) })
      else if (op === OPS.setStrokeRGBColor) gfx.push({ op: 'RG', a: arr(a) })
      else if (op === OPS.setFillRGBColor) gfx.push({ op: 'rg', a: arr(a) })
      else if (op === OPS.setStrokeGray) gfx.push({ op: 'G', a: arr(a) })
      else if (op === OPS.setFillGray) gfx.push({ op: 'g', a: arr(a) })
      else if (op === OPS.setStrokeCMYKColor) gfx.push({ op: 'K', a: arr(a) })
      else if (op === OPS.setFillCMYKColor) gfx.push({ op: 'k', a: arr(a) })
      else if (op === OPS.paintFormXObjectBegin) { gfx.push({ op: 'q', a: [] }); gfx.push({ op: 'cm', a: arr(a && a[0]) }) }
      else if (op === OPS.paintFormXObjectEnd) gfx.push({ op: 'Q', a: [] })
      else if (op === OPS.constructPath) {
        var subs = a[1] || []
        for (var s = 0; s < subs.length; s++) {
          var sp = arr(subs[s]), j = 0, broke = false
          while (j < sp.length && !broke) {
            var code = sp[j++]
            if (code === 0) gfx.push({ op: 'm', a: [sp[j++], sp[j++]] })
            else if (code === 1) gfx.push({ op: 'l', a: [sp[j++], sp[j++]] })
            else if (code === 2) { gfx.push({ op: 'c', a: [sp[j], sp[j + 1], sp[j + 2], sp[j + 3], sp[j + 4], sp[j + 5]] }); j += 6 }
            else if (code === 4) gfx.push({ op: 'h', a: [] })
            else broke = true   // an unknown code: stop this subpath rather than desync
          }
        }
        gfx.push({ op: PAINT[a[0]] || 'n', a: [] })
      }
    }
    return gfx
  }

  async function readTextPage(pdf, n) {
    var page = await pdf.getPage(n)
    var vp = page.getViewport({ scale: 1 })
    var ol = await page.getOperatorList()   // loads the page's fonts (bold/italic) and its drawn lines
    var tc = await page.getTextContent()
    // Make sure every font object has reached the main thread before fontOf reads
    // it: the sync commonObjs.get can otherwise miss one that is still resolving,
    // and that page's bold/italic would be lost.
    var fontIds = {}
    tc.items.forEach(function (it) { if (it.fontName) fontIds[it.fontName] = 1 })
    await Promise.all(Object.keys(fontIds).map(function (id) {
      return new Promise(function (res) {
        try { if (page.commonObjs.has(id)) return res(); page.commonObjs.get(id, function () { res() }) }
        catch (e) { res() }
      })
    }))
    var items = []
    tc.items.forEach(function (it) {
      if (it.str === undefined || !it.str.length) return
      var t = it.transform
      var size = Math.hypot(t[2], t[3]) || it.height || 10
      items.push({ s: it.str, x: t[4], y: t[5], w: it.width, size: size, f: fontOf(page, tc.styles, it.fontName) })
    })
    var gfx = opsToGfx(ol, window.pdfjsLib && window.pdfjsLib.OPS)
    page.cleanup()
    return { items: items, w: vp.width, h: vp.height, gfx: gfx }
  }

  /* The upright lines the page draws (table cell edges): [{x, y0, y1}] in PDF
     points. Stroked paths only - a shaded box's edge is not a column line. */
  function verticalRules(gfx) {
    var rules = [], path = [], m = [1, 0, 0, 1, 0, 0], stack = [], at = null, start = null
    var pt = function (x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] }
    var seg = function (p, q) { if (Math.abs(p[0] - q[0]) < 0.5 && Math.abs(p[1] - q[1]) > 2) path.push({ x: (p[0] + q[0]) / 2, y0: Math.min(p[1], q[1]), y1: Math.max(p[1], q[1]) }) }
    ;(gfx || []).forEach(function (g) {
      if (g.skip) return   // a table's line: the table is a Word table now
      var a = g.a
      switch (g.op) {
        case 'q': stack.push(m.slice()); break
        case 'Q': if (stack.length) m = stack.pop(); break
        case 'cm': m = [a[0] * m[0] + a[1] * m[2], a[0] * m[1] + a[1] * m[3], a[2] * m[0] + a[3] * m[2], a[2] * m[1] + a[3] * m[3],
          a[4] * m[0] + a[5] * m[2] + m[4], a[4] * m[1] + a[5] * m[3] + m[5]]; break
        case 'm': at = start = pt(a[0], a[1]); break
        case 'l': { var p = pt(a[0], a[1]); if (at) seg(at, p); at = p; break }
        case 'h': if (at && start) seg(at, start); at = start; break
        case 're': {
          var c0 = pt(a[0], a[1]), c1 = pt(a[0], a[1] + a[3]), c2 = pt(a[0] + a[2], a[1]), c3 = pt(a[0] + a[2], a[1] + a[3])
          seg(c0, c1); seg(c2, c3); break
        }
        case 'n': path = []; at = start = null; break
        default:
          if (PAINT.test(g.op)) {
            if (/^(S|s|B|b)/.test(g.op)) rules.push.apply(rules, path)
            path = []; at = start = null
          }
      }
    })
    return rules
  }

  // Words -> visual lines (same baseline) -> columns (a wide gap, or a table line between) -> runs.
  function toLines(items, rules) {
    rules = rules || []
    var ruled = function (x0, x1, y) {
      return rules.some(function (r) { return r.x > x0 + 0.5 && r.x < x1 - 0.5 && y >= r.y0 - 1 && y <= r.y1 + 1 })
    }
    items.sort(function (a, b) { return (b.y - a.y) || (a.x - b.x) })
    var lines = []
    items.forEach(function (it) {
      var cur = lines[lines.length - 1]
      /* Within three quarters of a letter-height is the same line: Word stacks
         lines, so text a few points from the line before it (a box label beside
         a heading, the letterhead's name beside its address) has to share that
         line, or it and everything under it lands low. */
      if (cur && Math.abs(cur.y - it.y) <= Math.max(1.5, Math.min(cur.size, it.size) * 0.75)) {
        cur.items.push(it); cur.size = Math.max(cur.size, it.size)
      } else lines.push({ y: it.y, size: it.size, items: [it] })
    })
    lines.forEach(function (ln) {
      ln.items.sort(function (a, b) { return a.x - b.x })
      var cols = [], col = null, prevEnd = -1e9, prevText = ''
      ln.items.forEach(function (it) {
        var gap = it.x - prevEnd
        /* A cell whose words nearly fill it leaves less than the usual gap
           before the next cell; the line between them still makes it a new
           column, or the next cell's text joined this one and ran over the
           line ("VOR Vertical 0"). */
        if (!col || gap > Math.max(6, ln.size * 0.9) || ruled(prevEnd, it.x, it.y)) {
          col = { x: it.x, parts: [] }; cols.push(col)
        } else if (gap > ln.size * 0.12 && !/\s$/.test(prevText) && !/^\s/.test(it.s)) {
          col.parts.push({ s: ' ', f: it.f, size: it.size })
        }
        col.parts.push({ s: it.s, f: it.f, size: it.size, color: it.color })
        prevEnd = Math.max(prevEnd, it.x + it.w); prevText = it.s
      })
      ln.cols = cols
      ln.left = cols[0].x
      ln.right = prevEnd
    })
    return lines
  }

  /* Lines the PDF wrapped become one paragraph again (same left edge and size,
     one column, a normal line gap, and the line before ran close to the right
     edge), with each line ending where the PDF's does. Left to re-wrap, Word
     sometimes made one line more and pushed the page's last line onto a page
     of its own. */
  function toParagraphs(lines) {
    var maxRight = 0
    lines.forEach(function (l) { maxRight = Math.max(maxRight, l.right) })
    var paras = []
    lines.forEach(function (ln) {
      var p = paras[paras.length - 1]
      var last = p && p.lines[p.lines.length - 1]
      var gap = last ? last.y - ln.y : 0
      var joins = p && p.lines.length && last.cols.length === 1 && ln.cols.length === 1 &&
        Math.abs(last.left - ln.left) <= 2 && Math.abs(last.size - ln.size) <= 0.3 &&
        gap >= ln.size * 0.95 && gap <= ln.size * 1.7 &&
        (p.gap === null || Math.abs(p.gap - gap) <= 1) &&
        last.right >= maxRight - ln.size * 5
      if (joins) { p.lines.push(ln); p.gap = gap } else paras.push({ lines: [ln], gap: null, maxRight: maxRight })
    })
    return paras
  }

  function runXml(part) {
    var pr = '<w:rFonts w:ascii="' + part.f.fam + '" w:hAnsi="' + part.f.fam + '" w:cs="' + part.f.fam + '"/>' +
      (part.f.b ? '<w:b/>' : '') + (part.f.i ? '<w:i/>' : '') +
      (part.color && part.color !== '000000' ? '<w:color w:val="' + part.color.toUpperCase() + '"/>' : '') +
      '<w:sz w:val="' + Math.round(part.size * 2) + '"/><w:szCs w:val="' + Math.round(part.size * 2) + '"/>'
    return '<w:r><w:rPr>' + pr + '</w:rPr><w:t xml:space="preserve">' + esc(part.s) + '</w:t></w:r>'
  }
  function runsXml(parts) {
    // neighbouring pieces in the same font and size become one run
    var merged = []
    parts.forEach(function (pt) {
      var m = merged[merged.length - 1]
      if (m && !m.tab && !pt.tab && !m.br && !pt.br && m.f.fam === pt.f.fam && m.f.b === pt.f.b && m.f.i === pt.f.i && Math.abs(m.size - pt.size) < 0.3 && (m.color || '') === (pt.color || '')) m.s += pt.s
      else merged.push({ s: pt.s, f: pt.f, size: pt.size, tab: pt.tab, br: pt.br, color: pt.color })
    })
    return merged.map(function (pt) { return pt.tab ? '<w:r><w:tab/></w:r>' : pt.br ? '<w:r><w:br/></w:r>' : runXml(pt) }).join('')
  }

  /* ------------------------------- tables ------------------------------- */
  /* A report draws a table as boxes and lines with its words set inside them.
     Word keeps the two together, but Google Docs spaces the words its own way
     and they slid off the lines (19 Oct 2026). So a grid of lines on a report
     page becomes a real Word table - its words in its cells, its lines the
     cells' borders - and is left out of the picture behind the page. */
  var TOL = 0.8   // points: lines this close are the same line
  function clusterVals(vals) {
    var sorted = vals.slice().sort(function (a, b) { return a - b }), out = []
    sorted.forEach(function (v) {
      var c = out[out.length - 1]
      if (c && v - c.last <= TOL) { c.sum += v; c.n++; c.last = v } else out.push({ sum: v, n: 1, last: v })
    })
    return out.map(function (c) { return c.sum / c.n })
  }
  // The page's drawn paths: what each strokes (upright and level lines only) and fills, and its drawing ops.
  function drawnPaths(gfx) {
    var paths = [], m = [1, 0, 0, 1, 0, 0], stack = [], at = null, start = null
    var lineW = 1, fill = '000000', stroke = '000000'
    var fresh = function () { return { ops: [], segs: [], boxes: [], bad: false } }
    var cur = fresh()
    var pt = function (x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] }
    var seg = function (p, q) {
      if (Math.abs(p[0] - q[0]) < 0.3) { if (Math.abs(p[1] - q[1]) > 0.5) cur.segs.push({ v: true, x: (p[0] + q[0]) / 2, a: Math.min(p[1], q[1]), b: Math.max(p[1], q[1]) }) }
      else if (Math.abs(p[1] - q[1]) < 0.3) cur.segs.push({ v: false, y: (p[1] + q[1]) / 2, a: Math.min(p[0], q[0]), b: Math.max(p[0], q[0]) })
      else cur.bad = true
    }
    gfx.forEach(function (g, i) {
      var a = g.a
      switch (g.op) {
        case 'q': stack.push({ m: m.slice(), lineW: lineW, fill: fill, stroke: stroke }); break
        case 'Q': if (stack.length) { var s = stack.pop(); m = s.m; lineW = s.lineW; fill = s.fill; stroke = s.stroke } break
        case 'cm': m = [a[0] * m[0] + a[1] * m[2], a[0] * m[1] + a[1] * m[3], a[2] * m[0] + a[3] * m[2], a[2] * m[1] + a[3] * m[3],
          a[4] * m[0] + a[5] * m[2] + m[4], a[4] * m[1] + a[5] * m[3] + m[5]]; break
        case 'w': lineW = a[0] * (Math.hypot(m[0], m[1]) || 1); break
        case 'g': case 'rg': case 'k': fill = colorOf(g.op, a); break
        case 'G': case 'RG': case 'K': stroke = colorOf(g.op, a); break
        case 'm': cur.ops.push(i); at = start = pt(a[0], a[1]); break
        case 'l': { cur.ops.push(i); var p = pt(a[0], a[1]); if (at) seg(at, p); at = p; break }
        case 'c': case 'v': case 'y': cur.ops.push(i); cur.bad = true; at = pt(a[a.length - 2], a[a.length - 1]); break
        case 'h': cur.ops.push(i); if (at && start) seg(at, start); at = start; break
        case 're': {
          cur.ops.push(i)
          var c0 = pt(a[0], a[1]), c3 = pt(a[0] + a[2], a[1] + a[3])
          var bx = { x0: Math.min(c0[0], c3[0]), x1: Math.max(c0[0], c3[0]), y0: Math.min(c0[1], c3[1]), y1: Math.max(c0[1], c3[1]) }
          cur.boxes.push(bx)
          seg([bx.x0, bx.y0], [bx.x1, bx.y0]); seg([bx.x0, bx.y1], [bx.x1, bx.y1]); seg([bx.x0, bx.y0], [bx.x0, bx.y1]); seg([bx.x1, bx.y0], [bx.x1, bx.y1])
          break
        }
        case 'n': cur = fresh(); at = start = null; break
        default:
          if (PAINT.test(g.op)) {
            cur.ops.push(i)
            cur.stroked = /^(S|s|B|b)/.test(g.op); cur.filled = /^(f|F|B|b)/.test(g.op)
            cur.lineW = lineW; cur.fill = fill; cur.stroke = stroke
            paths.push(cur)
            cur = fresh(); at = start = null
          }
      }
    })
    return paths
  }
  /* The tables on a jsPDF report page: their grid, cells (with spans, borders
     and shading) and words. The words are taken out of jp.items and the lines
     marked (g.skip) so the picture behind the page leaves them out. */
  function findTables(jp) {
    var gfx = jp.gfx || [], paths = drawnPaths(gfx), segs = []
    paths.forEach(function (p, pi) { if (p.stroked && !p.bad) p.segs.forEach(function (s) { s.p = pi; segs.push(s) }) })
    if (segs.length < 4) return []
    var parent = segs.map(function (_, i) { return i })
    var find = function (i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
    var join = function (i, j) { i = find(i); j = find(j); if (i !== j) parent[i] = j }
    var touch = function (s, t) {
      if (s.v === t.v) return Math.abs((s.v ? s.x : s.y) - (t.v ? t.x : t.y)) <= TOL && s.a <= t.b + TOL && t.a <= s.b + TOL
      var h = s.v ? t : s, v = s.v ? s : t
      return v.x >= h.a - TOL && v.x <= h.b + TOL && h.y >= v.a - TOL && h.y <= v.b + TOL
    }
    var byPath = {}
    segs.forEach(function (s, i) { if (byPath[s.p] !== undefined) join(i, byPath[s.p]); else byPath[s.p] = i })
    for (var i = 0; i < segs.length; i++) for (var j = i + 1; j < segs.length; j++) if (touch(segs[i], segs[j])) join(i, j)
    var comps = {}
    segs.forEach(function (s, i) { var r = find(i); (comps[r] = comps[r] || []).push(s) })
    var tables = []
    Object.keys(comps).forEach(function (k) {
      var comp = comps[k], hs = comp.filter(function (s) { return !s.v }), vs = comp.filter(function (s) { return s.v })
      if (hs.length < 2 || vs.length < 2) return
      var x0 = Math.min.apply(null, hs.map(function (s) { return s.a }).concat(vs.map(function (s) { return s.x })))
      var x1 = Math.max.apply(null, hs.map(function (s) { return s.b }).concat(vs.map(function (s) { return s.x })))
      var y0 = Math.min.apply(null, vs.map(function (s) { return s.a }).concat(hs.map(function (s) { return s.y })))
      var y1 = Math.max.apply(null, vs.map(function (s) { return s.b }).concat(hs.map(function (s) { return s.y })))
      if (x1 - x0 < 30 || y1 - y0 < 10) return       // a tick box, not a table
      /* Words beside the table (the Medical Bill's address next to its
         Statement Date box): a Word table stands on its own lines, so this one
         stays drawn behind the page, its words placed as they are. */
      var beside = jp.items.some(function (it) {
        var py = it.y + it.size * 0.3
        return py > y0 + TOL && py < y1 - TOL && (it.x + it.w < x0 - TOL || it.x > x1 + TOL)
      })
      if (beside) return
      var xs = clusterVals(vs.map(function (s) { return s.x }).concat([x0, x1]))
      var ys = clusterVals(hs.map(function (s) { return s.y }).concat([y0, y1])).reverse()   // top first
      var hCov = function (y, xa, xb) { var mid = (xa + xb) / 2; return hs.some(function (s) { return Math.abs(s.y - y) <= TOL && s.a - TOL <= mid && mid <= s.b + TOL }) }
      var vCov = function (x, ya, yb) { var mid = (ya + yb) / 2; return vs.some(function (s) { return Math.abs(s.x - x) <= TOL && s.a - TOL <= mid && mid <= s.b + TOL }) }
      var pids = {}
      comp.forEach(function (s) { pids[s.p] = true })
      var lineW = 0, color = '000000'
      Object.keys(pids).forEach(function (pi) { lineW = Math.max(lineW, paths[pi].lineW || 0); color = paths[pi].stroke || color })
      // Filled boxes inside the table: its shading.
      var fills = paths.filter(function (p) {
        return p.filled && p.boxes.length && p.boxes.every(function (b) { return b.x0 >= x0 - TOL && b.x1 <= x1 + TOL && b.y0 >= y0 - TOL && b.y1 <= y1 + TOL })
      })
      var rows = []
      for (var r = 0; r + 1 < ys.length; r++) {
        var top = ys[r], bottom = ys[r + 1], cells = []
        for (var c = 0; c + 1 < xs.length;) {
          var c1 = c + 1
          while (c1 + 1 < xs.length && !vCov(xs[c1], bottom, top)) c1++
          var cell = { c0: c, c1: c1, x0: xs[c], x1: xs[c1], top: top, bottom: bottom, items: [],
            bTop: hCov(top, xs[c], xs[c1]), bBottom: hCov(bottom, xs[c], xs[c1]), bLeft: vCov(xs[c], bottom, top), bRight: vCov(xs[c1], bottom, top) }
          var area = (cell.x1 - cell.x0) * (top - bottom)
          fills.forEach(function (p) {
            p.boxes.forEach(function (b) {
              var ov = Math.max(0, Math.min(b.x1, cell.x1) - Math.max(b.x0, cell.x0)) * Math.max(0, Math.min(b.y1, top) - Math.max(b.y0, bottom))
              if (area > 0 && ov >= area * 0.8 && p.fill && p.fill.toLowerCase() !== 'ffffff') { cell.shade = p.fill; p.used = true }
            })
          })
          // No line between this row and the one above, and the same columns: one cell down both rows.
          var above = r ? rows[r - 1].cells.filter(function (a) { return a.c0 === c && a.c1 === c1 })[0] : null
          if (above && !cell.bTop) { cell.master = above.master || above; cell.master.restart = true; cell.shade = cell.master.shade }
          cells.push(cell)
          c = c1
        }
        rows.push({ top: top, bottom: bottom, cells: cells })
      }
      // The words go to the cell they stand in.
      jp.items = jp.items.filter(function (it) {
        var px = it.x + 0.5, py = it.y + it.size * 0.3
        if (px < x0 - TOL || px > x1 + TOL || py < y0 - TOL || py > y1 + TOL) return true
        for (var ri = 0; ri < rows.length; ri++) {
          var row = rows[ri]
          if (py > row.top + TOL || py < row.bottom - TOL) continue
          for (var ci = 0; ci < row.cells.length; ci++) {
            var ce = row.cells[ci]
            if (px >= ce.x0 - TOL && px < ce.x1 + TOL) { (ce.master || ce).items.push(it); return false }
          }
        }
        return true
      })
      Object.keys(pids).forEach(function (pi) { paths[pi].ops.forEach(function (oi) { gfx[oi].skip = true }) })
      fills.forEach(function (p) { if (p.used || pids[paths.indexOf(p)]) p.ops.forEach(function (oi) { gfx[oi].skip = true }) })
      tables.push({ x0: xs[0], x1: xs[xs.length - 1], top: ys[0], bottom: ys[ys.length - 1], xs: xs, rows: rows, lineW: lineW || 0.5, color: color })
    })
    return tables.sort(function (a, b) { return b.top - a.top })
  }
  /* Line spacing that Word and Google Docs both keep: a multiple of the font's
     own single line (1.15 of its size for these fonts). Google Docs has no
     "exactly N pt": it read an exact 13pt as 13/12 of its single line, 14.95pt,
     and report pages ran a few lines onto a page of their own (19 Oct 2026). */
  function lineMult(h, size) { return Math.max(24, Math.round(240 * h / (1.15 * size))) }
  /* A gap of h points: a 1pt line with the rest as the space after it. (Word
     drops the space before the first paragraph of a page, and Google Docs
     stretches a tall exact line, so neither of those holds a gap.) */
  function gapPPr(h) {
    return '<w:widowControl w:val="0"/><w:spacing w:before="0" w:after="' + tw(Math.max(0, h - 1.15)) + '" w:line="240" w:lineRule="auto"/>' +
      '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>'
  }
  // An empty paragraph that takes (almost) no room: an empty cell, or the line a table needs after it.
  var TINY_P = gapPPr(0)
  // A cell's words, line for line as the PDF set them, from where they stand in the cell.
  function cellXml(cell) {
    if (!cell.items.length) return '<w:p><w:pPr>' + TINY_P + '</w:pPr></w:p>'
    var lines = toLines(cell.items.slice(), [])
    var first = lines[0], size = first.size, parts = []
    lines.forEach(function (ln, li) {
      if (li) parts.push({ br: true })
      ln.cols.forEach(function (col, ci) {
        if (ci) parts.push({ s: ' ', f: col.parts[0].f, size: col.parts[0].size })
        parts.push.apply(parts, col.parts)
      })
      // A wrapped line's leading space would indent it in the cell.
      for (var k = parts.length - 1; k >= 0 && !parts[k].br; k--) {
        if (k === 0 || parts[k - 1].br) { parts[k] = Object.assign({}, parts[k], { s: parts[k].s.replace(/^\s+/, '') }); break }
      }
    })
    var pitch = lines.length > 1 ? (lines[0].y - lines[lines.length - 1].y) / (lines.length - 1) : size * 1.15
    var line = Math.max(200, Math.min(480, Math.round(240 * pitch / (size * 1.15))))
    var before = Math.max(0, (cell.top - first.y) - size * 0.9)
    var lgap = first.left - cell.x0, rgap = cell.x1 - first.right
    var jc = '', ind = ''
    if (lgap > 4 && Math.abs(lgap - rgap) <= 3) jc = '<w:jc w:val="center"/>'
    else if (rgap < 8 && lgap > rgap + 6) jc = '<w:jc w:val="right"/>', ind = '<w:ind w:right="' + tw(Math.max(0, rgap)) + '"/>'
    else ind = '<w:ind w:left="' + tw(Math.max(0, lgap)) + '" w:right="' + tw(2) + '"/>'
    return '<w:p><w:pPr><w:pStyle w:val="CTGPage"/><w:widowControl w:val="0"/><w:spacing w:before="' + tw(before) + '" w:after="0" w:line="' + line + '" w:lineRule="auto"/>' + ind + jc + '</w:pPr>' + runsXml(parts) + '</w:p>'
  }
  function tableXml(t) {
    var gx = t.xs.map(function (x) { return tw(x - M_PT) })
    var gw = []
    for (var i = 0; i + 1 < gx.length; i++) gw.push(Math.max(1, gx[i + 1] - gx[i]))
    var sz = Math.max(2, Math.min(12, Math.round(t.lineW * 8)))
    var side = function (name, on) { return on ? '<w:' + name + ' w:val="single" w:sz="' + sz + '" w:space="0" w:color="' + String(t.color).toUpperCase() + '"/>' : '<w:' + name + ' w:val="nil"/>' }
    var nil = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) { return '<w:' + s + ' w:val="nil"/>' }).join('')
    var zero = ['top', 'left', 'bottom', 'right'].map(function (s) { return '<w:' + s + ' w:w="0" w:type="dxa"/>' }).join('')
    var xml = '<w:tbl><w:tblPr><w:tblW w:w="' + (gx[gx.length - 1] - gx[0]) + '" w:type="dxa"/><w:tblInd w:w="' + gx[0] + '" w:type="dxa"/>' +
      '<w:tblBorders>' + nil + '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar>' + zero + '</w:tblCellMar></w:tblPr>' +
      '<w:tblGrid>' + gw.map(function (w) { return '<w:gridCol w:w="' + w + '"/>' }).join('') + '</w:tblGrid>'
    t.rows.forEach(function (row) {
      // Word and Google Docs add the border to a row's height: take it off, or each row came out 0.75pt taller than the PDF's.
      xml += '<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="' + tw(Math.max(1, row.top - row.bottom - sz / 8)) + '" w:hRule="atLeast"/></w:trPr>'
      row.cells.forEach(function (c) {
        var w = 0
        for (var k = c.c0; k < c.c1; k++) w += gw[k]
        var m = c.master
        xml += '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (c.c1 - c.c0 > 1 ? '<w:gridSpan w:val="' + (c.c1 - c.c0) + '"/>' : '') +
          (m ? '<w:vMerge/>' : c.restart ? '<w:vMerge w:val="restart"/>' : '') +
          '<w:tcBorders>' + side('top', c.bTop) + side('left', c.bLeft) + side('bottom', c.bBottom) + side('right', c.bRight) + '</w:tcBorders>' +
          (c.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + String(c.shade).toUpperCase() + '"/>' : '') +
          '</w:tcPr>' + (m ? '<w:p><w:pPr>' + TINY_P + '</w:pPr></w:p>' : cellXml(c)) + '</w:tc>'
      })
      xml += '</w:tr>'
    })
    return xml + '</w:tbl>'
  }

  /* One report page -> Word paragraphs, each placed where the PDF has it: the
     space above a paragraph and an exact line height put every baseline at the
     PDF's own height on the page. Returns [{pPr, runs}] for the caller to add
     the page break and section end, and {raw} for a table (findTables), which
     goes where its top is. box: {top, bottom} in points, where the page's text
     area starts and ends (a report under a Word header and footer); the
     0.25in margin otherwise. */
  function textPageParagraphs(tp, box, tables) {
    var TOP = (box && box.top) || M_PT, BOTTOM = (box && box.bottom) || M_PT
    var paras = toParagraphs(toLines(tp.items, tp.gfx ? verticalRules(tp.gfx) : []))
    var blocks = paras.map(function (p) { return { p: p, top: tp.h - p.lines[0].y - p.lines[0].size } })
    ;(tables || []).forEach(function (t) { blocks.push({ t: t, top: tp.h - t.top }) })
    blocks.sort(function (a, b) { return a.top - b.top })
    var avail = tp.h - TOP - BOTTOM - 1      // a point to spare against Word's rounding
    var out = [], T = 0
    blocks.forEach(function (bk) {
      if (bk.t) {
        var tBefore = Math.max(0, (tp.h - bk.t.top) - TOP - T)
        T += tBefore + (bk.t.top - bk.t.bottom)
        out.push({ before: tBefore, table: bk.t })
        return
      }
      var p = bk.p
      var first = p.lines[0], size = first.size
      var desc = size * 0.22
      var baselineFromTop = (tp.h - first.y) - TOP
      /* A one-line paragraph is no taller than the room above it (down to its
         size plus a point): a heading 13pt under the line before it, as the
         daily notes set them, took 13.8 and pushed the rest of the page down a
         little more at every heading (16 Oct 2026). */
      var lineH = p.gap !== null ? Math.max(p.gap, size)
        : Math.max(size + 1, Math.min(size * 1.15, baselineFromTop + desc - T))
      var before = Math.max(0, baselineFromTop + desc - lineH - T)
      T += before + p.lines.length * lineH
      var parts = []
      p.lines.forEach(function (ln, li) {
        if (li) parts.push({ br: true })
        ln.cols.forEach(function (c, ci) {
          if (ci) parts.push({ tab: true })
          parts.push.apply(parts, c.parts)
        })
      })
      var tabs = first.cols.length > 1
        ? '<w:tabs>' + first.cols.slice(1).map(function (c) { return '<w:tab w:val="left" w:pos="' + tw(c.x - M_PT) + '"/>' }).join('') + '</w:tabs>'
        : ''
      var rightInd = 0
      out.push({ before: before, lineH: lineH, size: size, tabs: tabs, left: tw(first.left - M_PT), right: rightInd, runs: runsXml(parts) })
    })
    /* Taller than the page: take it out of the gaps, never the text, starting
       from the bottom. What runs over is the page's last line - a report's
       footer sits inside Word's bottom margin - so the gap above it gives way
       and the rest of the page stays on its lines and boxes. Shrinking every
       gap lifted all the text off them instead, and a heading under a table
       landed on the table's bottom line (16 Oct 2026). */
    var over = T - avail
    for (var oi = out.length - 1; over > 0 && oi >= 0; oi--) {
      var cut = Math.min(out[oi].before, over)
      out[oi].before -= cut; over -= cut
    }
    /* Word drops the space above the first paragraph of a page that starts on
       a page break, which lifted a whole page's text off its lines and boxes.
       An empty first line holds the gap instead (gapPPr). */
    var top = out.length ? out[0].before : 0
    if (out.length) out[0].before = 0
    var res = [{ pPr: gapPPr(top), runs: '' }]
    out.forEach(function (p) {
      if (p.table) {
        /* A table has no room above it of its own: an empty line holds it,
           and keeps two tables in a row apart (Word joins them). */
        res.push({ pPr: gapPPr(p.before), runs: '' })
        res.push({ raw: tableXml(p.table) })
        return
      }
      res.push({
        pPr: '<w:pStyle w:val="CTGPage"/><w:widowControl w:val="0"/>' + p.tabs +
          '<w:spacing w:before="' + tw(p.before) + '" w:after="0" w:line="' + lineMult(p.lineH, p.size) + '" w:lineRule="auto"/>' +
          '<w:ind w:left="' + p.left + '" w:right="' + p.right + '"/>' +
          // The paragraph's own size is its text's: Google Docs measures the line from it (9pt lines came out 3.5pt taller).
          '<w:rPr><w:sz w:val="' + Math.round(p.size * 2) + '"/><w:szCs w:val="' + Math.round(p.size * 2) + '"/></w:rPr>',
        runs: p.runs
      })
    })
    // A page cannot end on a table: its last paragraph carries the page break or section end.
    if (res[res.length - 1].raw) res.push({ pPr: TINY_P, runs: '' })
    return res
  }


  /* ---------------------- report pages, read from jsPDF ---------------------- */
  /* A report the portal draws with jsPDF still holds its page drawing as PDF
     instructions, one block per piece of text: exact place, font, size and
     colour, nothing run together (read back from the finished PDF, pdf.js
     merges a table's cells into one string). The text becomes Word text; the
     lines, boxes and shading are drawn onto a picture placed behind it. */
  var WIN = { 128: 0x20AC, 130: 0x201A, 131: 0x0192, 132: 0x201E, 133: 0x2026, 134: 0x2020, 135: 0x2021, 136: 0x02C6, 137: 0x2030,
    138: 0x0160, 139: 0x2039, 140: 0x0152, 142: 0x017D, 145: 0x2018, 146: 0x2019, 147: 0x201C, 148: 0x201D, 149: 0x2022,
    150: 0x2013, 151: 0x2014, 152: 0x02DC, 153: 0x2122, 154: 0x0161, 155: 0x203A, 156: 0x0153, 158: 0x017E, 159: 0x0178 }
  function pdfText(raw) {
    var out = '', i = 0, ESC = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }
    while (i < raw.length) {
      var ch = raw[i]
      if (ch !== '\\') { out += ch; i++; continue }
      var oct = /^[0-7]{1,3}/.exec(raw.slice(i + 1, i + 4))
      if (oct) { out += String.fromCharCode(parseInt(oct[0], 8)); i += 1 + oct[0].length; continue }
      var nx = raw[i + 1]
      out += ESC[nx] !== undefined ? ESC[nx] : (nx || ''); i += 2
    }
    return out.replace(/[\u0080-\u009F]/g, function (c) { var u = WIN[c.charCodeAt(0)]; return u ? String.fromCharCode(u) : '' })
  }
  function hex2(v) { var h = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16); return h.length < 2 ? '0' + h : h }
  function colorOf(op, a) {
    if (op === 'g' || op === 'G') return hex2(a[0]) + hex2(a[0]) + hex2(a[0])
    if (op === 'rg' || op === 'RG') return hex2(a[0]) + hex2(a[1]) + hex2(a[2])
    if (op === 'k' || op === 'K') return hex2((1 - a[0]) * (1 - a[3])) + hex2((1 - a[1]) * (1 - a[3])) + hex2((1 - a[2]) * (1 - a[3]))
    return null
  }
  function jsPdfFonts(doc) {
    if (doc.__ctgFonts) return doc.__ctgFonts
    var map = {}, list = doc.getFontList()
    Object.keys(list).forEach(function (name) {
      list[name].forEach(function (style) {
        try {
          var fo = doc.internal.getFont(name, style), ps = fo.postScriptName || ''
          var fam = 'Times New Roman'
          for (var k = 0; k < FONTS.length; k++) if (FONTS[k][0].test(ps)) { fam = FONTS[k][1]; break }
          map[fo.id] = { fo: fo, f: { fam: fam, b: /bold/i.test(ps), i: /italic|oblique/i.test(ps) } }
        } catch (e) { /* a font jsPDF lists but cannot describe */ }
      })
    })
    doc.__ctgFonts = map
    return map
  }
  var TEXT_OPS = /^(BT|ET|Tf|TL|Td|TD|Tm|T\*|Tj|TJ|'|"|Tc|Tw|Tz|Tr|Ts)$/
  var PAINT = /^(S|s|f|F|f\*|B|B\*|b|b\*)$/

  function readJsPdfPage(doc, k) {
    var mb = doc.internal.getPageInfo(k).pageContext.mediaBox
    var W = mb.topRightX - mb.bottomLeftX, H = mb.topRightY - mb.bottomLeftY
    var fonts = jsPdfFonts(doc)
    var items = [], gfx = []
    var font = null, size = 10, lead = 0, fill = '000000', inText = false, lx = 0, ly = 0, scale = 1, hidden = false
    var show = function (str) {
      var s = pdfText(str)
      if (!s || hidden || !font) return
      var w = 0
      try { w = doc.getStringUnitWidth(s, { font: font.fo, fontSize: size }) * size * scale } catch (e) { w = s.length * size * 0.5 }
      items.push({ s: s, x: lx, y: ly, w: w, size: size * scale, f: font.f, color: fill })
    }
    String(doc.internal.pages[k].join('\n')).split('\n').forEach(function (line) {
      line = line.trim()
      if (!line) return
      var m
      if (inText && (m = /^\((.*)\)\s*Tj$/.exec(line))) return show(m[1])
      if (inText && (m = /^\((.*)\)\s*'$/.exec(line))) { ly -= lead; return show(m[1]) }
      if (inText && (m = /^\[(.*)\]\s*TJ$/.exec(line))) {
        var parts = [], re = /\(((?:\\.|[^\\)])*)\)|(-?[\d.]+)/g, t
        while ((t = re.exec(m[1]))) parts.push(t[1] !== undefined ? t[1] : (parseFloat(t[2]) < -200 ? ' ' : ''))
        return show(parts.join(''))
      }
      var toks = line.split(/\s+/), op = toks[toks.length - 1], a = toks.slice(0, -1).map(parseFloat)
      if (op === 'BT') { inText = true; lx = 0; ly = 0; scale = 1; return }
      if (op === 'ET') { inText = false; return }
      if (inText) {
        if (op === 'Tf') { font = fonts[toks[0].replace(/^\//, '')] || font; size = a[1] || size; return }
        if (op === 'TL') { lead = a[0] || 0; return }
        if (op === 'Td') { lx += a[0]; ly += a[1]; return }
        if (op === 'TD') { lx += a[0]; ly += a[1]; lead = -a[1]; return }
        if (op === 'Tm') { lx = a[4]; ly = a[5]; scale = Math.hypot(a[0], a[1]) || 1; return }
        if (op === 'T*') { ly -= lead; return }
        if (op === 'Tr') { hidden = a[0] === 3; return }
      }
      var c = colorOf(op, a)
      if (c && (op === 'g' || op === 'rg' || op === 'k')) fill = c
      if (!TEXT_OPS.test(op)) gfx.push({ op: op, a: a, raw: toks })
    })
    return { items: items, gfx: gfx, w: W, h: H }
  }

  // The page's lines, boxes and shading, drawn as the PDF draws them; null when it has none.
  async function drawGraphics(gfx, W, H) {
    // A table's lines and shading (g.skip) are the Word table's borders and shading instead.
    gfx = gfx.filter(function (g) { return !g.skip })
    if (!gfx.some(function (g) { return PAINT.test(g.op) })) return null
    var sc = DPI / 72
    var c = document.createElement('canvas')
    c.width = Math.ceil(W * sc); c.height = Math.ceil(H * sc)
    var cx = c.getContext('2d')
    /* See-through, not white: Word draws a page's header and footer beneath
       this picture, and a white sheet over the whole page hid the letterhead
       and the footer line. */
    cx.setTransform(sc, 0, 0, -sc, 0, H * sc)       // PDF space: points, y up
    cx.strokeStyle = '#000000'; cx.fillStyle = '#000000'
    var lineW = 1, minW = 0.75 / sc
    var widths = []
    cx.beginPath()
    gfx.forEach(function (g) {
      var a = g.a, op = g.op
      switch (op) {
        case 'q': cx.save(); widths.push(lineW); break
        case 'Q': cx.restore(); if (widths.length) lineW = widths.pop(); break
        case 'cm': cx.transform(a[0], a[1], a[2], a[3], a[4], a[5]); break
        case 'w': lineW = a[0]; break
        case 'J': cx.lineCap = ['butt', 'round', 'square'][a[0]] || 'butt'; break
        case 'j': cx.lineJoin = ['miter', 'round', 'bevel'][a[0]] || 'miter'; break
        case 'd': {
          var dm = /^\[([^\]]*)\]/.exec(g.raw.join(' '))
          cx.setLineDash(dm && dm[1].trim() ? dm[1].trim().split(/\s+/).map(parseFloat) : [])
          break
        }
        case 'g': case 'rg': case 'k': cx.fillStyle = '#' + colorOf(op, a); break
        case 'G': case 'RG': case 'K': cx.strokeStyle = '#' + colorOf(op, a); break
        case 'm': cx.moveTo(a[0], a[1]); break
        case 'l': cx.lineTo(a[0], a[1]); break
        case 'c': cx.bezierCurveTo(a[0], a[1], a[2], a[3], a[4], a[5]); break
        case 'v': case 'y': cx.lineTo(a[a.length - 2], a[a.length - 1]); break
        case 'h': cx.closePath(); break
        case 're': cx.rect(a[0], a[1], a[2], a[3]); break
        case 'W': case 'W*': cx.clip(op === 'W*' ? 'evenodd' : 'nonzero'); break
        case 'n': cx.beginPath(); break
        default:
          if (PAINT.test(op)) {
            if (/^[sb]/.test(op)) cx.closePath()
            var rule = /\*$/.test(op) ? 'evenodd' : 'nonzero'
            if (/^(f|F|B|b)/.test(op)) cx.fill(rule)
            if (/^(S|s|B|b)/.test(op)) { cx.lineWidth = Math.max(lineW, minW); cx.stroke() }
            cx.beginPath()
          }
      }
    })
    var blob = await new Promise(function (res) { c.toBlob(res, 'image/png') })
    var bytes = new Uint8Array(await blob.arrayBuffer())
    c.width = 0; c.height = 0
    return bytes
  }

  // A picture filling the page behind its text: the report's lines and boxes.
  function backgroundXml(n, wPt, hPt) {
    var cxE = Math.round(wPt * 12700), cyE = Math.round(hPt * 12700), id = 100000 + n
    // 1pt, as the line it is anchored in: Google Docs gave that line a 12pt height and set the page's text 12.7pt lower.
    return '<w:r><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1">' +
      '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>' +
      '<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>' +
      '<wp:extent cx="' + cxE + '" cy="' + cyE + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>' +
      '<wp:docPr id="' + id + '" name="Page ' + n + ' lines" descr="Lines and boxes of page ' + n + '"/><wp:cNvGraphicFramePr/>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="lines-' + n + '.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="rIdB' + n + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cxE + '" cy="' + cyE + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      '</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>'
  }

  /* ------------------- a report's letterhead and footer ------------------- */
  /* The reports the portal writes (case discharge summary, exams, daily notes)
     draw the practice letterhead at the top of every page and a footer line,
     "Concussion Therapy Group / provider / patient / DOB ... Page X of Y", at
     the bottom. In the Word copy both move into a real Word header and footer -
     the Day 1's - one section per report, so editing a page cannot carry them
     along (16 Oct 2026). The Medical Bill has no such letterhead and stays as
     it is. */
  var LETTERHEAD = /^(CONCUSSION THERAPY GROUP|2411 Crofton Lane, Suite \w+|Crofton, MD, 21114-1336|Phone: 410-451-9870|Fax: 410-451-9872)$/
  var REPORT_TOP = 84, REPORT_BOTTOM = 36   // points: the text area under the header, above the footer
  /* at: where the report would print its page number (doc.ctgPageNoAt) - a
     report inside the FCR leaves the number out (buildFCRDoc in app.js). */
  function splitReportPage(jp, at) {
    var head = [], body = [], pageNo = null
    jp.items.forEach(function (it) {
      var s = it.s.trim(), fromTop = jp.h - it.y
      if (fromTop < 112 && LETTERHEAD.test(s)) head.push(it)
      else if (fromTop > jp.h - 40 && /^Page \d+ of \d+$/.test(s)) pageNo = it
      else body.push(it)
    })
    // The footer line is everything on the page number's baseline.
    var footY = pageNo ? pageNo.y : at ? at.y : null
    var foot = []
    if (footY !== null) body = body.filter(function (it) { var on = Math.abs(it.y - footY) < 1.5; if (on) foot.push(it); return !on })
    foot.sort(function (a, b) { return a.x - b.x })
    return { head: head, body: body, foot: foot, pageNo: pageNo }
  }
  /* Whether a report's pages carry the letterhead, and where it and the footer
     sit (read from its first page), or null. doc.ctgFooterLeft: the footer
     line for a report whose PDF has none (the case discharge summary). */
  function reportOf(doc) {
    if (doc.__ctgReport !== undefined) return doc.__ctgReport
    var info = null
    try {
      var at = doc.ctgPageNoAt
      var sp = splitReportPage(readJsPdfPage(doc, 1), at)
      var name = sp.head.filter(function (it) { return it.s.trim() === 'CONCUSSION THERAPY GROUP' })[0]
      if (name) {
        var right = sp.head.reduce(function (m, it) { return Math.max(m, it.x + it.w) }, name.x + name.w)
        info = {
          left: name.x, right: right,
          footLeft: sp.foot.length ? sp.foot[0].x : name.x,
          footRight: sp.pageNo ? sp.pageNo.x + sp.pageNo.w : at ? at.right : right,
          footText: sp.foot.length ? sp.foot.map(function (it) { return it.s }).join(' ').trim() : String(doc.ctgFooterLeft || '')
        }
      }
    } catch (e) { info = null }
    doc.__ctgReport = info
    return info
  }

  /* ------------------------------- the file ------------------------------- */

  /* pdfBytes: the compiled FCR (buildFCRDoc), carrying ctgPageKinds - 'text' or
     'picture' per page. onProgress(done, total) runs after each page. */
  async function build(pdfBytes, onProgress) {
    var kinds = (pdfBytes && pdfBytes.ctgPageKinds) || []
    // Uploaded pages that already print their own footer: leave them without one here too.
    var coverFooter = (pdfBytes && pdfBytes.ctgPageCoverFooter) || []
    var sources = (pdfBytes && pdfBytes.ctgPageSources) || []
    var aceRecord = pdfBytes && pdfBytes.ctgAceRecord
    var ace = (aceRecord && window.ctgDay1Docx && window.ctgDay1Docx.parts)
      ? window.ctgDay1Docx.parts(aceRecord, { headerId: 'rIdHA', footerId: 'rIdFA' })
      : null
    var aceDone = false
    /* A Word section for each report that carries the letterhead, with its
       header and footer parts (written once each: reports with the same
       margins and footer line share them). */
    var L = window.ctgDay1Docx && window.ctgDay1Docx.letterhead
    var reportSecs = [], hdrParts = [], ftrParts = [], uploadDocs = {}
    var partFor = function (list, prefix, xml) {
      var i = list.indexOf(xml)
      if (i < 0) { list.push(xml); i = list.length - 1 }
      return prefix + (i + 1)
    }
    var reportSection = function (doc, rep) {
      for (var i = 0; i < reportSecs.length; i++) if (reportSecs[i].doc === doc) return reportSecs[i]
      // The letterhead's table cells keep 5pt (100 twips) inside their edges: set it out by that much.
      var hId = partFor(hdrParts, 'rIdHR', L.header({ ind: tw(rep.left - M_PT) - 100, width: tw(rep.right - rep.left) + 200 }))
      // "Page X of Y" counts the whole file: no section starts again at 1.
      var fId = partFor(ftrParts, 'rIdFR', L.footer({}, 'NUMPAGES', { ind: tw(rep.footLeft - M_PT), tab: tw(rep.footRight - M_PT), text: rep.footText }))
      var sec = {
        doc: doc, key: 'R' + reportSecs.length,
        sect: '<w:sectPr><w:headerReference w:type="default" r:id="' + hId + '"/><w:footerReference w:type="default" r:id="' + fId + '"/>' +
          '<w:pgSz w:w="' + PAGE_W + '" w:h="' + PAGE_H + '"/>' +
          '<w:pgMar w:top="' + tw(REPORT_TOP) + '" w:right="' + MARGIN + '" w:bottom="' + tw(REPORT_BOTTOM) + '" w:left="' + MARGIN + '" w:header="600" w:footer="400" w:gutter="0"/>' +
          '</w:sectPr>'
      }
      reportSecs.push(sec)
      return sec
    }
    var lib = await ensurePdfJs()
    // A copy: pdf.js hands the buffer to its worker, which would empty the caller's.
    // fontExtraProperties keeps each font's real name (e.g. "Georgia-Bold") on the
    // main thread, which is how an uploaded page's bold text is detected (fontOf).
    var task = lib.getDocument({ data: new Uint8Array(pdfBytes), isEvalSupported: false, fontExtraProperties: true })
    var pdf = await task.promise
    var JSZip = await ensureJSZip()
    var zip = new JSZip()
    var total = pdf.numPages
    var pages = [], rels = ''
    try {
      for (var n = 1; n <= total; n++) {
        var done = false
        if (kinds[n - 1] === 'ace' && ace) {
          // The whole Day 1 goes in once, where its first page is; its other pages are in it.
          if (!aceDone) { pages.push({ ace: true, w: 612, h: 792 }); aceDone = true }
          done = true
        }
        if (!done && (kinds[n - 1] === 'text' || kinds[n - 1] === 'ace') && sources[n - 1]) {
          try {
            var src = sources[n - 1]
            var rep = L ? reportOf(src.doc) : null
            var jp = readJsPdfPage(src.doc, src.page)
            // A report's letterhead and footer line go to its Word header and footer, not the page.
            if (rep) jp.items = splitReportPage(jp, src.doc.ctgPageNoAt).body
            if (jp.items.length || rep) {
              var tables = findTables(jp)   // takes the tables' words out of jp.items
              var jparas = textPageParagraphs(jp, rep ? { top: REPORT_TOP, bottom: REPORT_BOTTOM } : NUM_BOX, tables)
              var bg = await drawGraphics(jp.gfx, jp.w, jp.h)
              if (bg) {
                zip.file('word/media/lines-' + n + '.png', bg, { compression: 'STORE' })
                rels += '<Relationship Id="rIdB' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/lines-' + n + '.png"/>'
                jparas[0].runs = backgroundXml(n, jp.w, jp.h) + jparas[0].runs
              }
              pages.push({ w: jp.w, h: jp.h, paras: jparas, sec: rep ? reportSection(src.doc, rep) : null }); done = true
            }
          } catch (e) { console.error('FCR Word: page ' + n + ' could not be read from its report, trying the PDF', e) }
        }
        /* An UPLOADED page that carries the CTG letterhead (an ACE or a case
           discharge summary saved to PDF, or a Word file the portal
           auto-converted) is turned into editable Word text, the SAME way as
           the portal's own reports: the letterhead goes to a real Word header
           and the "Concussion Therapy Group / provider / patient / DOB" line to
           a real Word footer, with ONE page number from Word's field - so no
           page shows the letterhead twice or two page numbers. Any OTHER upload
           (SWAY, reflex, ShoeBox, a scan, a signed form) is deliberately left as
           a faithful picture below: those don't need to be editable and keeping
           them as images protects signatures, charts and layout (26 Oct 2026). */
        if (!done) {
          try {
            var tp = await readTextPage(pdf, n)
            if (tp.items.length) {
              var usp = null, uname = null
              if (L) {
                /* Find the footer by its position - the bottom-most baseline -
                   not by matching "Page X of Y": pdf.js often splits that into
                   pieces ("Page", "1", "of", "8"), and splitReportPage's exact
                   match would then miss it and leave the whole footer in the
                   body. Handing it that baseline lifts the line out whole. */
                var fb = null
                tp.items.forEach(function (it) { if ((tp.h - it.y) > tp.h - 34 && (fb === null || it.y < fb)) fb = it.y })
                usp = splitReportPage(tp, fb !== null ? { y: fb } : null)
                uname = usp.head.filter(function (it) { return it.s.trim() === 'CONCUSSION THERAPY GROUP' })[0]
              }
              if (uname) {
                var uright = usp.head.reduce(function (m, it) { return Math.max(m, it.x + it.w) }, uname.x + uname.w)
                var urep = {
                  left: uname.x, right: uright,
                  footLeft: usp.foot.length ? usp.foot[0].x : uname.x,
                  footRight: usp.foot.reduce(function (m, it) { return Math.max(m, it.x + it.w) }, uname.x),
                  // Collapse the double spaces and drop any "Page X of Y": Word's field is the only page number.
                  footText: usp.foot.map(function (it) { return it.s }).join(' ').replace(/\s+/g, ' ').trim().replace(/\s*Page\s+\d+\s+of\s+\d+\s*$/i, '').trim()
                }
                var ukey = urep.footText || 'U'
                if (!uploadDocs[ukey]) uploadDocs[ukey] = {}
                tp.items = usp.body
                var utables = findTables(tp)   // a ruled grid becomes a real Word table; its words leave tp.items
                var uparas = textPageParagraphs(tp, { top: REPORT_TOP, bottom: REPORT_BOTTOM }, utables)
                var ubg = await drawGraphics(tp.gfx, tp.w, tp.h)   // any other lines, drawn behind the text
                if (ubg && uparas.length && uparas[0].runs !== undefined) {
                  zip.file('word/media/lines-' + n + '.png', ubg, { compression: 'STORE' })
                  rels += '<Relationship Id="rIdB' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/lines-' + n + '.png"/>'
                  uparas[0].runs = backgroundXml(n, tp.w, tp.h) + uparas[0].runs
                }
                pages.push({ w: tp.w, h: tp.h, paras: uparas, sec: reportSection(uploadDocs[ukey], urep) })
                done = true
              } else if (kinds[n - 1] === 'text' || kinds[n - 1] === 'ace') {
                // A portal-written text page (not an upload) stays editable as before.
                pages.push({ w: tp.w, h: tp.h, paras: textPageParagraphs(tp, NUM_BOX) })
                done = true
              }
              // An uploaded file that is NOT a CTG report (SWAY, reflex, ShoeBox,
              // a scan, a signed form, ...) is left for the picture block below,
              // kept exactly as it looks - we don't try to make those editable.
            }
          } catch (e) { console.error('FCR Word: page ' + n + ' text could not be read, using its picture', e) }
        }
        if (!done) {
          var pg
          try {
            // An uploaded report's own footer is painted out so the FCR's footer is the only one.
            pg = await renderPage(pdf, n, coverFooter[n - 1] ? 42 : 0)
          } catch (e) {
            // One page pdf.js cannot draw must not cost the whole file: it says so on its page.
            console.error('FCR Word: page ' + n + ' could not be drawn', e)
            pg = await placeholderPage(n)
          }
          zip.file('word/media/page-' + n + '.jpg', pg.bytes, { compression: 'STORE' })
          rels += '<Relationship Id="rIdP' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page-' + n + '.jpg"/>'
          pages.push({ w: pg.w, h: pg.h, picture: pictureXml(n, total, fit(pg.w, pg.h)) })
        }
        if (onProgress) onProgress(n, total)
      }
    } finally {
      task.destroy()   // the loading task, not the document: pdf.js 4 has no document.destroy()
    }

    /* Page by page, in sections: the Day 1 is one section, each report with
       the letterhead is one, and the other pages group by which way they turn.
       breakBefore: a new page in the same section. The last page of a section
       carries that section's end (the section break itself starts the next
       page). */
    /* Every other section names an empty header, or Word would carry the one
       before into it, and the footer with the page number alone. */
    var hfPlain = function (land) { return '<w:headerReference w:type="default" r:id="rIdHE"/><w:footerReference w:type="default" r:id="' + (land ? 'rIdFNL' : 'rIdFN') + '"/>' }
    var key = function (pg) { return pg.ace ? 'ace' : pg.sec ? pg.sec.key : (wide(pg.w, pg.h) ? 'L' : 'P') }
    var sectFor = function (pg) { return pg.ace ? '<w:sectPr>' + ace.sectPrInner + '</w:sectPr>' : pg.sec ? pg.sec.sect : sectPr(wide(pg.w, pg.h), hfPlain(wide(pg.w, pg.h))) }
    var body = ''
    for (var i = 0; i < pages.length; i++) {
      var pgi = pages[i]
      var endSection = i + 1 < pages.length && key(pages[i + 1]) !== key(pgi) ? sectFor(pgi) : ''
      if (pgi.ace) {
        body += ace.body
        if (endSection) body += '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>' + endSection + '</w:pPr></w:p>'
        continue
      }
      var breakBefore = i > 0 && key(pages[i - 1]) === key(pgi)
      var paras = pgi.paras || [{ pPr: '<w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/>', runs: pgi.picture }]
      paras.forEach(function (p, pi) {
        if (p.raw) { body += p.raw; return }   // a table; a page's first and last entries are paragraphs
        // The page break goes after the paragraph's style, which has to come first.
        var ppr = pi === 0 && breakBefore ? (/^<w:pStyle [^>]*\/>/.test(p.pPr) ? p.pPr.replace(/^(<w:pStyle [^>]*\/>)/, '$1<w:pageBreakBefore/>') : '<w:pageBreakBefore/>' + p.pPr) : p.pPr
        body += '<w:p><w:pPr>' + ppr +
          (pi === paras.length - 1 ? endSection : '') + '</w:pPr>' + p.runs + '</w:p>'
      })
    }
    var lastSect = pages.length ? sectFor(pages[pages.length - 1]) : sectPr(false, hfPlain(false))
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + body +
      lastSect + '</w:body></w:document>'
    var R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
    var CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.'
    var overrides = ''
    var addPart = function (name, xml, kind, id) {
      zip.file('word/' + name + '.xml', xml)
      overrides += '<Override PartName="/word/' + name + '.xml" ContentType="' + CT + kind + '+xml"/>'
      if (id) rels += '<Relationship Id="' + id + '" Type="' + R + kind + '" Target="' + name + '.xml"/>'
    }
    /* CTGPage: the style of a report page's lines and cells. Its own size is
       1pt: Google Docs measures a line from the larger of the style's size and
       the text's, and 9pt lines under the 12pt Normal came out 3.5pt taller
       each (19 Oct 2026). Every run carries its own size, so nothing changes. */
    var pageStyle = '<w:style w:type="paragraph" w:customStyle="1" w:styleId="CTGPage"><w:name w:val="CTG Page"/><w:basedOn w:val="Normal"/>' +
      '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:style>'
    if (ace || L) addPart('styles', (ace ? ace.styles : L.styles()).replace('</w:styles>', pageStyle + '</w:styles>'), 'styles', 'rIdS')
    // An empty header of a 1pt line: Google Docs made room for a whole empty line and set the page's text 28pt lower.
    addPart('header2', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ' + NS + '><w:p><w:pPr>' + TINY_P + '</w:pPr></w:p></w:hdr>', 'header', 'rIdHE')
    var footLeft = (pdfBytes && pdfBytes.ctgFooterLeft) || ''
    addPart('footer2', numberFooterXml(footLeft, false), 'footer', 'rIdFN')
    addPart('footer3', numberFooterXml(footLeft, true), 'footer', 'rIdFNL')
    if (ace) {
      addPart('header1', ace.header, 'header', 'rIdHA')
      addPart('footer1', ace.footer, 'footer', 'rIdFA')
      rels += ace.links.map(function (l) { return '<Relationship Id="' + l.id + '" Type="' + R + 'hyperlink" Target="' + esc(l.url) + '" TargetMode="External"/>' }).join('')
    }
    hdrParts.forEach(function (xml, i) { addPart('headerR' + (i + 1), xml, 'header', 'rIdHR' + (i + 1)) })
    ftrParts.forEach(function (xml, i) { addPart('footerR' + (i + 1), xml, 'footer', 'rIdFR' + (i + 1)) })
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      overrides + '</Types>')
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    zip.file('word/document.xml', doc)
    // Current Word layout rules, so the file does not open in Compatibility Mode.
    zip.file('word/settings.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>')
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      rels + '</Relationships>')
    return zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' })
  }

  window.ctgFcrDocx = { build: build }
})()
