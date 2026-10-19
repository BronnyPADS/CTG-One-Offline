/* day1-docx.js - the Day 1 report as a Word document (.docx).
 *
 * buildPDF(name, {record: []}) records what the report says, block by block,
 * while it draws the PDF (see "opts.record" in app.js). This file writes those
 * blocks out as a .docx, so the Word file and the PDF always say the same
 * thing in the same order: the letterhead in the page header, the patient box
 * and provider at the top of page 1, the footer with "Page X of Y", and the
 * symptom, risk-factor and red-flag tables as Word tables.
 *
 * A .docx is a zip of XML parts; JSZip (vendor/, loaded by ensureJSZip in
 * app.js) builds it in the browser - nothing leaves the device.
 */
;(function () {
  'use strict'

  var TEXT_W = 10320 // twips: Letter 12240 less 960 (48pt) margins either side
  var MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  /* One run of text. o: {b, i, u, sz (points), color}. Line breaks in the text
     (a typed note) become Word line breaks. */
  function run(text, o) {
    o = o || {}
    var pr = (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + (o.u ? '<w:u w:val="single"/>' : '') +
      (o.color ? '<w:color w:val="' + o.color + '"/>' : '') +
      (o.sz ? '<w:sz w:val="' + Math.round(o.sz * 2) + '"/><w:szCs w:val="' + Math.round(o.sz * 2) + '"/>' : '')
    var parts = String(text == null ? '' : text).split(/\r?\n/)
    var body = parts.map(function (t) { return '<w:t xml:space="preserve">' + esc(t) + '</w:t>' }).join('<w:br/>')
    return '<w:r>' + (pr ? '<w:rPr>' + pr + '</w:rPr>' : '') + body + '</w:r>'
  }
  function segRuns(segs, o) {
    return (segs || []).map(function (s) {
      if (typeof s === 'string') s = { t: s }
      return run(s.t, { b: s.b || (o && o.b), i: s.i, u: s.u, sz: o && o.sz, color: o && o.color })
    }).join('')
  }
  /* A paragraph. o: {before, after (points), align, keepNext, tabs, ind (twips)} */
  function para(runs, o) {
    o = o || {}
    var pr = (o.keepNext ? '<w:keepNext/>' : '') + (o.tabs || '') +
      '<w:spacing w:before="' + Math.round((o.before || 0) * 20) + '" w:after="' + Math.round((o.after || 0) * 20) + '"/>' +
      (o.ind ? '<w:ind w:left="' + o.ind + '"/>' : '') +
      (o.align ? '<w:jc w:val="' + o.align + '"/>' : '')
    return '<w:p><w:pPr>' + pr + '</w:pPr>' + (runs || '') + '</w:p>'
  }

  function borders(color, size) {
    var b = function (side) { return '<w:' + side + ' w:val="single" w:sz="' + size + '" w:space="0" w:color="' + color + '"/>' }
    return '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b).join('') + '</w:tblBorders>'
  }
  /* A table. rows: [[cellXml, ...], ...], each cellXml already paragraphs.
     o.width / o.ind (twips): another width than the page's, set in from the margin. */
  function table(widths, rows, o) {
    o = o || {}
    var W = o.width || TEXT_W
    var total = widths.reduce(function (a, b) { return a + b }, 0)
    var tw = widths.map(function (w) { return Math.round(W * w / total) })
    var grid = '<w:tblGrid>' + tw.map(function (w) { return '<w:gridCol w:w="' + w + '"/>' }).join('') + '</w:tblGrid>'
    var pr = '<w:tblPr><w:tblW w:w="' + W + '" w:type="dxa"/>' +
      (o.ind ? '<w:tblInd w:w="' + o.ind + '" w:type="dxa"/>' : '') +
      (o.noBorders ? '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>' : borders(o.color || '000000', o.size || 4)) +
      '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>'
    var body = rows.map(function (cells) {
      return '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + cells.map(function (c, i) {
        var valign = o.valign ? '<w:vAlign w:val="' + o.valign[i] + '"/>' : ''
        return '<w:tc><w:tcPr><w:tcW w:w="' + tw[i] + '" w:type="dxa"/>' + valign + '</w:tcPr>' + (c || para('')) + '</w:tc>'
      }).join('') + '</w:tr>'
    }).join('')
    // A paragraph after every table: two tables in a row would otherwise merge into one.
    return '<w:tbl>' + pr + grid + body + '</w:tbl>' + (o.noTrail ? '' : para('', { after: 6 }))
  }

  function blockXml(b, links) {
    switch (b.k) {
      case 'h1':
        return para(run(b.t, { b: true, u: true }) + (b.trail ? run('   ' + b.trail) : ''), { before: 12, after: 8, keepNext: true })
      case 'h2':
        // gap: a sub-heading that opens its own part gets a main heading's room (buildPDF H2).
        return para(run(b.t, { b: true, u: b.u }), { before: b.gap ? 12 : 4, after: b.gap ? 8 : 2, keepNext: true })
      case 'p':
        return para(segRuns(b.segs), { after: 4 })
      case 'link': {
        var id = 'rIdL' + (links.length + 1)
        links.push({ id: id, url: b.url })
        return para('<w:hyperlink r:id="' + id + '">' + run(b.url, { i: true, u: true, color: '0000C8' }) + '</w:hyperlink>', { after: 4 })
      }
      case 'table':
        return table(b.widths || [80, 20], b.rows.map(function (r) {
          return r.c.map(function (txt, i) { return para(run(txt, { b: r.b, sz: 9 }), { before: 1, after: 1, align: i ? 'center' : null }) })
        }))
      case 'cols':
        return table(b.cols.map(function () { return 1 }), [b.cols.map(function (lines) {
          return lines.map(function (segs) { return para(segRuns(segs, { sz: 8 }), { before: 1, after: 1 }) }).join('')
        })])
      case 'box':
        return table([1], [[(b.paras || []).map(function (segs) {
          return para(segRuns(segs, b.red ? { sz: 9, color: 'BE0000' } : null), { before: 2, after: 2 })
        }).join('')]], b.red ? { color: 'BE0000', size: 6 } : { size: 6 })
      case 'pagebreak':
        return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
      default:
        return ''
    }
  }

  /* geo (the FCR's other reports, fcr-docx.js): {ind, width} in twips, the
     letterhead set in from the margin to sit where that report's own did, and
     no room taken under it - the report's text starts close below. */
  function headerXml(geo) {
    var right = ['2411 Crofton Lane, Suite 13A', 'Crofton, MD, 21114-1336', 'Phone: 410-451-9870', 'Fax: 410-451-9872']
      .map(function (t) { return para(run(t, { sz: 11 }), { align: 'right' }) }).join('')
    var left = para(run('CONCUSSION THERAPY GROUP', { b: true, sz: 12 }))
    var o = { noBorders: true, noTrail: true, valign: ['bottom', 'top'] }
    if (geo) { o.width = geo.width; o.ind = geo.ind }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ' + NS + '>' +
      table([1, 1], [[left, right]], o) +
      (geo ? '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>' : para('', { after: 0 })) + '</w:hdr>'
  }
  /* total: the field for "of Y" - NUMPAGES, the whole file's pages, for the
     Day 1 on its own and in the FCR as Word, which numbers its pages from
     first to last. geo: {ind, tab} in twips and text, the footer line as
     another report's PDF wrote it. */
  function footerXml(meta, total, geo) {
    var left = geo && geo.text != null ? geo.text : ['Concussion Therapy Group', meta.provider, meta.name, meta.dob].filter(Boolean).join(' / ')
    var f = { sz: 8 }
    // A full field, every part sized: Word re-draws a simple field's number at the default size.
    var sz = '<w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>'
    var field = function (instr) {
      return '<w:r>' + sz + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + sz + '<w:instrText xml:space="preserve"> ' + instr + ' \\* MERGEFORMAT </w:instrText></w:r>' +
        '<w:r>' + sz + '<w:fldChar w:fldCharType="separate"/></w:r>' + run('1', f) + '<w:r>' + sz + '<w:fldChar w:fldCharType="end"/></w:r>'
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ' + NS + '>' +
      para(run(left, f) + '<w:r><w:tab/></w:r>' + run('Page ', f) + field('PAGE') + run(' of ', f) + field(total || 'NUMPAGES'),
        { tabs: '<w:tabs><w:tab w:val="right" w:pos="' + (geo ? geo.tab : TEXT_W) + '"/></w:tabs>', ind: geo && geo.ind }) + '</w:ftr>'
  }
  function patientBoxXml(meta) {
    var cell = function (label, value) { return para(run(label, { b: true }) + run(value || ''), { before: 2, after: 2 }) }
    return table([1, 1], [[cell('Name: ', meta.name), cell('DOB: ', meta.dob)], [cell('DOI: ', meta.doi), cell('Session Date: ', meta.dos)]], { size: 6, noTrail: true }) +
      para(run('Provider: ', { b: true }) + run(meta.provider || ''), { before: 4, after: 6 })
  }

  function stylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + NS + '>' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>' +
      '<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>' +
      '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
      '</w:styles>'
  }

  /* The report as Word pieces, for this file and for the FCR's Word copy
     (fcr-docx.js), which places it as one section among the other reports.
     Its page numbers carry on from the pages before it: until 19 Oct 2026 an
     FCR section started again at 1 ("Page 2 of 6", SECTIONPAGES - which
     Google Docs cannot count and showed as "of 1"). opts.headerId / footerId:
     relationship ids to use. */
  function parts(record, opts) {
    opts = opts || {}
    var meta = record.meta || {}
    var links = []
    var body = patientBoxXml(meta) + record.map(function (b) { return blockXml(b, links) }).join('')
    var sect = '<w:headerReference w:type="default" r:id="' + (opts.headerId || 'rIdH') + '"/>' +
      '<w:footerReference w:type="default" r:id="' + (opts.footerId || 'rIdF') + '"/>' +
      '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="2100" w:right="960" w:bottom="1000" w:left="960" w:header="600" w:footer="400" w:gutter="0"/>'
    return {
      body: body, sectPrInner: sect, links: links, styles: stylesXml(),
      header: headerXml(), footer: footerXml(meta, 'NUMPAGES')
    }
  }

  function build(record) {
    var pt = parts(record)
    var links = pt.links
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + pt.body +
      '<w:sectPr>' + pt.sectPrInner + '</w:sectPr></w:body></w:document>'
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
      '<Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
      links.map(function (l) {
        return '<Relationship Id="' + l.id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="' + esc(l.url) + '" TargetMode="External"/>'
      }).join('') + '</Relationships>'
    var styles = pt.styles
    var types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '</Types>'
    var root = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'

    return ensureJSZip().then(function (JSZip) {
      var zip = new JSZip()
      zip.file('[Content_Types].xml', types)
      zip.file('_rels/.rels', root)
      zip.file('word/document.xml', doc)
      zip.file('word/_rels/document.xml.rels', rels)
      zip.file('word/styles.xml', styles)
      zip.file('word/header1.xml', pt.header)
      zip.file('word/footer1.xml', pt.footer)
      return zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' })
    })
  }

  function download(record, filename) {
    return build(record).then(function (blob) {
      var url = URL.createObjectURL(blob)
      var a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(function () { URL.revokeObjectURL(url) }, 4000)
    })
  }

  window.ctgDay1Docx = {
    build: build, download: download, parts: parts,
    // The same letterhead and footer for the FCR's other reports (fcr-docx.js).
    letterhead: { header: headerXml, footer: footerXml, styles: stylesXml }
  }
})()
