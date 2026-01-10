(() => {
  function debounce(fn, waitMs) {
    let timer = null;
    return (...args) => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), waitMs);
    };
  }

  function setStatus(el, text) {
    if (el) el.textContent = text;
  }

  function renderPreview(container, payload, filterText) {
    if (!container) return;
    const q = (filterText || "").trim().toLowerCase();

    const timeSlots = payload.time_slots || [];
    const slotLabel = new Map(timeSlots.map((s) => [s.value, s.label]));

    const roomTypes = (payload.room_types || []).filter((rt) => {
      if (!q) return true;
      return String(rt.name || "").toLowerCase().includes(q);
    });

    if (!roomTypes.length) {
      container.innerHTML = `<div class="text-body-secondary">No matching room types.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="vstack gap-2">
        ${roomTypes
          .map((rt) => {
            const reserved = Array.isArray(rt.reserved_slots) ? rt.reserved_slots : [];
            const reservedLabels = reserved.map((v) => slotLabel.get(v) || String(v));
            return `
              <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div class="fw-semibold">${escapeHtml(rt.name)}</div>
                <div class="small text-body-secondary">
                  Reserved: ${reserved.length ? reservedLabels.map(escapeHtml).join(", ") : "None"}
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const dateInput = document.getElementById("checkoutDate");
    const filterInput = document.getElementById("roomFilter");
    const statusEl = document.getElementById("availabilityStatus");
    const previewEl = document.getElementById("availabilityPreview");

    if (!dateInput || !previewEl || !window.App?.fetchJSON) return;

    let lastPayload = null;
    let inFlight = false;

    const load = async () => {
      const date = dateInput.value;
      if (!date) return;

      inFlight = true;
      dateInput.disabled = true;
      setStatus(statusEl, "Loading…");

      try {
        const payload = await window.App.fetchJSON(`/api/availability/?date=${encodeURIComponent(date)}`);
        lastPayload = payload;
        renderPreview(previewEl, payload, filterInput?.value || "");
        setStatus(statusEl, `Updated for ${payload.date}`);
      } catch (e) {
        setStatus(statusEl, "Failed");
        window.App.toast("Failed to load availability. Please try again.", { variant: "danger" });
      } finally {
        inFlight = false;
        dateInput.disabled = false;
      }
    };

    const debouncedLoad = debounce(load, 350);

    dateInput.addEventListener("change", () => debouncedLoad());
    dateInput.addEventListener("input", () => debouncedLoad());

    filterInput?.addEventListener("input", () => {
      if (inFlight) return;
      if (!lastPayload) return;
      renderPreview(previewEl, lastPayload, filterInput.value);
    });

    // Initial load on page open.
    debouncedLoad();
  });
})();


