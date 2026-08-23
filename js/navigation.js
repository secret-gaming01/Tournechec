(function () {
  const NAV_LINKS = [
    { href: "accueil.html", label: "Accueil", page: "accueil" },
    { href: "fonctionnement.html", label: "Fonctionnement", page: "fonctionnement" },
    { href: "s-inscrire-a-un-tournoi.html", label: "S'inscrire à un tournoi", page: "s-inscrire-a-un-tournoi" },
    { href: "creer-un-tournoi.html", label: "Créer un tournoi", page: "creer-un-tournoi" },
    { href: "mes-tournois.html", label: "Mes tournois", page: "mes-tournois" },
    { href: "aide.html", label: "Aide", page: "aide" },
    { href: "a-propos-du-developpeur.html", label: "À propos", page: "a-propos" },
  ];

  const ICON = {
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/></svg>',
    cog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10z"/></svg>',
    chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
  };

  const ROLE_LABEL = { joueur: "Joueur", arbitre: "Arbitre", admin: "Administrateur" };

  function buildHeader() {
    const host = document.getElementById("site-header");
    if (!host) return;
    const current = document.body.dataset.page || "";
    const links = NAV_LINKS.map(
      (l) => `<a class="nav-link${l.page === current ? " active" : ""}" href="${l.href}">${l.label}</a>`
    ).join("");
    host.innerHTML = `
      <header class="site-header">
        <div class="header-inner">
          <a class="brand" href="accueil.html">
            <img src="media/images/logo.svg" alt="Logo Tournechec">
            <span>Tourne<b>chec</b></span>
          </a>
          <nav class="main-nav" id="main-nav">${links}</nav>
          <div class="header-actions">
            <div class="auth-area" id="auth-area"></div>
            <button class="burger" id="burger" aria-label="Ouvrir le menu" aria-expanded="false">
              <span></span><span></span><span></span>
            </button>
          </div>
        </div>
      </header>`;

    const burger = document.getElementById("burger");
    const nav = document.getElementById("main-nav");
    burger.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) {
        nav.classList.remove("open");
        burger.classList.remove("open");
      }
    });
  }

  function renderAuthArea(user) {
    const area = document.getElementById("auth-area");
    if (!area) return;
    if (!user) {
      area.innerHTML = `
        <a class="btn btn-outline btn-sm" href="se-connecter.html">Se connecter</a>
        <a class="btn btn-primary btn-sm" href="s-inscrire.html">S'inscrire</a>`;
      return;
    }
    const initial = (user.name || "?").trim().charAt(0).toUpperCase();
    area.innerHTML = `
      <div class="profile-wrap">
        <button class="profile-btn" id="profile-btn" aria-haspopup="true">
          <span class="avatar">${initial}</span>
          <span class="profile-name">${escapeHtml(user.name.split(" ")[0])}</span>
          ${ICON.chevron}
        </button>
        <div class="profile-menu" id="profile-menu">
          <div class="menu-head">
            <strong>${escapeHtml(user.name)}</strong>
            <small>${ROLE_LABEL[user.role] || user.role} · Elo ${user.elo}</small>
          </div>
          <a href="mes-tournois.html">${ICON.list} Mes tournois</a>
          ${user.role === "admin" ? `<a href="panel-admin.html">${ICON.shield} Panel administrateur</a>` : ""}
          <a href="parametres.html">${ICON.cog} Paramètres</a>
          <button class="danger" id="logout-btn">${ICON.out} Se déconnecter</button>
        </div>
      </div>`;

    const btn = document.getElementById("profile-btn");
    const menu = document.getElementById("profile-menu");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".profile-wrap")) menu.classList.remove("open");
    });
    document.getElementById("logout-btn").addEventListener("click", async () => {
      try {
        await api("/logout", { method: "POST" });
      } catch {}
      window.location.href = "accueil.html";
    });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  window.escapeHtml = escapeHtml;

  function buildFooter() {
    const host = document.getElementById("site-footer");
    if (!host) return;
    host.innerHTML = `
      <footer class="site-footer">
        <div class="container-wide">
          <div class="footer-grid">
            <div>
              <a class="brand" href="accueil.html">
                <img src="media/images/logo.svg" alt="">
                <span>Tourne<b>chec</b></span>
              </a>
              <p class="footer-tagline">Organisez des tournois d'échecs rapidement et efficacement, du club scolaire au grand événement.</p>
            </div>
            <div>
              <h4>Navigation</h4>
              <ul class="footer-links">
                <li><a href="accueil.html">Accueil</a></li>
                <li><a href="fonctionnement.html">Fonctionnement</a></li>
                <li><a href="aide.html">Aide & FAQ</a></li>
                <li><a href="a-propos-du-developpeur.html">À propos du développeur</a></li>
              </ul>
            </div>
            <div>
              <h4>Tournois</h4>
              <ul class="footer-links">
                <li><a href="s-inscrire-a-un-tournoi.html">S'inscrire à un tournoi</a></li>
                <li><a href="creer-un-tournoi.html">Créer un tournoi</a></li>
                <li><a href="mes-tournois.html">Mes tournois</a></li>
                <li><a href="interface-utilisateur.html">Mon espace</a></li>
              </ul>
            </div>
            <div>
              <h4>Contact</h4>
              <div class="footer-contact">
                <span>Une question ou un problème ?</span>
                <a href="aide.html">Consultez la page Aide</a>
                <span>Réponse sous 48 h en période scolaire.</span>
              </div>
            </div>
          </div>
          <div class="footer-bottom">
            <span>© ${new Date().getFullYear()} Tournechec — Tous droits réservés.</span>
            <span class="made">Fait avec passion pour la communauté échiquéenne.</span>
          </div>
        </div>
      </footer>`;
  }

  async function loadUserAndGuard() {
    let user = null;
    try {
      const data = await api("/me");
      user = data.user;
    } catch {}

    window.TC_USER = user;
    document.dispatchEvent(new CustomEvent("tc:user", { detail: user }));
    renderAuthArea(user);

    const needAuth = document.body.dataset.auth === "required";
    const allowedRoles = (document.body.dataset.roles || "").split(",").filter(Boolean);
    if (needAuth && !user) {
      window.location.href = "se-connecter.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
      return;
    }
    if (allowedRoles.length && (!user || !allowedRoles.includes(user.role))) {
      toast(user ? "Accès refusé : cette page est réservée." : "Connecte-toi pour accéder à cette page.", "err");
      setTimeout(() => (window.location.href = user ? "interface-utilisateur.html" : "se-connecter.html"), 900);
    }
  }

  buildHeader();
  buildFooter();
  loadUserAndGuard();
})();
