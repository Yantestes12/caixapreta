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

// Navegação simples por data-href (home -> subpáginas)
(() => {
  const go = (el) => {
    const href = el?.getAttribute?.("data-href");
    if (!href) return;
    if (/^https?:\/\//i.test(href)) {
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
})();

