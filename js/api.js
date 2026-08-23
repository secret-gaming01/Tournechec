(function () {
  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status || 400;
    }
  }

  let client = null;
  try {
    const cfg = window.TOURNECHEC_CONFIG;
    if (
      typeof supabase !== "undefined" &&
      cfg &&
      cfg.SUPABASE_URL &&
      !cfg.SUPABASE_URL.includes("REMPLACE_MOI") &&
      cfg.SUPABASE_ANON_KEY &&
      !cfg.SUPABASE_ANON_KEY.includes("REMPLACE_MOI")
    ) {
      client = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    } else {
      console.warn("Tournechec : configure js/config.js avec tes informations Supabase.");
    }
  } catch (e) {
    console.error("Erreur d'initialisation Supabase :", e);
  }

  function needClient() {
    if (!client) throw new ApiError("Le site n'est pas encore configuré : édite js/config.js avec tes clés Supabase.", 500);
  }

  async function q(builder, friendlyMessage) {
    needClient();
    const { data, error } = await builder();
    if (error) {
      const msg =
        friendlyMessage && /security|permission|row-level|JWT/i.test(error.message)
          ? friendlyMessage
          : error.message;
      throw new ApiError(msg, 400);
    }
    return data;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function mapProfile(p) {
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      school_year: p.school_year,
      elo: p.elo,
      role: p.role,
      banned: !!p.banned,
      created_at: new Date(p.created_at).getTime(),
    };
  }

  async function fetchProfile(uid) {
    const row = await q(() => client.from("profiles").select("*").eq("id", uid).maybeSingle());
    return mapProfile(row);
  }

  async function waitForProfile(uid) {
    for (let i = 0; i < 8; i++) {
      const p = await fetchProfile(uid);
      if (p) return p;
      await sleep(350);
    }
    return null;
  }

  async function currentUser() {
    needClient();
    const { data } = await client.auth.getUser();
    const authUser = data ? data.user : null;
    if (!authUser) return null;
    const profile = await waitForProfile(authUser.id);
    if (!profile) return null;
    if (profile.banned) {
      await client.auth.signOut();
      return null;
    }
    return profile;
  }

  async function requireUser() {
    const u = await currentUser();
    if (!u) throw new ApiError("Connecte-toi pour effectuer cette action.", 401);
    return u;
  }

  async function requireAdmin() {
    const u = await requireUser();
    if (u.role !== "admin") throw new ApiError("Accès réservé aux administrateurs.", 403);
    return u;
  }

  async function loadTournament(tid) {
    const t = await q(() => client.from("tournaments").select("*").eq("id", tid).maybeSingle());
    if (!t) throw new ApiError("Tournoi introuvable ou privé.", 404);
    return t;
  }

  async function arbitreIdsOf(tid) {
    const rows = await q(() => client.from("tournament_arbitres").select("user_id").eq("tournament_id", tid));
    return (rows || []).map((r) => r.user_id);
  }

  async function canManageTournament(user, tid, creatorId) {
    if (!user) return false;
    if (user.role === "admin") return true;
    const ids = await arbitreIdsOf(tid);
    return ids.includes(user.id) || (!!creatorId && creatorId === user.id);
  }

  async function profilesMap(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    const map = new Map();
    if (!unique.length) return map;
    const rows = await q(() =>
      client.from("profiles").select("id,name,email,elo,school_year,role").in("id", unique)
    );
    for (const r of rows || []) map.set(r.id, r);
    return map;
  }

  async function assertCurrentPassword(email, password) {
    needClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new ApiError("Mot de passe actuel incorrect.", 403);
  }

  function computeStandings(players, history) {
    const map = new Map();
    const opponents = new Map();
    for (const p of players) {
      map.set(p.id, { id: p.id, name: p.name, elo: p.elo, points: 0, wins: 0, draws: 0, losses: 0, played: 0 });
    }
    for (const m of history) {
      if (m.result === "bye") {
        const w = map.get(m.white_id);
        if (w) { w.points += 1; w.played += 1; }
        continue;
      }
      const w = map.get(m.white_id);
      const b = map.get(m.black_id);
      if (!w || !b) continue;
      w.played += 1; b.played += 1;
      if (!opponents.has(w.id)) opponents.set(w.id, []);
      if (!opponents.has(b.id)) opponents.set(b.id, []);
      opponents.get(w.id).push(b.id);
      opponents.get(b.id).push(w.id);
      if (m.result === "1-0") { w.points += 1; w.wins += 1; b.losses += 1; }
      else if (m.result === "0-1") { b.points += 1; b.wins += 1; w.losses += 1; }
      else if (m.result === "1/2") { w.points += 0.5; b.points += 0.5; w.draws += 1; b.draws += 1; }
    }
    for (const row of map.values()) {
      let bz = 0;
      for (const oid of opponents.get(row.id) || []) {
        const o = map.get(oid);
        if (o) bz += o.points;
      }
      row.buchholz = Math.round(bz * 10) / 10;
    }
    return Array.from(map.values()).sort(
      (a, b) => b.points - a.points || b.buchholz - a.buchholz || b.elo - a.elo || a.name.localeCompare(b.name)
    );
  }

  function playerStats(players, history) {
    const stats = new Map();
    for (const p of players) {
      stats.set(p.id, { ...p, score: 0, whites: 0, played: new Set() });
    }
    for (const m of history) {
      const w = stats.get(m.white_id);
      if (!w) continue;
      if (m.result === "bye") { w.score += 1; continue; }
      const b = stats.get(m.black_id);
      if (!b) continue;
      w.played.add(b.id); b.played.add(w.id);
      w.whites += 1;
      if (m.result === "1-0") w.score += 1;
      else if (m.result === "0-1") b.score += 1;
      else if (m.result === "1/2") { w.score += 0.5; b.score += 0.5; }
    }
    return Array.from(stats.values());
  }

  function buildSwissPairs(players) {
    const remaining = [...players].sort((a, b) => b.score - a.score || b.elo - a.elo);
    const pairs = [];
    while (remaining.length > 1) {
      const a = remaining.shift();
      let idx = remaining.findIndex((o) => !a.played.has(o.id));
      if (idx === -1) idx = 0;
      const b = remaining.splice(idx, 1)[0];
      let white = a, black = b;
      if (a.whites > b.whites) { white = b; black = a; }
      else if (a.whites === b.whites && Math.random() < 0.5) { white = b; black = a; }
      pairs.push({ white, black });
    }
    if (remaining.length === 1) pairs.push({ white: remaining[0], black: null });
    return pairs;
  }

  function buildEliminationFirstPairs(players) {
    const sorted = [...players].sort((a, b) => b.elo - a.elo);
    let size = 2;
    while (size < sorted.length) size *= 2;
    const padded = [...sorted];
    while (padded.length < size) padded.push(null);
    const pairs = [];
    for (let i = 0; i < size / 2; i++) {
      pairs.push({ white: padded[i] || null, black: padded[size - 1 - i] || null });
    }
    return pairs.filter((p) => p.white || p.black);
  }

  async function notify(userId, recipientName, subject, bodyText, kind) {
    await q(() =>
      client.from("notifications").insert({
        user_id: userId || null,
        recipient_name: recipientName || "",
        email: "",
        subject,
        body: bodyText || "",
        kind: kind || "auto",
      })
    );
  }

  async function registrationRows(tid) {
    const regs = await q(() => client.from("registrations").select("*").eq("tournament_id", tid));
    const map = await profilesMap((regs || []).map((r) => r.user_id));
    return (regs || [])
      .map((r) => {
        const p = map.get(r.user_id) || {};
        return {
          id: r.user_id,
          name: p.name || "?",
          email: p.email || "",
          elo: p.elo != null ? p.elo : 1200,
          school_year: p.school_year || "",
          present: !!r.present,
          registered_at: new Date(r.registered_at).getTime(),
        };
      })
      .sort((a, b) => b.elo - a.elo);
  }

  async function roundsWithMatches(tid) {
    const rounds = await q(() =>
      client.from("rounds").select("*").eq("tournament_id", tid).order("round_number", { ascending: true })
    );
    if (!(rounds || []).length) return { rounds: [], allMatches: [] };
    const roundIds = rounds.map((r) => r.id);
    const matches = await q(() =>
      client.from("matches").select("*").in("round_id", roundIds).order("table_number")
    );
    const all = matches || [];
    const ids = [];
    for (const m of all) { ids.push(m.white_id); ids.push(m.black_id); }
    const pm = await profilesMap(ids);
    const outRounds = rounds.map((r) => ({
      id: r.id,
      round_number: r.round_number,
      matches: all
        .filter((m) => m.round_id === r.id)
        .sort((a, b) => a.table_number - b.table_number)
        .map((m) => {
          const w = m.white_id ? pm.get(m.white_id) : null;
          const b = m.black_id ? pm.get(m.black_id) : null;
          return {
            id: m.id,
            table_number: m.table_number,
            white: w ? { id: w.id, name: w.name, elo: w.elo } : null,
            black: b ? { id: b.id, name: b.name, elo: b.elo } : null,
            result: m.result,
          };
        }),
    }));
    const flat = all.map((m) => ({ white_id: m.white_id, black_id: m.black_id, result: m.result }));
    return { rounds: outRounds, allMatches: flat };
  }

  async function attachCounts(list) {
    const regs = await q(() => client.from("registrations").select("tournament_id"));
    const counts = {};
    for (const r of regs || []) counts[r.tournament_id] = (counts[r.tournament_id] || 0) + 1;
    return (list || []).map((t) => ({ ...t, public: !!t.public, participants: counts[t.id] || 0 }));
  }

  async function api(path, options) {
    options = options || {};
    const method = (options.method || "GET").toUpperCase();
    const body = options.body || {};
    const seg = String(path).split("/").filter(Boolean);

    if (!client) {
      throw new ApiError("Configure js/config.js avec ton URL et ta clé publique Supabase, puis recharge la page.", 500);
    }

    const numOrNull = (s) => (/^\d+$/.test(String(s)) ? Number(s) : null);

    if (seg[0] === "me" && method === "GET") {
      return { user: await currentUser() };
    }

    if (seg[0] === "register" && method === "POST") {
      if (body.hp_website) throw new ApiError("Requête refusée par le système anti-robot.");
      const name = String(body.name || "").trim().slice(0, 80);
      const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
      const password = String(body.password || "");
      if (name.length < 2) throw new ApiError("Entre ton nom complet.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError("Adresse courriel invalide.");
      if (password.length < 8) throw new ApiError("Le mot de passe doit contenir au moins 8 caractères.");
      if (password !== String(body.password2 || "")) throw new ApiError("Les deux mots de passe ne correspondent pas.");
      needClient();
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            school_year: String(body.school_year || "").slice(0, 40),
            elo: Math.min(3500, Math.max(0, parseInt(body.elo, 10) || 1200)),
          },
        },
      });
      if (error) {
        if (/already registered|duplicate/i.test(error.message)) throw new ApiError("Un compte existe déjà avec ce courriel.", 409);
        throw new ApiError(error.message);
      }
      if (!data.session) {
        throw new ApiError(
          "Compte créé ! Va cliquer sur le lien de confirmation envoyé dans ta boîte courriel, puis connecte-toi.",
          202
        );
      }
      return { user: await waitForProfile(data.user.id) };
    }

    if (seg[0] === "login" && method === "POST") {
      needClient();
      const email = String(body.email || "").trim().toLowerCase();
      const { error } = await client.auth.signInWithPassword({ email, password: String(body.password || "") });
      if (error) {
        if (/invalid login credentials/i.test(error.message)) throw new ApiError("Courriel ou mot de passe incorrect.", 401);
        if (/confirm/i.test(error.message)) throw new ApiError("Confirme d'abord ton adresse via le courriel reçu à l'inscription.", 403);
        throw new ApiError(error.message, 401);
      }
      const user = await currentUser();
      if (!user) throw new ApiError("Ce compte est banni ou indisponible.", 403);
      return { user };
    }

    if (seg[0] === "logout" && method === "POST") {
      needClient();
      await client.auth.signOut();
      return { ok: true };
    }

    if (seg[0] === "profile" && method === "PUT") {
      const user = await requireUser();
      const updates = {};
      if (typeof body.name === "string") updates.name = body.name.trim().slice(0, 80);
      if (typeof body.school_year === "string") updates.school_year = body.school_year.slice(0, 40);
      if (body.elo !== undefined) updates.elo = Math.min(3500, Math.max(0, parseInt(body.elo, 10) || 1200));
      const wantsEmailChange = typeof body.email === "string" && body.email.trim().toLowerCase() !== user.email;
      const wantsPasswordChange = typeof body.new_password === "string" && body.new_password.length > 0;

      if (wantsPasswordChange) {
        if (body.new_password.length < 8) throw new ApiError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
        await assertCurrentPassword(user.email, String(body.current_password || ""));
        const { error } = await client.auth.updateUser({ password: body.new_password });
        if (error) throw new ApiError(error.message);
      }
      if (wantsEmailChange) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) throw new ApiError("Nouvelle adresse courriel invalide.");
        if (!wantsPasswordChange) await assertCurrentPassword(user.email, String(body.current_password || ""));
        const { error } = await client.auth.updateUser({ email: body.email.trim().toLowerCase() });
        if (error) throw new ApiError(error.message);
        updates.email = body.email.trim().toLowerCase();
      }
      if (Object.keys(updates).length) {
        await q(() => client.from("profiles").update(updates).eq("id", user.id), "Modification non autorisée.");
      }
      return { user: { ...user, ...updates } };
    }

    if (seg[0] === "account" && method === "DELETE") {
      const user = await requireUser();
      await assertCurrentPassword(user.email, String(body.password || ""));
      await q(() => client.from("profiles").delete().eq("id", user.id), "Suppression non autorisée.");
      await client.auth.signOut();
      return { ok: true };
    }

    if (seg[0] === "support" && method === "POST") {
      if (body.hp_website) throw new ApiError("Requête refusée par le système anti-robot.");
      const message = String(body.message || "").trim().slice(0, 3000);
      const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10) {
        throw new ApiError("Remplis correctement le formulaire (message de 10 caractères minimum).");
      }
      await q(() =>
        client.from("support_messages").insert({
          name: String(body.name || "").trim().slice(0, 80),
          email,
          message,
        })
      );
      return { ok: true };
    }

    if (seg[0] === "my-tournaments" && method === "GET") {
      const user = await requireUser();
      const regs = await q(() => client.from("registrations").select("tournament_id,present").eq("user_id", user.id));
      const arb = await q(() => client.from("tournament_arbitres").select("tournament_id").eq("user_id", user.id));
      const joueurIds = (regs || []).map((r) => r.tournament_id);
      const arbIds = [...new Set((arb || []).map((a) => a.tournament_id))];
      const allIds = [...new Set([...joueurIds, ...arbIds])];
      let tList = [];
      if (allIds.length) {
        tList = await q(() =>
          client.from("tournaments").select("*").in("id", allIds).order("created_at", { ascending: false })
        );
      }
      const byId = new Map((tList || []).map((t) => [t.id, t]));
      const presentByTid = new Map((regs || []).map((r) => [r.tournament_id, r.present]));
      return {
        joueur: joueurIds.map((id) => byId.get(id)).filter(Boolean).map((t) => ({ ...t, public: !!t.public, present: presentByTid.get(t.id) })),
        arbitre: arbIds.map((id) => byId.get(id)).filter(Boolean).map((t) => ({ ...t, public: !!t.public })),
      };
    }

    if (seg[0] === "tournaments") {
      if (!seg[1] && method === "GET") {
        const publics = await q(() =>
          client.from("tournaments").select("*").eq("public", true).order("created_at", { ascending: false })
        );
        const user = await currentUser();
        let prives = [];
        if (user) {
          prives = await q(() =>
            client.from("tournaments").select("*").eq("public", false).order("created_at", { ascending: false })
          );
        }
        return {
          tournaments: await attachCounts(publics || []),
          prive_tournaments: await attachCounts(prives),
          user,
        };
      }

      if (!seg[1] && method === "POST") {
        const user = await requireUser();
        const name = String(body.name || "").trim().slice(0, 120);
        if (name.length < 3) throw new ApiError("Le nom du tournoi doit faire au moins 3 caractères.");
        const inserted = await q(
          () =>
            client
              .from("tournaments")
              .insert({
                name,
                description: String(body.description || "").slice(0, 3000),
                rules: String(body.rules || "").slice(0, 6000),
                location: String(body.location || "").slice(0, 160),
                start_date: String(body.start_date || "").slice(0, 30),
                end_date: String(body.end_date || "").slice(0, 30),
                format: body.format === "elimination" ? "elimination" : "suisse",
                max_rounds: Math.min(15, Math.max(1, parseInt(body.max_rounds, 10) || 7)),
                status: "brouillon",
                public: body.public !== false,
                creator_id: user.id,
              })
              .select("id")
              .single(),
          "Création non autorisée."
        );
        const tid = inserted.id;
        await q(() => client.from("tournament_arbitres").insert({ tournament_id: tid, user_id: user.id }));
        return { id: tid };
      }

      const tid = numOrNull(seg[1]);
      if (!tid) throw new ApiError("Tournoi introuvable.", 404);

      if (!seg[2] && method === "GET") {
        const t = await loadTournament(tid);
        const user = await currentUser();
        const arbIds = await arbitreIdsOf(tid);
        const arbProfiles = Object.values((await profilesMap(arbIds)) || {});
        const manage = await canManageTournament(user, tid, t.creator_id);
        const participants = await registrationRows(tid);
        const isParticipant = user ? participants.some((p) => p.id === user.id) : false;
        const { rounds, allMatches } = await roundsWithMatches(tid);
        const standings = computeStandings(participants, allMatches);
        return {
          tournament: {
            id: t.id,
            name: t.name,
            description: t.description,
            rules: t.rules,
            location: t.location,
            start_date: t.start_date,
            end_date: t.end_date,
            format: t.format,
            max_rounds: t.max_rounds,
            status: t.status,
            public: !!t.public,
            current_round: t.current_round,
            creator_id: t.creator_id,
            champion: t.champion || "",
          },
          arbitres: arbProfiles.map((a) => ({ id: a.id, name: a.name, email: a.email })),
          participants,
          rounds,
          standings,
          can_manage: manage,
          is_participant: isParticipant,
        };
      }

      if (!seg[2] && method === "PUT") {
        const user = await requireUser();
        const t = await loadTournament(tid);
        if (!(await canManageTournament(user, tid, t.creator_id))) throw new ApiError("Réservé aux arbitres de ce tournoi.", 403);
        const fields = {};
        if (typeof body.name === "string") fields.name = body.name.trim().slice(0, 120);
        if (typeof body.description === "string") fields.description = body.description.slice(0, 3000);
        if (typeof body.rules === "string") fields.rules = body.rules.slice(0, 6000);
        if (typeof body.location === "string") fields.location = body.location.slice(0, 160);
        if (typeof body.start_date === "string") fields.start_date = body.start_date.slice(0, 30);
        if (typeof body.end_date === "string") fields.end_date = body.end_date.slice(0, 30);
        if (body.format === "suisse" || body.format === "elimination") fields.format = body.format;
        if (body.max_rounds !== undefined) fields.max_rounds = Math.min(15, Math.max(1, parseInt(body.max_rounds, 10) || 7));
        if (body.public !== undefined) fields.public = !!body.public;
        if (typeof body.champion === "string") fields.champion = body.champion.slice(0, 120);
        if (Object.keys(fields).length === 0) throw new ApiError("Aucune modification fournie.");
        await q(() => client.from("tournaments").update(fields).eq("id", tid), "Modification non autorisée.");
        return { ok: true };
      }

      if (!seg[2] && method === "DELETE") {
        const user = await requireUser();
        const t = await loadTournament(tid);
        if (user.role !== "admin" && t.creator_id !== user.id) {
          throw new ApiError("Seul un administrateur ou le créateur peut supprimer ce tournoi.", 403);
        }
        await q(() => client.from("tournaments").delete().eq("id", tid), "Suppression non autorisée.");
        return { ok: true };
      }

      if (seg[2] === "join" && method === "POST") {
        const user = await requireUser();
        const t = await loadTournament(tid);
        if (!t.public) throw new ApiError("Ce tournoi est privé : l'arbitre doit ajouter les joueurs manuellement.", 403);
        if (t.status === "termine") throw new ApiError("Ce tournoi est terminé.");
        if (!body.accept_rules) throw new ApiError("Tu dois lire et accepter les règlements.");
        const existing = await q(() =>
          client.from("registrations").select("id").eq("tournament_id", tid).eq("user_id", user.id).maybeSingle()
        );
        if (existing) throw new ApiError("Tu es déjà inscrit à ce tournoi.", 409);
        await q(
          () =>
            client.from("registrations").insert({
              tournament_id: tid,
              user_id: user.id,
              registered_at: new Date().toISOString(),
              present: true,
            }),
          "Inscription non autorisée."
        );
        await notify(
          user.id,
          user.name,
          "Inscription confirmée : " + t.name,
          "Bonjour " + user.name + ", ton inscription au tournoi « " + t.name + " » (" + (t.location || "lieu à confirmer") + ") est confirmée. Tu recevras une notification dès que les tables seront publiées."
        );
        return { ok: true };
      }

      if (seg[2] === "join" && method === "DELETE") {
        const user = await requireUser();
        const t = await loadTournament(tid);
        const anyRound = await q(() => client.from("rounds").select("id").eq("tournament_id", tid).limit(1));
        if ((anyRound || []).length > 0 && t.status !== "brouillon") {
          throw new ApiError("Les rondes ont commencé : demande à l'arbitre pour te retirer.");
        }
        await q(() => client.from("registrations").delete().eq("tournament_id", tid).eq("user_id", user.id));
        return { ok: true };
      }

      if (seg[2] === "participants" && method === "POST") {
        const user = await requireUser();
        const t = await loadTournament(tid);
        if (!(await canManageTournament(user, tid, t.creator_id))) throw new ApiError("Réservé aux arbitres de ce tournoi.", 403);
        const action = String(body.action || "");
        if (action === "add") {
          const target = await q(() =>
            client.from("profiles").select("id,name,email").eq("email", String(body.email || "").trim().toLowerCase()).maybeSingle()
          );
          if (!target) throw new ApiError("Aucun compte trouvé avec ce courriel.", 404);
          const dup = await q(() =>
            client.from("registrations").select("id").eq("tournament_id", tid).eq("user_id", target.id).maybeSingle()
          );
          if (dup) throw new ApiError("Ce joueur est déjà inscrit.", 409);
          await q(
            () =>
              client.from("registrations").insert({
                tournament_id: tid,
                user_id: target.id,
                registered_at: new Date().toISOString(),
                present: true,
              }),
            "Ajout non autorisé."
          );
          await notify(target.id, target.name, "Invitation : " + t.name, "Bonjour " + target.name + ", l'arbitre t'a ajouté au tournoi « " + t.name + " » (" + (t.location || "lieu à confirmer") + ").");
          return { ok: true };
        }
        if (action === "remove") {
          await q(() => client.from("registrations").delete().eq("tournament_id", tid).eq("user_id", body.user_id));
          return { ok: true };
        }
        if (action === "update") {
          if (body.elo !== undefined) {
            await q(
              () =>
                client
                  .from("profiles")
                  .update({ elo: Math.min(3500, Math.max(0, parseInt(body.elo, 10) || 1200)) })
                  .eq("id", body.user_id),
              "Modification de l'Elo non autorisée pour ce joueur."
            );
          }
          if (body.present !== undefined) {
            await q(() =>
              client.from("registrations").update({ present: !!body.present }).eq("tournament_id", tid).eq("user_id", body.user_id)
            );
          }
          return { ok: true };
        }
        throw new ApiError("Action inconnue.");
      }

      if (seg[2] === "presence" && method === "POST") {
        const user = await requireUser();
        const t = await loadTournament(tid);
        if (!(await canManageTournament(user, tid, t.creator_id))) throw new ApiError("Réservé aux arbitres de ce tournoi.", 403);
        await q(() =>
          client.from("registrations").update({ present: !!body.present }).eq("tournament_id", tid).eq("user_id", body.user_id)
        );
        return { ok: true };
      }

      if (seg[2] === "arbitres" && method === "POST") {
        const user = await requireUser();
        const t = await loadTournament(tid);
        if (user.role !== "admin" && t.creator_id !== user.id) {
          throw new ApiError("Seul le créateur du tournoi ou un administrateur peut gérer les arbitres.", 403);
        }
        const action = String(body.action || "");
        let target = null;
        if (body.user_id) {
          target = await q(() => client.from("profiles").select("id,name,email").eq("id", body.user_id).maybeSingle());
        } else if (body.email) {
          target = await q(() =>
            client.from("profiles").select("id,name,email").eq("email", String(body.email).trim().toLowerCase()).maybeSingle()
          );
        }
        if (!target) throw new ApiError("Arbitre introuvable.", 404);
        if (action === "add") {
          const dup = await q(() =>
            client.from("tournament_arbitres").select("user_id").eq("tournament_id", tid).eq("user_id", target.id).maybeSingle()
          );
          if (!dup) {
            await q(() => client.from("tournament_arbitres").insert({ tournament_id: tid, user_id: target.id }), "Ajout non autorisé.");
          }
        } else if (action === "remove") {
          if (target.id === t.creator_id && user.role !== "admin") throw new ApiError("Impossible de retirer le créateur.");
          await q(() => client.from("tournament_arbitres").delete().eq("tournament_id", tid).eq("user_id", target.id), "Retrait non autorisé.");
        } else {
          throw new ApiError("Action inconnue.");
        }
        return { ok: true };
      }

      if (seg[2] === "generate" && method === "POST") {
        const user = await requireUser();
        const t = await loadTournament(tid);
        if (!(await canManageTournament(user, tid, t.creator_id))) throw new ApiError("Réservé aux arbitres de ce tournoi.", 403);
        if (t.status === "termine") throw new ApiError("Ce tournoi est terminé.");

        const regs = await q(() =>
          client.from("registrations").select("user_id").eq("tournament_id", tid).eq("present", true)
        );
        const playersRaw = await profilesMap((regs || []).map((r) => r.user_id));
        const players = [...playersRaw.values()].map((p) => ({ id: p.id, name: p.name, elo: p.elo }));
        if (players.length < 2) throw new ApiError("Il faut au moins 2 joueurs présents pour générer des tables.");

        const lastRound = await q(() =>
          client.from("rounds").select("*").eq("tournament_id", tid).order("round_number", { ascending: false }).limit(1).maybeSingle()
        );

        let pairs;
        let roundNumber;
        if (!lastRound) {
          roundNumber = 1;
          pairs =
            t.format === "elimination"
              ? buildEliminationFirstPairs(players)
              : buildSwissPairs(playerStats(players, []));
        } else {
          roundNumber = lastRound.round_number + 1;
          const unfinished = await q(() =>
            client.from("matches").select("id").eq("round_id", lastRound.id).is("result", null)
          );
          if ((unfinished || []).length > 0) {
            throw new ApiError("Tous les pointages de la ronde actuelle doivent être entrés avant de générer la suivante.");
          }
          if (t.format === "elimination") {
            const ms = await q(() => client.from("matches").select("*").eq("round_id", lastRound.id).order("table_number"));
            const byId = new Map(players.map((p) => [p.id, p]));
            const winners = (ms || [])
              .map((m) => (m.result === "0-1" ? m.black_id : m.white_id))
              .map((id) => byId.get(id))
              .filter(Boolean);
            if (winners.length <= 1) throw new ApiError("Le vainqueur est déjà déterminé : termine le tournoi.");
            pairs = [];
            for (let i = 0; i < winners.length; i += 2) {
              pairs.push({ white: winners[i], black: winners[i + 1] || null });
            }
          } else {
            if (lastRound.round_number >= t.max_rounds) {
              throw new ApiError("Nombre maximal de rondes (" + t.max_rounds + ") atteint : termine le tournoi.");
            }
            const histRounds = await q(() => client.from("rounds").select("id").eq("tournament_id", tid));
            const histMatches = await q(() =>
              client.from("matches").select("white_id,black_id,result").in("round_id", (histRounds || []).map((r) => r.id))
            );
            pairs = buildSwissPairs(playerStats(players, histMatches || []));
          }
        }

        const newRound = await q(
          () => client.from("rounds").insert({ tournament_id: tid, round_number: roundNumber }).select("id").single(),
          "Génération non autorisée."
        );
        const matchRows = pairs.map((p, i) => ({
          round_id: newRound.id,
          table_number: i + 1,
          white_id: p.white ? p.white.id : null,
          black_id: p.black ? p.black.id : null,
          result: p.black ? null : "bye",
        }));
        await q(() => client.from("matches").insert(matchRows), "Création des tables non autorisée.");
        const nextStatus = t.status === "brouillon" ? "publie" : t.status;
        await q(() => client.from("tournaments").update({ current_round: roundNumber, status: nextStatus }).eq("id", tid));
        return { round: roundNumber, tables: pairs.length };
      }

      if (seg[2] === "publish" && method === "POST") {
        const user = await requireUser();
        const t = await loadTournament(tid);
        if (!(await canManageTournament(user, tid, t.creator_id))) throw new ApiError("Réservé aux arbitres de ce tournoi.", 403);
        const lastRound = await q(() =>
          client.from("rounds").select("*").eq("tournament_id", tid).order("round_number", { ascending: false }).limit(1).maybeSingle()
        );
        if (!lastRound) throw new ApiError("Génère d'abord les tables de la première ronde.");
        const ms = await q(() => client.from("matches").select("*").eq("round_id", lastRound.id).order("table_number"));
        if (!(ms || []).length) throw new ApiError("Aucune table à publier pour cette ronde.");
        const ids = [];
        for (const m of ms) { ids.push(m.white_id); ids.push(m.black_id); }
        const pm = await profilesMap(ids);
        const rows = [];
        for (const m of ms || []) {
          const w = m.white_id ? pm.get(m.white_id) : null;
          const b = m.black_id ? pm.get(m.black_id) : null;
          const lieu = t.location ? " à " + t.location : "";
          if (w && !b) {
            rows.push({
              user_id: w.id,
              recipient_name: w.name || "",
              email: "",
              subject: t.name + " — ronde " + lastRound.round_number,
              body: "Bonjour " + (w.name || "") + ", tu es exempt (bye) à la table " + m.table_number + " pour la ronde " + lastRound.round_number + " du tournoi « " + t.name + " »" + lieu + ". Un point est automatiquement attribué.",
              kind: "auto",
            });
          } else if (w && b) {
            const base = "Bonjour, ronde " + lastRound.round_number + " du tournoi « " + t.name + " »" + lieu + " :";
            rows.push({
              user_id: w.id,
              recipient_name: w.name || "",
              email: "",
              subject: t.name + " — ronde " + lastRound.round_number,
              body: base + " tu joues avec les blancs contre " + (b.name || "?") + " à la table " + m.table_number + ".",
              kind: "auto",
            });
            rows.push({
              user_id: b.id,
              recipient_name: b.name || "",
              email: "",
              subject: t.name + " — ronde " + lastRound.round_number,
              body: base + " tu joues avec les noirs contre " + (w.name || "?") + " à la table " + m.table_number + ".",
              kind: "auto",
            });
          }
        }
        if (rows.length) {
          await q(() => client.from("notifications").insert(rows), "Publication non autorisée.");
        }
        const nextStatus = t.status === "brouillon" ? "publie" : t.status;
        await q(() => client.from("tournaments").update({ status: nextStatus }).eq("id", tid));
        return { ok: true, emails_envoyes: rows.length, round: lastRound.round_number };
      }

      if (seg[2] === "status" && method === "POST") {
        const user = await requireUser();
        const t = await loadTournament(tid);
        if (!(await canManageTournament(user, tid, t.creator_id))) throw new ApiError("Réservé aux arbitres de ce tournoi.", 403);
        const wanted = String(body.status || "");
        if (!["brouillon", "publie", "en_cours", "termine"].includes(wanted)) throw new ApiError("Statut invalide.");
        const updates = { status: wanted };
        let champion = "";
        if (wanted === "termine") {
          if (t.format === "elimination") {
            const lastRound = await q(() =>
              client.from("rounds").select("*").eq("tournament_id", tid).order("round_number", { ascending: false }).limit(1).maybeSingle()
            );
            let champName = t.champion || "";
            if (lastRound) {
              const ms = await q(() => client.from("matches").select("*").eq("round_id", lastRound.id));
              const winners = [];
              for (const m of ms || []) {
                if (!m.result) continue;
                winners.push(m.result === "0-1" ? m.black_id : m.white_id);
              }
              const uniqueWinners = [...new Set(winners.filter(Boolean))];
              if (uniqueWinners.length === 1) {
                const p = (await profilesMap(uniqueWinners)).get(uniqueWinners[0]);
                if (p) champName = p.name;
              }
            }
            champion = String(champName).slice(0, 120);
          } else {
            const regs = await q(() => client.from("registrations").select("user_id").eq("tournament_id", tid));
            const playersRaw = await profilesMap((regs || []).map((r) => r.user_id));
            const players = [...playersRaw.values()].map((p) => ({ id: p.id, name: p.name, elo: p.elo }));
            const histRounds = await q(() => client.from("rounds").select("id").eq("tournament_id", tid));
            let histMatches = [];
            if ((histRounds || []).length) {
              histMatches = await q(() =>
                client.from("matches").select("white_id,black_id,result").in("round_id", histRounds.map((r) => r.id))
              );
            }
            const standings = computeStandings(players, histMatches || []);
            champion = standings.length ? standings[0].name : "";
          }
          updates.champion = champion;
          const regsAll = await q(() =>
            client.from("registrations").select("user_id").eq("tournament_id", tid)
          );
          const pm = await profilesMap((regsAll || []).map((r) => r.user_id));
          const notifRows = [...pm.values()].map((p) => ({
            user_id: p.id,
            recipient_name: p.name || "",
            email: "",
            subject: t.name + " — tournoi terminé",
            body: "Le tournoi « " + t.name + " » est terminé." + (champion ? " Félicitations au champion : " + champion + " !" : ""),
            kind: "auto",
          }));
          if (notifRows.length) {
            await q(() => client.from("notifications").insert(notifRows), "Notification non autorisée.");
          }
        }
        await q(() => client.from("tournaments").update(updates).eq("id", tid), "Modification non autorisée.");
        return { ok: true, champion };
      }

      if (seg[2] === "projector" && method === "GET") {
        const t = await loadTournament(tid);
        const lastRound = await q(() =>
          client.from("rounds").select("*").eq("tournament_id", tid).order("round_number", { ascending: false }).limit(1).maybeSingle()
        );
        let tables = [];
        let round = null;
        if (lastRound) {
          round = { id: lastRound.id, round_number: lastRound.round_number };
          const ms = await q(() => client.from("matches").select("*").eq("round_id", lastRound.id).order("table_number"));
          const ids = [];
          for (const m of ms || []) { ids.push(m.white_id); ids.push(m.black_id); }
          const pm = await profilesMap(ids);
          tables = (ms || []).map((m) => {
            const w = m.white_id ? pm.get(m.white_id) : null;
            const b = m.black_id ? pm.get(m.black_id) : null;
            return {
              table_number: m.table_number,
              white: w ? { name: w.name, elo: w.elo } : null,
              black: b ? { name: b.name, elo: b.elo } : null,
              result: m.result,
            };
          });
        }
        const regsCount = await q(() => client.from("registrations").select("tournament_id").eq("tournament_id", tid));
        return {
          tournament: {
            name: t.name,
            location: t.location,
            status: t.status,
            current_round: t.current_round,
            start_date: t.start_date,
            end_date: t.end_date,
            champion: t.champion || "",
            format: t.format,
          },
          round,
          tables,
          participants: (regsCount || []).length,
        };
      }
    }

    if (seg[0] === "matches" && seg[1]) {
      const mid = numOrNull(seg[1]);
      if (!mid) throw new ApiError("Partie introuvable.", 404);
      const m = await q(() => client.from("matches").select("*").eq("id", mid).maybeSingle());
      if (!m) throw new ApiError("Partie introuvable.", 404);
      const round = await q(() => client.from("rounds").select("*").eq("id", m.round_id).maybeSingle());
      const tid = round ? round.tournament_id : null;
      const t = tid ? await loadTournament(tid) : null;
      const user = await requireUser();
      if (!(await canManageTournament(user, tid, t ? t.creator_id : null))) {
        throw new ApiError("Réservé aux arbitres de ce tournoi.", 403);
      }
      if (method === "POST") {
        const result = body.result === null ? null : String(body.result || "");
        if (result !== null && !["1-0", "0-1", "1/2", "bye"].includes(result)) throw new ApiError("Résultat invalide.");
        await q(() => client.from("matches").update({ result }).eq("id", mid), "Pointage non autorisé.");
        return { ok: true };
      }
      if (method === "PUT") {
        const upd = {};
        if (body.white_id !== undefined) upd.white_id = body.white_id || null;
        if (body.black_id !== undefined) upd.black_id = body.black_id || null;
        if (body.table_number !== undefined) upd.table_number = Math.max(1, parseInt(body.table_number, 10) || 1);
        if (!Object.keys(upd).length) throw new ApiError("Aucune modification fournie.");
        await q(() => client.from("matches").update(upd).eq("id", mid), "Modification non autorisée.");
        return { ok: true };
      }
      if (method === "DELETE") {
        await q(() => client.from("matches").delete().eq("id", mid), "Suppression non autorisée.");
        return { ok: true };
      }
    }

    if (seg[0] === "admin") {
      const admin = await requireAdmin();

      if (seg[1] === "users" && !seg[2] && method === "GET") {
        const searchQ = String(options.query && options.query.q ? options.query.q : "").trim().replace(/[,()%]/g, "");
        let builder = () => {
          let b = client.from("profiles").select("*").order("created_at", { ascending: false }).limit(500);
          if (searchQ) b = b.or("name.ilike.*" + searchQ + "*,email.ilike.*" + searchQ + "*");
          return b;
        };
        const rows = await q(builder, "Liste des utilisateurs non autorisée.");
        const regs = await q(() => client.from("registrations").select("user_id"));
        const counts = {};
        for (const r of regs || []) counts[r.user_id] = (counts[r.user_id] || 0) + 1;
        return {
          users: (rows || []).map((p) => ({ ...mapProfile(p), tournois: counts[p.id] || 0 })),
        };
      }

      if (seg[1] === "users" && seg[2] && method === "PUT") {
        const targetId = seg[2];
        if (targetId === admin.id && (body.role === "arbitre" || body.role === "joueur" || body.banned === true)) {
          throw new ApiError("Action interdite sur ton propre compte administrateur.");
        }
        const updates = {};
        if (typeof body.name === "string") updates.name = body.name.trim().slice(0, 80);
        if (typeof body.school_year === "string") updates.school_year = body.school_year.slice(0, 40);
        if (body.elo !== undefined) updates.elo = Math.min(3500, Math.max(0, parseInt(body.elo, 10) || 1200));
        if (["joueur", "arbitre", "admin"].includes(body.role)) updates.role = body.role;
        if (body.banned !== undefined) updates.banned = !!body.banned;
        if (!Object.keys(updates).length) throw new ApiError("Aucune modification fournie.");
        await q(() => client.from("profiles").update(updates).eq("id", targetId), "Modification non autorisée.");
        return { ok: true };
      }

      if (seg[1] === "users" && seg[2] && method === "DELETE") {
        if (seg[2] === admin.id) throw new ApiError("Impossible de supprimer ton propre compte ici.");
        await q(() => client.from("profiles").delete().eq("id", seg[2]), "Suppression non autorisée.");
        return { ok: true };
      }

      if (seg[1] === "support" && !seg[2] && method === "GET") {
        const rows = await q(() =>
          client.from("support_messages").select("*").order("created_at", { ascending: false }).limit(200)
        );
        return { messages: rows || [] };
      }

      if (seg[1] === "support" && seg[2] && method === "DELETE") {
        await q(() => client.from("support_messages").delete().eq("id", seg[2]), "Suppression non autorisée.");
        return { ok: true };
      }

      if (seg[1] === "emails" && !seg[2] && method === "GET") {
        const rows = await q(() =>
          client.from("notifications").select("*").order("created_at", { ascending: false }).limit(100)
        );
        return {
          emails: (rows || []).map((n) => ({
            to_email: n.email || n.recipient_name || "—",
            subject: n.subject,
            body: n.body,
            status: n.kind === "manuel" ? "envoye" : "simule",
            created_at: new Date(n.created_at).getTime(),
          })),
        };
      }

      if (seg[1] === "email" && method === "POST") {
        const subject = String(body.subject || "").trim().slice(0, 200);
        const text = String(body.body || "").slice(0, 6000);
        if (!subject || !text) throw new ApiError("Sujet et message obligatoires.");
        let envoyes = 0;
        if (String(body.to) === "all") {
          const actives = await q(() => client.from("profiles").select("id,name,email").eq("banned", false));
          const rows = (actives || []).map((p) => ({
            user_id: p.id,
            recipient_name: p.name || "",
            email: p.email || "",
            subject,
            body: text,
            kind: "manuel",
          }));
          if (rows.length) await q(() => client.from("notifications").insert(rows), "Envoi non autorisé.");
          envoyes = rows.length;
        } else {
          const addr = String(body.to || "").trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) throw new ApiError("Adresse courriel invalide.");
          const prof = await q(() => client.from("profiles").select("id,name,email").eq("email", addr).maybeSingle());
          await q(() =>
            client.from("notifications").insert({
              user_id: prof ? prof.id : null,
              recipient_name: prof ? prof.name || "" : "",
              email: addr,
              subject,
              body: text,
              kind: "manuel",
            })
          );
          envoyes = 1;
        }
        return { ok: true, envoyes };
      }

      if (seg[1] === "stats" && method === "GET") {
        async function countOf(table, filters) {
          let b = client.from(table).select("*", { count: "exact", head: true });
          if (filters) b = filters(b);
          const { count } = await b;
          return count || 0;
        }
        return {
          utilisateurs: await countOf("profiles"),
          tournois: await countOf("tournaments"),
          inscriptions: await countOf("registrations"),
          tables: await countOf("matches"),
          support: await countOf("support_messages"),
          courriels: await countOf("notifications"),
        };
      }
    }

    throw new ApiError("Route introuvable : /api/" + path, 404);
  }

  window.api = api;
  window.qsParam = function (name) {
    return new URLSearchParams(window.location.search).get(name);
  };
  window.formValues = function (form) {
    const out = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      out[el.name] = el.value;
    });
    return out;
  };
})();
