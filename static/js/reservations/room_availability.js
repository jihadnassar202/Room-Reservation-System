(() => {
  function debounce(fn, waitMs) {
    let timer = null;
    return (...args) => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), waitMs);
    };
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function setDisabled(el, disabled) {
    if (!el) return;
    el.disabled = disabled;
    el.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const filtersForm = document.getElementById("availabilityFiltersForm");
    const dateInput = document.getElementById("availabilityDate");
    const filterInput = document.getElementById("roomFilter");

    const roomCardsWrap = document.getElementById("roomCardsWrap");
    const roomCardsStatusEl = document.getElementById("roomCardsStatus");
    const roomCardsGrid = document.getElementById("roomCardsGrid");

    if (!dateInput || !roomCardsGrid || !window.App?.fetchJSON || !window.App?.confirm || !window.App?.toast) return;

    // Prevent full page reloads when JS is available (non-JS users can still submit this GET form).
    filtersForm?.addEventListener("submit", (evt) => {
      evt.preventDefault();
    });


    const roomCardEls = Array.from(roomCardsGrid.querySelectorAll(".room-card[data-room-type-id]"));
    if (!roomCardEls.length) return;

    const roomNameById = new Map();
    const summaryBadgeById = new Map();
    const slotStatusById = new Map();
    const slotWrapById = new Map();
    const reserveBtnById = new Map();
    const selectionTextById = new Map();
    const colById = new Map(); // used for filtering visibility

    roomCardEls.forEach((card) => {
      const roomTypeId = Number(card.dataset.roomTypeId);
      if (!roomTypeId) return;

      const roomName = String(card.dataset.roomTypeName || "").trim();
      if (roomName) roomNameById.set(roomTypeId, roomName);

      const summaryBadge = card.querySelector('[data-role="room-card-summary"][data-room-type-id]');
      if (summaryBadge) summaryBadgeById.set(roomTypeId, summaryBadge);

      const slotStatusEl = card.querySelector('[data-role="room-card-slot-status"][data-room-type-id]');
      if (slotStatusEl) slotStatusById.set(roomTypeId, slotStatusEl);

      const slotsWrap = card.querySelector('[data-role="room-card-slots"][data-room-type-id]');
      if (slotsWrap) slotWrapById.set(roomTypeId, slotsWrap);

      const reserveBtn = card.querySelector('button[data-action="reserve"][data-room-type-id]');
      if (reserveBtn) reserveBtnById.set(roomTypeId, reserveBtn);

      const selectionTextEl = card.querySelector('[data-role="room-card-selection"][data-room-type-id]');
      if (selectionTextEl) selectionTextById.set(roomTypeId, selectionTextEl);

      const col = card.closest("[data-room-type-col]");
      if (col) colById.set(roomTypeId, col);
    });

    // State
    const availabilityCacheByDate = new Map(); // date -> payload
    let slotLabelByValue = new Map(); // slotValue -> label
    let reservedSetByRoomTypeId = new Map(); // roomTypeId -> Set(slotValue)
    let selection = null; // { roomTypeId:number, slot:number }

    let inFlight = false;
    let reserving = false;
    let requestSeq = 0;
    let controller = null;

    const isBusy = () => inFlight || reserving;

    const applySummaryBadge = (roomTypeId, { reservedCount, totalSlots }) => {
      const el = summaryBadgeById.get(Number(roomTypeId));
      if (!el) return;

      const reserved = Number(reservedCount) || 0;
      const total = Number(totalSlots) || 0;

      el.classList.remove("text-bg-success", "text-bg-danger", "text-bg-warning", "text-bg-secondary");

      if (!Number.isFinite(reserved) || total <= 0) {
        el.classList.add("text-bg-secondary");
        el.textContent = "—";
        el.title = "Availability unknown";
        return;
      }

      if (reserved === 0) {
        el.classList.add("text-bg-success");
        el.textContent = "Fully Available";
        el.title = `0/${total} reserved`;
        return;
      }

      if (reserved >= total) {
        el.classList.add("text-bg-danger");
        el.textContent = "Fully Booked";
        el.title = `${total}/${total} reserved`;
        return;
      }

      el.classList.add("text-bg-warning");
      el.textContent = "Partially Booked";
      el.title = `${reserved}/${total} reserved`;
    };

    const updatePerCardSelectionUI = () => {
      selectionTextById.forEach((el) => {
        el.textContent = "No slot selected";
      });

      reserveBtnById.forEach((btn) => {
        btn.textContent = "Reserve";
        setDisabled(btn, true);
      });

      if (!selection) return;

      const label = slotLabelByValue.get(selection.slot);
      if (!label) return;

      const selectionTextEl = selectionTextById.get(selection.roomTypeId);
      if (selectionTextEl) selectionTextEl.textContent = `Selected: ${label}`;

      const reserveBtn = reserveBtnById.get(selection.roomTypeId);
      if (reserveBtn) {
        reserveBtn.textContent = `Reserve ${label}`;
        setDisabled(reserveBtn, isBusy());
      }
    };

    const renderSlotsForRoom = (roomTypeId, timeSlots) => {
      const wrap = slotWrapById.get(Number(roomTypeId));
      if (!wrap) return;

      const reserved = reservedSetByRoomTypeId.get(Number(roomTypeId)) || new Set();

      wrap.innerHTML = (timeSlots || [])
        .map((s) => {
          const slotValue = Number(s.value);
          const slotLabel = String(s.label || slotValue);
          const isReserved = reserved.has(slotValue);
          const isSelected =
            selection && Number(selection.roomTypeId) === Number(roomTypeId) && Number(selection.slot) === slotValue;

          if (isReserved) {
            return `
              <button
                type="button"
                class="btn btn-sm btn-danger"
                disabled
                aria-disabled="true"
                title="Reserved"
                aria-label="Reserved: ${escapeHtml(slotLabel)}"
              >
                ${escapeHtml(slotLabel)} · Reserved
              </button>
            `;
          }

          const cls = isSelected ? "btn-primary" : "btn-outline-success";
          const pressed = isSelected ? "true" : "false";
          const text = isSelected ? `${slotLabel} · Selected` : slotLabel;

          return `
            <button
              type="button"
              class="btn btn-sm ${cls}"
              data-action="select-slot"
              data-room-type-id="${roomTypeId}"
              data-slot="${slotValue}"
              aria-pressed="${pressed}"
              aria-label="${escapeHtml(isSelected ? "Selected" : "Select")}: ${escapeHtml(slotLabel)}"
              title="${escapeHtml(isSelected ? "Selected" : "Available")}"
            >
              ${escapeHtml(text)}
            </button>
          `;
        })
        .join("");
    };

    const renderAllRooms = (payload) => {
      const timeSlots = Array.isArray(payload?.time_slots) ? payload.time_slots : [];
      const roomTypes = Array.isArray(payload?.room_types) ? payload.room_types : [];

      slotLabelByValue = new Map(timeSlots.map((s) => [Number(s.value), String(s.label || s.value)]));

      reservedSetByRoomTypeId = new Map();
      roomTypes.forEach((rt) => {
        const id = Number(rt.id);
        const reserved = new Set(Array.isArray(rt.reserved_slots) ? rt.reserved_slots.map(Number) : []);
        reservedSetByRoomTypeId.set(id, reserved);

        applySummaryBadge(id, { reservedCount: reserved.size, totalSlots: timeSlots.length });
        setText(slotStatusById.get(id), `Updated for ${payload.date}`);
        renderSlotsForRoom(id, timeSlots);
      });

      updatePerCardSelectionUI();
      applyFilter();
    };

    const showLoadingPlaceholders = () => {
      slotStatusById.forEach((el) => {
        el.textContent = "Loading…";
      });
      slotWrapById.forEach((wrap) => {
        wrap.innerHTML = `
          <span class="badge text-bg-secondary">
            <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            Loading…
          </span>
        `;
      });
    };

    const setBusyUI = () => {
      const busy = isBusy();
      if (roomCardsWrap) {
        roomCardsWrap.classList.toggle("is-loading", busy);
        roomCardsWrap.setAttribute("aria-busy", busy ? "true" : "false");
      }
      dateInput.disabled = busy;
      if (filterInput) filterInput.disabled = busy;

      // Reserve buttons depend on the current selection.
      updatePerCardSelectionUI();
    };

    const clearSelection = () => {
      selection = null;
      updatePerCardSelectionUI();

      // Remove "Selected" highlight from buttons by re-rendering with current payload.
      const date = dateInput.value;
      const payload = date ? availabilityCacheByDate.get(date) : null;
      if (payload) renderAllRooms(payload);
    };

    const applyFilter = () => {
      if (!filterInput) return;
      const selectedRoomTypeId = filterInput.value ? Number(filterInput.value) : null;

      if (!selectedRoomTypeId) {
        // Show all room types
        colById.forEach((col) => col.classList.remove("d-none"));
        return;
      }

      // Show only the selected room type
      colById.forEach((col, roomTypeId) => {
        col.classList.toggle("d-none", Number(roomTypeId) !== selectedRoomTypeId);
      });
    };

    filterInput?.addEventListener("change", () => {
      if (isBusy()) return;
      applyFilter();
    });

    const loadAvailability = async ({ force = false } = {}) => {
      const date = dateInput.value;
      if (!date) return;

      if (!force && availabilityCacheByDate.has(date)) {
        const cached = availabilityCacheByDate.get(date);
        renderAllRooms(cached);
        setText(roomCardsStatusEl, `Updated for ${cached.date} (cached)`);
        return;
      }

      const mySeq = ++requestSeq;
      if (controller) controller.abort();
      controller = new AbortController();

      inFlight = true;
      setBusyUI();
      setText(roomCardsStatusEl, "Loading…");
      showLoadingPlaceholders();

      try {
        const payload = await window.App.fetchJSON(`/api/availability/?date=${encodeURIComponent(date)}`, {
          signal: controller.signal,
        });
        if (mySeq !== requestSeq) return;

        availabilityCacheByDate.set(date, payload);
        renderAllRooms(payload);
        setText(roomCardsStatusEl, `Updated for ${payload.date}`);
      } catch (e) {
        if (e?.name === "AbortError") return;
        setText(roomCardsStatusEl, "Failed");
        const serverMsg = e?.data?.error || null;
        window.App.toast(serverMsg || "Failed to load availability. Please try again.", { variant: "danger" });
        slotStatusById.forEach((el) => {
          el.textContent = "Failed";
        });
      } finally {
        if (mySeq === requestSeq) inFlight = false;
        setBusyUI();
      }
    };

    const debouncedLoad = debounce(() => loadAvailability(), 350);

    const onDateChanged = () => {
      selection = null;
      updatePerCardSelectionUI();
      debouncedLoad();
    };

    dateInput.addEventListener("change", () => onDateChanged());
    dateInput.addEventListener("input", () => onDateChanged());

    roomCardsGrid.addEventListener("click", async (evt) => {
      const slotBtn = evt.target?.closest?.('button[data-action="select-slot"][data-room-type-id][data-slot]');
      if (slotBtn) {
        if (isBusy()) return;
        const roomTypeId = Number(slotBtn.dataset.roomTypeId);
        const slot = Number(slotBtn.dataset.slot);
        if (!roomTypeId || !slot) return;

        if (selection && selection.roomTypeId === roomTypeId && selection.slot === slot) {
          selection = null;
        } else {
          selection = { roomTypeId, slot };
        }

        const date = dateInput.value;
        const payload = date ? availabilityCacheByDate.get(date) : null;
        if (payload) renderAllRooms(payload);
        updatePerCardSelectionUI();
        return;
      }

      const reserveBtn = evt.target?.closest?.('button[data-action="reserve"][data-room-type-id]');
      if (!reserveBtn) return;
      if (isBusy()) return;

      const roomTypeId = Number(reserveBtn.dataset.roomTypeId);
      if (!selection || selection.roomTypeId !== roomTypeId) return;

      const date = dateInput.value;
      const roomName = roomNameById.get(roomTypeId) || "Room";
      const slotLabel = slotLabelByValue.get(selection.slot);
      if (!date || !slotLabel) return;

      const ok = await window.App.confirm({
        title: "Confirm reservation",
        body: `Reserve ${roomName} on ${date} at ${slotLabel}?`,
        okText: "Reserve",
        okVariant: "primary",
      });
      if (!ok) return;

      reserving = true;
      setBusyUI();
      setText(roomCardsStatusEl, "Reserving…");

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

        // Backend state changed -> invalidate cached availability for this date.
        availabilityCacheByDate.delete(date);
        selection = null;
        updatePerCardSelectionUI();

        await loadAvailability({ force: true });
      } catch (e) {
        const status = e?.status;
        const msg = e?.data?.error || "Failed to reserve. Please try again.";

        if (status === 401) {
          window.App.toast("Your session expired. Please login again.", { variant: "danger" });
          window.location.href = `/accounts/login/?next=${encodeURIComponent(window.location.pathname)}`;
          return;
        }

        window.App.toast(msg, { variant: "danger" });

        if (status === 409) {
          // Slot was taken; refresh to show the slot as reserved.
          availabilityCacheByDate.delete(date);
          selection = null;
          updatePerCardSelectionUI();
          await loadAvailability({ force: true });
          return;
        }

        setText(roomCardsStatusEl, "Failed");
      } finally {
        reserving = false;
        setBusyUI();
      }
    });

    // Initial load
    loadAvailability();
  });
})();


