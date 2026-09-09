/* Tournechec (c) 2026 secret_gaming01 - Logiciel propriétaire. Copie, modification et déploiement interdits. Voir LICENSE.txt. */
(function () {
  const RESULT_LABEL = { "1-0": "1 - 0", "0-1": "0 - 1", "1/2": "½ - ½", bye: "Bye" };
  function step() { return window.BRACKET_STEP || 94; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function outcome(m) {
    if (!m || !m.result) return { winner: null, loser: null, draw: false, bye: false };
    if (m.result === "1/2") return { winner: null, loser: null, draw: true, bye: false };
    if (m.result === "bye") return { winner: m.white || null, loser: null, draw: false, bye: true };
    const winWhite = m.result === "1-0";
    return {
      winner: winWhite ? m.white : m.black,
      loser: winWhite ? m.black : m.white,
      draw: false,
      bye: false,
    };
  }

  window.matchOutcome = outcome;

  window.resultLabel = function (r) {
    return RESULT_LABEL[r] || "À jouer";
  };

  function playerBox(p, colorClass, cls) {
    if (!p) return '<div class="b-player b-empty">—</div>';
    const mark = cls === "b-win"
      ? '<span class="b-mark">✓</span>'
      : cls === "b-loss"
        ? '<span class="b-mark loss">✗</span>'
        : cls === "b-draw"
          ? '<span class="b-mark draw">=</span>'
          : "";
    return `<div class="b-player ${cls}">${mark}<span class="color-dot ${colorClass}"></span><span class="b-name">${esc(p.name)}</span><small>${p.elo != null ? p.elo : ""}</small></div>`;
  }

  function matchBox(m, top) {
    const w = m.white, b = m.black;
    const out = outcome(m);
    let wCls = "";
    let bCls = "";
    if (out.draw) { wCls = "b-draw"; bCls = "b-draw"; }
    else if (out.bye) { wCls = "b-win"; }
    else if (out.winner) {
      wCls = out.winner.id === (w && w.id) ? "b-win" : "b-loss";
      bCls = out.winner.id === (b && b.id) ? "b-win" : "b-loss";
    }
    let inner;
    if (out.bye) {
      inner = playerBox(w, "color-w", "b-win") + '<div class="b-player b-bye">Exempt (bye) · +1 point</div>';
    } else {
      inner = playerBox(w, "color-w", wCls)
        + '<div class="b-vs">Table ' + m.table_number + " · " + (RESULT_LABEL[m.result] || "À jouer") + "</div>"
        + playerBox(b, "color-b", bCls);
    }
    return '<div class="b-match" style="margin-top:' + top + 'px;">' + inner + "</div>";
  }

  window.renderBracketHTML = function (rounds, opts) {
    opts = opts || {};
    if (!rounds || !rounds.length) {
      return '<div class="card"><p class="muted text-center" style="padding:24px;">Les tables de la première ronde n\'ont pas encore été générées.</p></div>';
    }
    let prevTops = null;
    const cols = rounds.map(function (round, ri) {
      let tops;
      if (ri === 0) {
        tops = round.matches.map(function (_, i) { return i * step(); });
      } else {
        tops = round.matches.map(function (_, j) {
          return ((prevTops[2 * j] || 0) + (prevTops[2 * j + 1] || 0)) / 2;
        });
      }
      prevTops = tops;
      return '<div class="b-col"><div class="b-round-label">Ronde ' + round.round_number + "</div>"
        + round.matches.map(function (m, mi) { return matchBox(m, tops[mi]); }).join("") + "</div>";
    }).join("");
    const style = opts.paddingTop ? ' style="padding-top:' + opts.paddingTop + 'px;"' : "";
    return '<div class="bracket"' + style + ">" + cols + "</div>";
  };

  window.vsSideClass = function (side, m) {
    const out = outcome(m);
    if (out.draw) return "draw";
    if (out.bye) return side === "w" ? "win" : "";
    if (!out.winner) return "";
    const winIs = out.winner.id === (side === "w" ? (m.white && m.white.id) : (m.black && m.black.id));
    return winIs ? "win" : "loss";
  };
})();