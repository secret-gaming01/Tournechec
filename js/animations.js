(function () {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          observer.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12 }
  );

  function watchReveals() {
    document.querySelectorAll(".reveal:not(.visible)").forEach((el) => observer.observe(el));
  }

  document.addEventListener("DOMContentLoaded", watchReveals);
  window.watchReveals = watchReveals;

  window.toast = function (message, type) {
    let zone = document.getElementById("toast-zone");
    if (!zone) {
      zone = document.createElement("div");
      zone.id = "toast-zone";
      document.body.appendChild(zone);
    }
    const t = document.createElement("div");
    t.className = "toast" + (type === "ok" ? " ok" : type === "err" ? " err" : "");
    t.textContent = message;
    zone.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    }, 3800);
  };

  document.addEventListener("click", (ev) => {
    const faqBtn = ev.target.closest(".faq-q");
    if (faqBtn) {
      const item = faqBtn.closest(".faq-item");
      const answer = item.querySelector(".faq-a");
      const open = item.classList.toggle("open");
      answer.style.maxHeight = open ? answer.scrollHeight + "px" : "0";
      return;
    }

    const btn = ev.target.closest(".btn, .panel-tab, .profile-btn, .action-tile");
    if (btn && !btn.disabled) {
      btn.animate(
        [{ transform: "scale(1)" }, { transform: "scale(0.97)" }, { transform: "scale(1)" }],
        { duration: 180, easing: "ease-out" }
      );
    }
  });

  window.openModal = function (id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add("open");
    document.body.style.overflow = "hidden";
  };
  window.closeModal = function (id) {
    const m = typeof id === "string" ? document.getElementById(id) : id;
    if (!m) return;
    m.classList.remove("open");
    document.body.style.overflow = "";
  };
  document.addEventListener("click", (ev) => {
    if (ev.target.classList && ev.target.classList.contains("modal-overlay")) closeModal(ev.target);
    if (ev.target.closest && ev.target.closest("[data-close-modal]")) {
      closeModal(ev.target.closest(".modal-overlay"));
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach(closeModal);
  });

  window.confirmAction = function (message) {
    return window.confirm(message + "\n\nConfirmer cette action ?");
  };

  window.animateCounters = function () {
    document.querySelectorAll("[data-count]").forEach((el) => {
      const target = parseFloat(el.dataset.count);
      const decimals = (String(el.dataset.count).split(".")[1] || "").length;
      const dur = 1100;
      const start = performance.now();
      function tick(now) {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (target * eased).toFixed(decimals);
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  };
})();
