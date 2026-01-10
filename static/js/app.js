(() => {
  const TAG_TO_VARIANT = {
    error: "danger",
    danger: "danger",
    success: "success",
    warning: "warning",
    info: "info",
    debug: "secondary",
  };

  function normalizeVariant(tags) {
    if (!tags) return "secondary";
    const first = String(tags).split(/\s+/).filter(Boolean)[0];
    return TAG_TO_VARIANT[first] || "secondary";
  }

  function toast(message, opts = {}) {
    const container = document.getElementById("app-toast-container");
    if (!container || !window.bootstrap) return;

    const variant = opts.variant || "secondary";
    const delay = Number.isFinite(opts.delay) ? opts.delay : 5000;

    const el = document.createElement("div");
    el.className = `toast align-items-center text-bg-${variant} border-0`;
    el.role = "status";
    el.ariaLive = "polite";
    el.ariaAtomic = "true";
    el.dataset.bsDelay = String(delay);

    el.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(String(message))}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;

    container.appendChild(el);
    const t = window.bootstrap.Toast.getOrCreateInstance(el);
    el.addEventListener(
      "hidden.bs.toast",
      () => {
        el.remove();
      },
      { once: true }
    );
    t.show();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function getCookie(name) {
    const cookies = document.cookie ? document.cookie.split(";") : [];
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.startsWith(name + "=")) {
        return decodeURIComponent(cookie.substring(name.length + 1));
      }
    }
    return null;
  }

  function csrfToken() {
    return getCookie("csrftoken");
  }

  async function fetchJSON(url, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    const headers = new Headers(opts.headers || {});

    const unsafe = !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method);
    if (unsafe && !headers.has("X-CSRFToken")) {
      const token = csrfToken();
      if (token) headers.set("X-CSRFToken", token);
    }
    if (!headers.has("Accept")) headers.set("Accept", "application/json");

    const res = await fetch(url, {
      ...opts,
      method,
      headers,
    });

    const isJSON = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJSON ? await res.json() : await res.text();

    if (!res.ok) {
      const err = new Error("Request failed");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  let confirmModalInstance = null;

  function confirm(opts = {}) {
    const modalEl = document.getElementById("appConfirmModal");
    if (!modalEl || !window.bootstrap) return Promise.resolve(false);

    const titleEl = document.getElementById("appConfirmModalLabel");
    const bodyEl = document.getElementById("appConfirmModalBody");
    const okBtn = modalEl.querySelector("[data-app-confirm-ok]");

    const title = opts.title || "Confirm";
    const body = opts.body || "Are you sure?";
    const okText = opts.okText || "Confirm";
    const okVariant = opts.okVariant || "danger";

    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.textContent = body;
    if (okBtn) {
      okBtn.textContent = okText;
      okBtn.className = `btn btn-${okVariant}`;
    }

    if (!confirmModalInstance) {
      confirmModalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl, {
        backdrop: "static",
      });
    }

    return new Promise((resolve) => {
      let resolved = false;

      const cleanup = () => {
        okBtn?.removeEventListener("click", onOk);
        modalEl.removeEventListener("hidden.bs.modal", onHidden);
      };

      const onOk = () => {
        resolved = true;
        confirmModalInstance.hide();
        cleanup();
        resolve(true);
      };

      const onHidden = () => {
        if (!resolved) resolve(false);
        cleanup();
      };

      okBtn?.addEventListener("click", onOk, { once: true });
      modalEl.addEventListener("hidden.bs.modal", onHidden, { once: true });

      confirmModalInstance.show();
    });
  }

  window.App = {
    toast,
    confirm,
    csrfToken,
    fetchJSON,
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (Array.isArray(window.__DJANGO_MESSAGES__)) {
      window.__DJANGO_MESSAGES__.forEach((m) => {
        if (!m?.text) return;
        toast(m.text, { variant: normalizeVariant(m.tags) });
      });
    }
  });
})();



