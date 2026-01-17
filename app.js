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

// PWA install + service worker
(() => {
  // Service worker (para instalar/offline)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  // Botão "Instalar" (Chrome/Android)
  const installBtn = document.getElementById("installBtn");
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.__cpDeferredPrompt = deferredPrompt;
    if (installBtn) installBtn.hidden = false;
    window.dispatchEvent(new CustomEvent("cp:install-available"));
  });

  installBtn?.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch (_) {}
    deferredPrompt = null;
    window.__cpDeferredPrompt = null;
    if (installBtn) installBtn.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    window.__cpDeferredPrompt = null;
    if (installBtn) installBtn.hidden = true;
  });
})();

// Navegação + Login por e-mail (via webhook n8n)
(() => {
  const STORAGE_KEYS = {
    email: "cp_auth_email",
    caixapreta: "cp_auth_caixapreta",
    bot: "cp_auth_bot",
    checkedAt: "cp_auth_checked_at",
  };

  const ONCE_KEYS = {
    installPromptSeen: "cp_install_prompt_seen_v1",
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

  const upsellOverlay = document.getElementById("upsellOverlay");
  const upsellVideo = document.getElementById("upsellVideo");
  const upsellPoll = document.getElementById("upsellPoll");
  const upsellNote = document.getElementById("upsellNote");
  const upsellFooter = document.getElementById("upsellFooter");
  const upsellCta = document.getElementById("upsellCta");
  const upsellClose = document.getElementById("upsellClose");

  const installBanner = document.getElementById("installBanner");
  const installBannerBtn = document.getElementById("installBannerBtn");
  const installBannerSub = document.getElementById("installBannerSub");
  const installBannerClose = document.getElementById("installBannerClose");

  const notifyTopBtn = document.getElementById("notifyTopBtn");
  const notifyBtn = document.getElementById("notifyBtn");

  const isStandalone = () =>
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator?.standalone === true;

  let installAutoHideTimer = null;

  const markInstallPromptSeen = () => {
    try {
      localStorage.setItem(ONCE_KEYS.installPromptSeen, "1");
    } catch (_) {}
  };

  const hasSeenInstallPrompt = () => {
    try {
      return localStorage.getItem(ONCE_KEYS.installPromptSeen) === "1";
    } catch (_) {
      return false;
    }
  };

  const showInstallBanner = (subtitle) => {
    if (!installBanner || !installBannerBtn) return;
    if (isStandalone()) return;
    if (hasSeenInstallPrompt()) return;

    clearTimeout(installAutoHideTimer);

    installBanner.hidden = false;

    const hasPrompt = Boolean(window.__cpDeferredPrompt);
    installBannerBtn.disabled = !hasPrompt;
    installBannerBtn.textContent = "Instalar";

    if (installBannerSub) {
      installBannerSub.textContent =
        subtitle ||
        (hasPrompt
          ? "Instale e acesse direto como app no seu celular."
          : "Se o botão não liberar, use ⋮ → Adicionar à tela inicial.");
    }

    // Some sozinho em 45s e marca como visto (não volta mais)
    installAutoHideTimer = setTimeout(() => hideInstallBanner(true), 45_000);
  };

  const hideInstallBanner = (markSeen = false) => {
    if (!installBanner) return;
    installBanner.hidden = true;
    clearTimeout(installAutoHideTimer);
    installAutoHideTimer = null;
    if (markSeen) markInstallPromptSeen();
  };

  const promptInstall = async () => {
    const dp = window.__cpDeferredPrompt;
    if (!dp) return;
    dp.prompt();
    try {
      await dp.userChoice;
    } catch (_) {}
    window.__cpDeferredPrompt = null;
    hideInstallBanner(true);
  };

  const toast = (() => {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.style.position = "fixed";
      el.style.left = "12px";
      el.style.right = "12px";
      el.style.bottom = "calc(var(--nav-h) + env(safe-area-inset-bottom) + 90px)";
      el.style.zIndex = "130";
      el.style.padding = "10px 12px";
      el.style.borderRadius = "14px";
      el.style.border = "1px solid rgba(255,255,255,0.12)";
      el.style.background = "rgba(0,0,0,0.65)";
      el.style.backdropFilter = "blur(10px)";
      el.style.color = "rgba(255,255,255,0.88)";
      el.style.fontWeight = "700";
      el.style.fontSize = "12px";
      el.style.display = "none";
      document.body.appendChild(el);
    }
    let t = null;
    return (msg) => {
      if (!el) return;
      el.textContent = msg;
      el.style.display = "block";
      clearTimeout(t);
      t = setTimeout(() => (el.style.display = "none"), 2400);
    };
  })();

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      toast("Notificações não suportadas neste navegador.");
      return;
    }
    try {
      const p = await Notification.requestPermission();
      if (p === "granted") toast("Notificações ativadas.");
      else if (p === "denied") toast("Notificações bloqueadas pelo navegador.");
      else toast("Permissão de notificação não concedida.");
    } catch (_) {
      toast("Não foi possível pedir a permissão agora.");
    }
  };

  notifyTopBtn?.addEventListener("click", requestNotifications);
  notifyBtn?.addEventListener("click", requestNotifications);

  installBannerBtn?.addEventListener("click", promptInstall);
  installBannerClose?.addEventListener("click", () => hideInstallBanner(true));

  // Se o prompt ficar disponível enquanto o banner estiver aberto, habilita o botão
  window.addEventListener("cp:install-available", () => {
    if (hasSeenInstallPrompt()) return;
    if (!installBanner || installBanner.hidden) return;
    if (!installBannerBtn) return;
    installBannerBtn.disabled = false;
    if (installBannerSub) {
      installBannerSub.textContent =
        "Pronto — clique em Instalar para adicionar o app.";
    }
  });

  const preloadUpsellVideo = () => {
    if (!upsellVideo) return Promise.resolve();
    // Espera o mínimo pro primeiro frame ficar disponível
    if (upsellVideo.readyState >= 2) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => resolve();
      upsellVideo.addEventListener("loadeddata", done, { once: true });
      upsellVideo.addEventListener("error", done, { once: true });
      // garante que começa a carregar
      try {
        upsellVideo.load?.();
      } catch (_) {}
    });
  };

  const showUpsell = async () => {
    if (!upsellOverlay) return;
    if (hasBot()) return;
    // Se o login obrigatório estiver aberto, não atrapalha: deixa pra depois
    if (overlay && !overlay.hidden) return;
    // Se o popup de instalação estiver aberto, não compete
    if (installBanner && !installBanner.hidden) return;
    // Reset do popup (sempre começa fechado até escolher um valor)
    if (upsellFooter) upsellFooter.hidden = true;
    if (upsellNote) upsellNote.textContent = "";
    if (upsellPoll) {
      upsellPoll
        .querySelectorAll(".upsell-opt")
        .forEach((b) => b.classList.remove("is-selected"));
    }
    await preloadUpsellVideo();
    upsellOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    // força play (alguns navegadores só começam ao ficar visível)
    try {
      await upsellVideo?.play?.();
    } catch (_) {}
  };

  const hideUpsell = () => {
    if (!upsellOverlay) return;
    upsellOverlay.hidden = true;
    document.body.style.overflow = "";
  };

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

  const enforcePageGate = async () => {
    const needs = document.body?.getAttribute?.("data-requires");
    const ent = getEntitlements();

    // Login obrigatório: qualquer página com data-requires="caixapreta" só libera com caixapreta: sim
    if (needs === "caixapreta") {
      if (!hasCaixaPreta()) {
        if (ent.email) {
          showLogin("Verificando acesso...");
          try {
            await refreshEntitlements(ent.email, { silent: false });
          } catch (_) {}
          applyBotTile();
        }
      }
      if (!hasCaixaPreta()) {
        showLogin("Digite seu e-mail para liberar o acesso.");
        return;
      }
      hideLogin();
      return;
    }

    hideLogin();
  };

  const go = (el) => {
    const requires = el?.getAttribute?.("data-requires");
    if (requires === "caixapreta" && !hasCaixaPreta()) {
      showLogin("Acesso bloqueado. Digite seu e-mail para verificar.");
      return;
    }

    // Bot: não bloquear o clique com await (Safari iOS bloqueia window.open após ações assíncronas).
    // A revalidação continua acontecendo ao entrar na página; aqui rodamos em background só para atualizar estado futuro.
    if (requires === "bot") {
      const ent = getEntitlements();
      if (ent.email) {
        refreshEntitlements(ent.email, { silent: true })
          .then(() => applyBotTile())
          .catch(() => {});
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

  // Upsell interactions
  if (upsellPoll) {
    upsellPoll.addEventListener("click", (e) => {
      const btn = e.target?.closest?.(".upsell-opt");
      if (!btn) return;
      upsellPoll
        .querySelectorAll(".upsell-opt")
        .forEach((b) => b.classList.toggle("is-selected", b === btn));
      const v = btn.getAttribute("data-value") || "";
      if (upsellNote) {
        upsellNote.textContent = `Boa — não vamos cobrar R$ ${v}. Hoje está por R$ 9,90.`;
      }
      if (upsellFooter) upsellFooter.hidden = false;
    });
  }

  if (upsellClose) {
    upsellClose.addEventListener("click", () => {
      hideUpsell();
    });
  }

  if (upsellCta) {
    upsellCta.addEventListener("click", () => {
      const href = upsellCta.getAttribute("data-href");
      if (!href) return;
      window.location.href = href;
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
          // Depois do login, sugere instalação UMA vez (45s ou fechar) e nunca mais
          setTimeout(() => showInstallBanner(), 650);
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
    // Mostra o upsell sempre que entrar (se bot não liberado). Se login estiver aberto, ele não aparece.
    showUpsell();
  })();
})();

