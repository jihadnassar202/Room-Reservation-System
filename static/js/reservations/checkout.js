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
        <th scope="col" class="text-body-secondary small">Room</th>
        ${timeSlots
          .map((s) => `<th scope="col" class="text-body-secondary small text-center">${escapeHtml(s.label)}</th>`)
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
            const slotText = slotLabel.get(slotValue) || String(s.label || slotValue);
            const ariaBase = `${rt.name} at ${slotText}`;

            if (isReserved) {
              return `
                <td class="text-center">
                  <button
                    type="button"
                    class="btn btn-sm btn-danger w-100"
                    disabled
                    aria-disabled="true"
                    title="Reserved"
                    aria-label="Reserved: ${escapeHtml(ariaBase)}"
                  >
                    Reserved
                  </button>
                </td>
              `;
            }

            const btnClass = isSelected ? "btn-primary" : "btn-outline-success";
            const btnText = isSelected ? "Selected" : "Select";
            const pressed = isSelected ? "true" : "false";
            return `
              <td class="text-center">
                <button
                  type="button"
                  class="btn btn-sm ${btnClass} w-100"
                  data-room-type-id="${rt.id}"
                  data-slot="${slotValue}"
                  aria-pressed="${pressed}"
                  aria-label="${escapeHtml(btnText)}: ${escapeHtml(ariaBase)}"
                >
                  ${btnText}
                </button>
              </td>
            `;
          })
          .join("");

        return `
          <tr>
            <th scope="row" class="fw-semibold">${escapeHtml(rt.name)}</th>
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
    const matrixWrap = document.getElementById("availabilityMatrixWrap");

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

    const setReserveEnabled = (enabled) => {
      if (!reserveBtn) return;
      reserveBtn.disabled = !enabled;
      reserveBtn.setAttribute("aria-disabled", reserveBtn.disabled ? "true" : "false");
    };

    const load = async () => {
      const date = dateInput.value;
      if (!date) return;

      const mySeq = ++requestSeq;
      if (currentController) currentController.abort();
      currentController = new AbortController();

      inFlight = true;
      matrixWrap?.classList.add("is-loading");
      matrixWrap?.setAttribute("aria-busy", "true");
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
        setReserveEnabled(false);
        setStatus(statusEl, `Updated for ${payload.date}`);
      } catch (e) {
        if (e?.name === "AbortError") return;
        setStatus(statusEl, "Failed");
        const serverMsg = e?.data?.error || null;
        window.App.toast(serverMsg || "Failed to load availability. Please try again.", { variant: "danger" });
      } finally {
        if (mySeq === requestSeq) {
          inFlight = false;
          matrixWrap?.classList.remove("is-loading");
          matrixWrap?.setAttribute("aria-busy", "false");
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

      const roomTypeId = Number(btn.dataset.roomTypeId);
      const slot = Number(btn.dataset.slot);

      if (selection && selection.roomTypeId === roomTypeId && selection.slot === slot) {
        selection = null;
        setReserveEnabled(false);
      } else {
        selection = { roomTypeId, slot };
        setReserveEnabled(true);
      }

      renderMatrix(headEl, bodyEl, lastPayload, filterInput?.value || "", selection);
      updateSelectedSummary();
    });

    reserveBtn?.addEventListener("click", async () => {
      if (!selection || !lastPayload) return;

      const date = dateInput.value;
      const room = (lastPayload.room_types || []).find((rt) => rt.id === selection.roomTypeId);
      const slot = (lastPayload.time_slots || []).find((s) => Number(s.value) === selection.slot);
      if (!date || !room || !slot) return;

      const ok = await window.App.confirm({
        title: "Confirm reservation",
        body: `Reserve ${room.name} on ${date} at ${slot.label}?`,
        okText: "Reserve",
        okVariant: "primary",
      });
      if (!ok) return;

      setStatus(statusEl, "Reserving…");
      setReserveEnabled(false);
      dateInput.disabled = true;
      if (filterInput) filterInput.disabled = true;

      try {
        await window.App.fetchJSON("/api/reservations/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_type_id: selection.roomTypeId,
            date,
            slot: selection.slot,
          }),
        });

        window.App.toast("Reservation created successfully.", { variant: "success" });
        await load(); // refresh availability and clear selection
      } catch (e) {
        const status = e?.status;
        const msg = e?.data?.error || "Failed to reserve. Please try again.";

        if (status === 409) {
          window.App.toast(msg, { variant: "danger" });
          await load(); // refresh to show the slot as reserved
          return;
        }

        window.App.toast(msg, { variant: "danger" });
        setStatus(statusEl, "Failed");
      } finally {
        dateInput.disabled = false;
        if (filterInput) filterInput.disabled = false;
      }
    });

    // Initial load on page open.
    debouncedLoad();
  });
})();


