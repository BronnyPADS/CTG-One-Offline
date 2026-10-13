/* How a patient's Notes Form records are read.
 *
 * The Notes Form app saves each exercise as its own record the moment it is
 * finished, so a single session arrives as a handful of fragments - a few
 * weeks of care came back as twenty-eight of them. A day, not a record, is
 * the unit the practice thinks in, so the records are gathered back into the
 * day they belong to.
 *
 * Inside a day they keep the order they were saved: earliest at the top,
 * latest at the bottom, the order the session was actually worked through.
 * The time is never shown - it decides the order and nothing else. Days run
 * oldest first for the same reason: read top to bottom and you read the
 * course of treatment forwards.
 *
 * This lives in its own file because the chart panel and the Notes Form API
 * bench both show it. Two copies of an ordering rule is two answers to the
 * same clinical question the first time somebody edits one of them.
 */
(function () {
  'use strict';

  var UNDATED = 'undated';

  function group(notes) {
    var by = {};
    var order = [];
    (notes || []).forEach(function (n) {
      var day = (n && n.day) || String((n && n.date) || '').slice(0, 10) || UNDATED;
      if (!by[day]) { by[day] = []; order.push(day); }
      by[day].push(n);
    });
    /* A record with no readable date cannot be placed in the run of
       treatment. It goes last, under its own heading, rather than being
       dropped or silently sorted to 1970. */
    var days = order.filter(function (d) { return d !== UNDATED; }).sort();
    if (by[UNDATED]) days.push(UNDATED);
    return days.map(function (day) {
      return {
        day: day,
        label: day === UNDATED ? 'Date not recorded' : dayLabel(day),
        notes: by[day].slice().sort(bySaved)
      };
    });
  }

  function bySaved(a, b) {
    var ta = Date.parse((a && (a.at || a.date)) || '');
    var tb = Date.parse((b && (b.at || b.date)) || '');
    // Unparseable either side: leave them where they came, which is the
    // order the other system listed them in.
    if (isNaN(ta) || isNaN(tb)) return 0;
    return ta - tb;
  }

  /* Built from the date's own characters. `new Date('2026-09-20')` is
     midnight UTC, which prints as the 19th anywhere west of Greenwich. */
  function dayLabel(day) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
    if (!p) return String(day || '');
    var d = new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3]));
    if (isNaN(d.getTime())) return String(day);
    try {
      return d.toLocaleDateString('en-US',
        { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } catch (e) { return String(day); }
  }

  window.ctgNotesByDay = { group: group, dayLabel: dayLabel };
})();
