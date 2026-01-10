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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  function renderMatrix(headEl, bodyEl, payload, filterText, selection) {
    if (!headEl || !bodyEl) return;
    const q = (filterText || "").trim().toLowerCase();

    const timeSlots = payload.time_slots || [];
    const slotLabel = new Map(timeSlots.map((s) => [Number(s.value), s.label]));

    const roomTypes = (payload.room_types || []).filter((rt) => {
      if (!q) return true;
      return String(rt.name || "").toLowerCase().includes(q);
    });

    headEl.innerHTML = `
      <tr>
        <th class="text-body-secondary small">Room</th>
        ${timeSlots
          .map((s) => `<th class="text-body-secondary small text-center">${escapeHtml(s.label)}</th>`)
          .join("")}
      </tr>
    `;

    if (!roomTypes.length) {
      bodyEl.innerHTML = `
        <tr>
          <td colspan="${timeSlots.length + 1}" class="text-body-secondary">No matching room types.</td>
        </tr>
      `;
      return;
    }

    bodyEl.innerHTML = roomTypes
      .map((rt) => {
        const reserved = new Set(Array.isArray(rt.reserved_slots) ? rt.reserved_slots.map(Number) : []);
        const cols = timeSlots
          .map((s) => {
            const slotValue = Number(s.value);
            const isReserved = reserved.has(slotValue);
            const isSelected = selection && selection.roomTypeId === rt.id && selection.slot === slotValue;

            if (isReserved) {
              return `
                <td class="text-center">
                  <button type="button" class="btn btn-sm btn-danger w-100" disabled aria-disabled="true">
                    Reserved
                  </button>
                </td>
              `;
            }

            const btnClass = isSelected ? "btn-primary" : "btn-outline-success";
            return `
              <td class="text-center">
                <button
                  type="button"
                  class="btn btn-sm ${btnClass} w-100"
                  data-room-type-id="${rt.id}"
                  data-slot="${slotValue}"
                >
                  Available
                </button>
              </td>
            `;
          })
          .join("");

        return `
          <tr>
            <th class="fw-semibold">${escapeHtml(rt.name)}</th>
            ${cols}
          </tr>
        `;
      })
      .join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const dateInput = document.getElementById("checkoutDate");
    const filterInput = document.getElementById("roomFilter");
    const statusEl = document.getElementById("availabilityStatus");
    const headEl = document.getElementById("availabilityHead");
    const bodyEl = document.getElementById("availabilityBody");
    const selectedSummaryEl = document.getElementById("selectedSummary");
    const reserveBtn = document.getElementById("reserveSelectedBtn");

    if (!dateInput || !headEl || !bodyEl || !window.App?.fetchJSON) return;

    let lastPayload = null;
    let inFlight = false;
    let selection = null; // { roomTypeId:number, slot:number }
    let requestSeq = 0;
    let currentController = null;

    const updateSelectedSummary = () => {
      if (!selectedSummaryEl) return;
      if (!selection || !lastPayload) {
        selectedSummaryEl.textContent = "No slot selected";
        return;
      }
      const room = (lastPayload.room_types || []).find((rt) => rt.id === selection.roomTypeId);
      const slot = (lastPayload.time_slots || []).find((s) => Number(s.value) === selection.slot);
      if (!room || !slot) {
        selectedSummaryEl.textContent = "No slot selected";
        return;
      }
      selectedSummaryEl.textContent = `Selected: ${room.name} · ${slot.label}`;
    };

    const load = async () => {
      const date = dateInput.value;
      if (!date) return;

      const mySeq = ++requestSeq;
      if (currentController) currentController.abort();
      currentController = new AbortController();

      inFlight = true;
      dateInput.disabled = true;
      if (filterInput) filterInput.disabled = true;
      setStatus(statusEl, "Loading…");

      try {
        const payload = await window.App.fetchJSON(`/api/availability/?date=${encodeURIComponent(date)}`, {
          signal: currentController.signal,
        });
        if (mySeq !== requestSeq) return;

        lastPayload = payload;
        selection = null;
        renderMatrix(headEl, bodyEl, payload, filterInput?.value || "", selection);
        updateSelectedSummary();
        setStatus(statusEl, `Updated for ${payload.date}`);
      } catch (e) {
        if (e?.name === "AbortError") return;
        setStatus(statusEl, "Failed");
        const serverMsg = e?.data?.error || null;
        window.App.toast(serverMsg || "Failed to load availability. Please try again.", { variant: "danger" });
      } finally {
        if (mySeq === requestSeq) {
          inFlight = false;
          dateInput.disabled = false;
          if (filterInput) filterInput.disabled = false;
        }
      }
    };

    const debouncedLoad = debounce(load, 350);

    dateInput.addEventListener("change", () => debouncedLoad());
    dateInput.addEventListener("input", () => debouncedLoad());

    filterInput?.addEventListener("input", () => {
      if (inFlight) return;
      if (!lastPayload) return;
      renderMatrix(headEl, bodyEl, lastPayload, filterInput.value, selection);
      updateSelectedSummary();
    });

    bodyEl.addEventListener("click", (evt) => {
      const btn = evt.target?.closest?.("button[data-room-type-id][data-slot]");
      if (!btn) return;
      if (!lastPayload) return;

      selection = {
        roomTypeId: Number(btn.dataset.roomTypeId),
        slot: Number(btn.dataset.slot),
      };

      renderMatrix(headEl, bodyEl, lastPayload, filterInput?.value || "", selection);
      updateSelectedSummary();

      if (reserveBtn) reserveBtn.disabled = true;
    });

    // Initial load on page open.
    debouncedLoad();
  });
})();


