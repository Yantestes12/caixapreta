(() => {
  const track = document.getElementById("carouselTrack");
  if (!track) return;

  const slides = Array.from(track.querySelectorAll(".carousel-slide"));
  const dots = Array.from(document.querySelectorAll(".carousel .dot"));
  const prevBtn = document.querySelector(".carousel-arrow.left");
  const nextBtn = document.querySelector(".carousel-arrow.right");

  let idx = 0;

  const setIdx = (next) => {
    idx = (next + slides.length) % slides.length;
    track.style.transform = `translateX(-${idx * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
  };

  prevBtn?.addEventListener("click", () => setIdx(idx - 1));
  nextBtn?.addEventListener("click", () => setIdx(idx + 1));
  dots.forEach((d, i) => d.addEventListener("click", () => setIdx(i)));

  // Swipe (mobile)
  let startX = null;
  track.addEventListener(
    "touchstart",
    (e) => {
      startX = e.touches?.[0]?.clientX ?? null;
    },
    { passive: true }
  );
  track.addEventListener(
    "touchend",
    (e) => {
      if (startX == null) return;
      const endX = e.changedTouches?.[0]?.clientX ?? startX;
      const dx = endX - startX;
      startX = null;
      if (Math.abs(dx) < 40) return;
      setIdx(dx > 0 ? idx - 1 : idx + 1);
    },
    { passive: true }
  );
})();

// Navegação + Login por e-mail (via webhook n8n)
(() => {
  const STORAGE_KEYS = {
    email: "cp_auth_email",
    caixapreta: "cp_auth_caixapreta",
    bot: "cp_auth_bot",
    checkedAt: "cp_auth_checked_at",
  };

  const WEBHOOK_URL = "https://weebhooks.synio.com.br/webhook/logincaixapreta";
  const BOT_CHATGPT_URL =
    "https://chatgpt.com/g/g-6856313d35c0819187235d0d83d5af7c-bot-da-conquista";
  const BOT_CHECKOUT_URL = "https://pagamento.caixapretabr.com/compra/checkout-2/";

  const normFlag = (v) => {
    const s = String(v ?? "").trim().toLowerCase();
    if (!s || s === "null" || s === "undefined") return null;
    if (s === "sim" || s === "yes" || s === "true" || s === "1") return "sim";
    return s;
  };

  const getEntitlements = () => ({
    email: localStorage.getItem(STORAGE_KEYS.email) || "",
    caixapreta: normFlag(localStorage.getItem(STORAGE_KEYS.caixapreta)),
    bot: normFlag(localStorage.getItem(STORAGE_KEYS.bot)),
  });

  const hasCaixaPreta = () => getEntitlements().caixapreta === "sim";
  const hasBot = () => getEntitlements().bot === "sim";

  const setStatus = (el, msg, kind) => {
    if (!el) return;
    el.classList.remove("is-error", "is-ok");
    if (kind === "error") el.classList.add("is-error");
    if (kind === "ok") el.classList.add("is-ok");
    el.textContent = msg || "";
  };

  const parseWebhookText = (text) => {
    const out = {};
    String(text ?? "")
      .split(/\r?\n/g)
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        const idx = line.indexOf(":");
        if (idx === -1) return;
        const k = line.slice(0, idx).trim().toLowerCase();
        const v = line.slice(idx + 1).trim();
        out[k] = normFlag(v);
      });
    return out;
  };

  const callWebhook = async (email) => {
    // Envia de forma compatível com n8n:
    // - POST com form-url-encoded (cai em $json.body.email)
    // - também envia ?email=... (cai em $json.query.email)
    const u = new URL(WEBHOOK_URL);
    u.searchParams.set("email", email);

    const body = new URLSearchParams();
    body.set("email", email);

    try {
      // Não setar headers manualmente ajuda a evitar preflight/CORS em muitos casos
      const r = await fetch(u.toString(), { method: "POST", body });
      const ct = r.headers.get("content-type") || "";
      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        throw new Error(errText || `HTTP ${r.status}`);
      }
      if (ct.includes("application/json")) {
        const j = await r.json();
        return { caixapreta: normFlag(j?.caixapreta), bot: normFlag(j?.bot) };
      }
      const t = await r.text();
      const parsed = parseWebhookText(t);
      return {
        caixapreta: normFlag(parsed?.caixapreta),
        bot: normFlag(parsed?.bot),
      };
    } catch (err) {
      // fallback GET (às vezes CORS/webhook fica mais permissivo)
      const r = await fetch(u.toString(), { method: "GET" });
      const ct = r.headers.get("content-type") || "";
      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        throw new Error(errText || `HTTP ${r.status}`);
      }
      if (ct.includes("application/json")) {
        const j = await r.json();
        return { caixapreta: normFlag(j?.caixapreta), bot: normFlag(j?.bot) };
      }
      const t = await r.text();
      const parsed = parseWebhookText(t);
      return {
        caixapreta: normFlag(parsed?.caixapreta),
        bot: normFlag(parsed?.bot),
      };
    }
  };

  let refreshPromise = null;
  const refreshEntitlements = async (email, { silent = true } = {}) => {
    const usedEmail = String(email ?? "").trim();
    if (!usedEmail) return null;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      if (!silent) setStatus(statusEl, "Verificando acesso...", undefined);
      const res = await callWebhook(usedEmail);
      localStorage.setItem(STORAGE_KEYS.email, usedEmail);
      localStorage.setItem(STORAGE_KEYS.caixapreta, res?.caixapreta ?? "null");
      localStorage.setItem(STORAGE_KEYS.bot, res?.bot ?? "null");
      localStorage.setItem(STORAGE_KEYS.checkedAt, String(Date.now()));
      return res;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  };

  const applyBotTile = () => {
    const botTile = document.querySelector(".tile-bot");
    if (!botTile) return;
    const subtitle = botTile.querySelector(".tile-subtitle");
    const lockEl = botTile.querySelector(".lock");

    if (hasBot()) {
      botTile.classList.remove("is-locked");
      botTile.setAttribute("aria-label", "Abrir Bot da Conquista");
      botTile.setAttribute("data-href", BOT_CHATGPT_URL);
      botTile.setAttribute("data-target", "_blank");
      if (subtitle) subtitle.textContent = "Liberado";
      if (lockEl) lockEl.style.display = "none";
    } else {
      botTile.classList.add("is-locked");
      botTile.setAttribute(
        "aria-label",
        "Desbloquear Bot da Conquista por R$ 9,90"
      );
      botTile.setAttribute("data-href", BOT_CHECKOUT_URL);
      botTile.setAttribute("data-target", "_self");
      if (subtitle) subtitle.textContent = "Bloqueado • R$ 9,90";
      if (lockEl) lockEl.style.display = "";
    }
  };

  const overlay = document.getElementById("authOverlay");
  const form = document.getElementById("authForm");
  const emailInput = document.getElementById("authEmail");
  const submitBtn = document.getElementById("authSubmit");
  const statusEl = document.getElementById("authStatus");
  const logoutBtn = document.getElementById("authLogout");
  const closeBtn = document.getElementById("authClose");

  const showLogin = (msg) => {
    if (!overlay) return;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    const ent = getEntitlements();
    if (emailInput && ent.email) emailInput.value = ent.email;
    setStatus(statusEl, msg || "", undefined);
    setTimeout(() => emailInput?.focus?.(), 50);
  };

  const hideLogin = () => {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.style.overflow = "";
    setStatus(statusEl, "", undefined);
  };

  const clearAuth = () => {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  };

  const enforcePageGate = async () => {
    const needs = document.body?.getAttribute?.("data-requires");
    const ent = getEntitlements();

    // Páginas protegidas (subpáginas): bloqueia até liberar caixapreta
    if (needs === "caixapreta") {
      if (!hasCaixaPreta()) {
        // Se já tem e-mail salvo, revalida sempre ao entrar (caso tenha comprado depois)
        if (ent.email) {
          showLogin("Verificando acesso...");
          if (closeBtn) closeBtn.style.display = "none";
          try {
            await refreshEntitlements(ent.email, { silent: false });
          } catch (_) {
            // mantém estado atual
          }
          applyBotTile();
        }
      }
      if (!hasCaixaPreta()) {
        showLogin("Digite seu e-mail para liberar o acesso.");
        if (closeBtn) closeBtn.style.display = "none";
        return;
      }
      if (closeBtn) closeBtn.style.display = "";
      hideLogin();
      return;
    }

    // Home: mostra login na primeira vez/sem checagem, mas deixa fechar
    const hasChecked = Boolean(localStorage.getItem(STORAGE_KEYS.checkedAt));
    if (!hasChecked && !ent.email) {
      showLogin("Digite seu e-mail para verificar se você está liberado.");
      if (closeBtn) closeBtn.style.display = "";
      return;
    }
    if (closeBtn) closeBtn.style.display = "";
    hideLogin();
  };

  const go = async (el) => {
    const requires = el?.getAttribute?.("data-requires");
    if (requires === "caixapreta" && !hasCaixaPreta()) {
      showLogin("Acesso bloqueado. Digite seu e-mail para verificar.");
      return;
    }

    // Bot: sempre revalida ao tentar abrir, se já tiver e-mail salvo
    if (requires === "bot") {
      const ent = getEntitlements();
      if (ent.email) {
        try {
          await refreshEntitlements(ent.email, { silent: true });
        } catch (_) {
          // se falhar, segue com o último estado salvo
        }
        applyBotTile();
      }
    }

    const href = el?.getAttribute?.("data-href");
    if (!href) return;
    const target = el?.getAttribute?.("data-target");
    if (/^https?:\/\//i.test(href)) {
      if (target === "_self") {
        window.location.href = href;
        return;
      }
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.href = href;
  };

  document.addEventListener("click", (e) => {
    const el = e.target?.closest?.("[data-href]");
    if (!el) return;
    go(el);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = document.activeElement;
    if (!el || !el.hasAttribute?.("data-href")) return;
    e.preventDefault();
    go(el);
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearAuth();
      if (emailInput) emailInput.value = "";
      applyBotTile();
      showLogin("Digite seu e-mail para verificar se você está liberado.");
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      const needs = document.body?.getAttribute?.("data-requires");
      if (needs === "caixapreta" && !hasCaixaPreta()) return;
      hideLogin();
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = String(emailInput?.value ?? "").trim();
      if (!email || !email.includes("@")) {
        setStatus(statusEl, "Digite um e-mail válido.", "error");
        emailInput?.focus?.();
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      setStatus(statusEl, "Verificando acesso...", undefined);

      try {
        const res = await refreshEntitlements(email, { silent: true });

        applyBotTile();

        if (res?.caixapreta === "sim") {
          setStatus(statusEl, "Acesso liberado. Bem-vindo!", "ok");
          setTimeout(() => hideLogin(), 450);
          return;
        }

        setStatus(
          statusEl,
          "Ainda não liberado para este e-mail. Verifique se foi o e-mail da compra.",
          "error"
        );
        showLogin();
      } catch (err) {
        const details = String(err?.message ?? "").trim();
        const msg = details
          ? `Erro ao verificar: ${details}`.slice(0, 240)
          : "Erro ao verificar. Tente novamente em alguns segundos.";
        setStatus(
          statusEl,
          msg,
          "error"
        );
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // init
  applyBotTile();
  (async () => {
    // Sempre revalida ao entrar (se já tiver e-mail salvo) para pegar upgrades (ex.: comprou Bot depois)
    const ent = getEntitlements();
    if (ent.email) {
      try {
        await refreshEntitlements(ent.email, { silent: true });
      } catch (_) {
        // offline/erro: mantém o último estado salvo
      }
      applyBotTile();
    }
    await enforcePageGate();
  })();
})();

