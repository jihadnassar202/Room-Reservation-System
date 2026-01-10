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

  function renderMatrix(headEl, bodyEl, payload, filterText, selection, highlightRoomTypeId) {
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
          <tr class="${Number(highlightRoomTypeId) === Number(rt.id) ? "room-row-highlight" : ""}" data-room-type-id="${rt.id}">
            <th scope="row" class="fw-semibold">${escapeHtml(rt.name)}</th>
            ${cols}
          </tr>
        `;
      })
      .join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const filtersForm = document.getElementById("checkoutFiltersForm");
    const dateInput = document.getElementById("checkoutDate");
    const filterInput = document.getElementById("roomFilter");
    const statusEl = document.getElementById("availabilityStatus");
    const headEl = document.getElementById("availabilityHead");
    const bodyEl = document.getElementById("availabilityBody");
    const selectedSummaryEl = document.getElementById("selectedSummary");
    const reserveBtn = document.getElementById("reserveSelectedBtn");
    const matrixWrap = document.getElementById("availabilityMatrixWrap");

    const roomCardsWrap = document.getElementById("roomCardsWrap");
    const roomCardsStatusEl = document.getElementById("roomCardsStatus");
    const roomCardsGrid = document.getElementById("roomCardsGrid");

    // Slot picker modal (opened from Room Cards).
    const slotModalEl = document.getElementById("roomSlotModal");
    const slotModalSubtitleEl = document.getElementById("roomSlotModalSubtitle");
    const slotModalStatusEl = document.getElementById("roomSlotModalStatus");
    const slotButtonsEl = document.getElementById("roomSlotButtons");
    const slotSelectionSummaryEl = document.getElementById("roomSlotSelectionSummary");
    const slotReserveBtn = document.getElementById("roomSlotReserveBtn");

    if (!dateInput || !headEl || !bodyEl || !window.App?.fetchJSON) return;

    const slotModal =
      slotModalEl && window.bootstrap?.Modal ? window.bootstrap.Modal.getOrCreateInstance(slotModalEl) : null;
    let slotModalOpen = false;
    slotModalEl?.addEventListener("shown.bs.modal", () => {
      slotModalOpen = true;
    });
    slotModalEl?.addEventListener("hidden.bs.modal", () => {
      slotModalOpen = false;
    });

    // Prevent full page reloads when JS is available (non-JS users can still submit this GET form).
    filtersForm?.addEventListener("submit", (evt) => {
      evt.preventDefault();
    });

    // Cache strategy:
    // - summaryCacheByDate: caches lightweight per-date counts for Room Card badges.
    // - availabilityCache: caches detailed payloads per (room_type_id, date) so repeated card clicks
    //   don't refetch; we intentionally force-refresh after create/409 to avoid stale UI.
    const summaryCacheByDate = new Map(); // date -> summary payload
    const availabilityCache = new Map(); // `${roomTypeId}::${date}` -> detail payload

    const roomCardEls = roomCardsGrid ? Array.from(roomCardsGrid.querySelectorAll(".room-card[data-room-type-id]")) : [];
    const roomNameById = new Map(); // roomTypeId -> name (from server-rendered cards)
    roomCardEls.forEach((el) => {
      const id = Number(el.dataset.roomTypeId);
      if (!id) return;
      const name = String(el.dataset.roomTypeName || "").trim();
      if (name) roomNameById.set(id, name);
    });

    const summaryBadgeByRoomTypeId = new Map();
    if (roomCardsWrap) {
      Array.from(roomCardsWrap.querySelectorAll('[data-role="room-card-summary"][data-room-type-id]')).forEach((el) => {
        const id = Number(el.dataset.roomTypeId);
        if (!id) return;
        summaryBadgeByRoomTypeId.set(id, el);
      });
    }

    let lastPayload = null;
    let selection = null; // { roomTypeId:number, slot:number }
    let activeRoomTypeId = null;
    let highlightedRoomTypeId = null;

    let inFlightSummary = false;
    let inFlightDetail = false;
    let reserving = false;

    // Derived from the most recently loaded availability payload.
    // We keep this separate from lastPayload so selection UI can remain stable across filters/highlights.
    let slotLabelByValue = new Map(); // slotValue -> label

    let summarySeq = 0;
    let summaryController = null;
    let detailSeq = 0;
    let detailController = null;

    const isBusy = () => inFlightSummary || inFlightDetail || reserving;

    const setModalReserveEnabled = (enabled) => {
      if (!slotReserveBtn) return;
      slotReserveBtn.disabled = !enabled || isBusy();
      slotReserveBtn.setAttribute("aria-disabled", slotReserveBtn.disabled ? "true" : "false");
    };

    const setReserveEnabled = (enabled) => {
      if (!reserveBtn) return;
      reserveBtn.disabled = !enabled || isBusy();
      reserveBtn.setAttribute("aria-disabled", reserveBtn.disabled ? "true" : "false");
    };

    const setBusyUI = () => {
      const busy = isBusy();
      if (matrixWrap) {
        matrixWrap.classList.toggle("is-loading", busy);
        matrixWrap.setAttribute("aria-busy", busy ? "true" : "false");
      }
      if (roomCardsWrap) {
        roomCardsWrap.classList.toggle("is-loading", busy);
        roomCardsWrap.setAttribute("aria-busy", busy ? "true" : "false");
      }
      dateInput.disabled = busy;
      if (filterInput) filterInput.disabled = busy;
      setReserveEnabled(Boolean(selection));
      setModalReserveEnabled(Boolean(selection));
    };

    const setActiveCard = (roomTypeId) => {
      roomCardEls.forEach((el) => {
        const isActive = Number(el.dataset.roomTypeId) === Number(roomTypeId);
        el.classList.toggle("is-active", isActive);
        el.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    };

    const setSummaryBadge = (roomTypeId, { text, variant, title }) => {
      const el = summaryBadgeByRoomTypeId.get(Number(roomTypeId));
      if (!el) return;
      el.classList.remove("text-bg-success", "text-bg-danger", "text-bg-warning", "text-bg-secondary");
      el.classList.add(`text-bg-${variant || "secondary"}`);
      el.textContent = text || "—";
      if (title) el.title = title;
    };

    const updateSelectedSummary = () => {
      const targets = [selectedSummaryEl, slotSelectionSummaryEl].filter(Boolean);
      if (!targets.length) return;
      if (!selection) {
        targets.forEach((el) => {
          el.textContent = "No slot selected";
        });
        return;
      }
      const roomName =
        roomNameById.get(selection.roomTypeId) ||
        (lastPayload?.room_types || []).find((rt) => rt.id === selection.roomTypeId)?.name ||
        "Room";
      const slotLabel = slotLabelByValue.get(selection.slot);
      if (!slotLabel) {
        targets.forEach((el) => {
          el.textContent = "No slot selected";
        });
        return;
      }
      targets.forEach((el) => {
        el.textContent = `Selected: ${roomName} · ${slotLabel}`;
      });
    };

    const applySummaryPayload = (payload) => {
      const total = Number(payload?.total_slots) || 0;
      const rows = Array.isArray(payload?.room_types) ? payload.room_types : [];
      const reservedCountById = new Map(rows.map((rt) => [Number(rt.id), Number(rt.reserved_count) || 0]));

      // Update every server-rendered card badge (stable ordering, no DOM churn).
      summaryBadgeByRoomTypeId.forEach((_, id) => {
        const reserved = reservedCountById.get(Number(id));
        if (!Number.isFinite(reserved) || total <= 0) {
          setSummaryBadge(id, { text: "—", variant: "secondary", title: "Availability unknown" });
          return;
        }
        if (reserved === 0) {
          setSummaryBadge(id, { text: "Fully Available", variant: "success", title: `0/${total} reserved` });
          return;
        }
        if (reserved >= total) {
          setSummaryBadge(id, { text: "Fully Booked", variant: "danger", title: `${total}/${total} reserved` });
          return;
        }
        setSummaryBadge(id, { text: "Partially Booked", variant: "warning", title: `${reserved}/${total} reserved` });
      });
    };

    const loadSummaries = async ({ force = false } = {}) => {
      const date = dateInput.value;
      if (!date) return;

      if (!force && summaryCacheByDate.has(date)) {
        const cached = summaryCacheByDate.get(date);
        applySummaryPayload(cached);
        setStatus(roomCardsStatusEl, `Updated for ${cached.date} (cached)`);
        return;
      }

      const mySeq = ++summarySeq;
      if (summaryController) summaryController.abort();
      summaryController = new AbortController();

      inFlightSummary = true;
      setBusyUI();
      setStatus(roomCardsStatusEl, "Loading…");

      try {
        const payload = await window.App.fetchJSON(
          `/api/availability/?date=${encodeURIComponent(date)}&summary=1`,
          { signal: summaryController.signal }
        );
        if (mySeq !== summarySeq) return;

        summaryCacheByDate.set(date, payload);
        applySummaryPayload(payload);
        setStatus(roomCardsStatusEl, `Updated for ${payload.date}`);
      } catch (e) {
        if (e?.name === "AbortError") return;
        setStatus(roomCardsStatusEl, "Failed");
        const serverMsg = e?.data?.error || null;
        window.App.toast(serverMsg || "Failed to load availability. Please try again.", { variant: "danger" });
      } finally {
        if (mySeq === summarySeq) inFlightSummary = false;
        setBusyUI();
      }
    };

    const loadRoomAvailability = async (roomTypeId, { force = false } = {}) => {
      const date = dateInput.value;
      if (!date || !roomTypeId) return null;

      const cacheKey = `${roomTypeId}::${date}`;
      if (!force && availabilityCache.has(cacheKey)) {
        const cached = availabilityCache.get(cacheKey);
        lastPayload = cached;
        slotLabelByValue = new Map((cached.time_slots || []).map((s) => [Number(s.value), s.label]));

        renderMatrix(headEl, bodyEl, cached, filterInput?.value || "", selection, highlightedRoomTypeId);
        updateSelectedSummary();
        setStatus(statusEl, `Updated for ${cached.date} (cached)`);
        return cached;
      }

      const mySeq = ++detailSeq;
      if (detailController) detailController.abort();
      detailController = new AbortController();

      inFlightDetail = true;
      setBusyUI();
      setStatus(statusEl, "Loading…");

      try {
        const payload = await window.App.fetchJSON(
          `/api/availability/?date=${encodeURIComponent(date)}&room_type_id=${encodeURIComponent(roomTypeId)}`,
          { signal: detailController.signal }
        );
        if (mySeq !== detailSeq) return;

        availabilityCache.set(cacheKey, payload);
        lastPayload = payload;
        slotLabelByValue = new Map((payload.time_slots || []).map((s) => [Number(s.value), s.label]));

        // If the currently selected slot became reserved (e.g., race condition / another user),
        // drop the selection so UI state matches the backend source-of-truth.
        const rt = (payload.room_types || [])[0];
        const reservedSet = new Set(Array.isArray(rt?.reserved_slots) ? rt.reserved_slots.map(Number) : []);
        if (selection && selection.roomTypeId === roomTypeId && reservedSet.has(selection.slot)) {
          selection = null;
          setReserveEnabled(false);
        }

        renderMatrix(headEl, bodyEl, payload, filterInput?.value || "", selection, highlightedRoomTypeId);
        updateSelectedSummary();
        setStatus(statusEl, `Updated for ${payload.date}`);
        return payload;
      } catch (e) {
        if (e?.name === "AbortError") return;
        setStatus(statusEl, "Failed");
        const serverMsg = e?.data?.error || null;
        window.App.toast(serverMsg || "Failed to load availability. Please try again.", { variant: "danger" });
        return null;
      } finally {
        if (mySeq === detailSeq) inFlightDetail = false;
        setBusyUI();
      }
    };

    const renderSlotButtons = (payload, roomTypeId) => {
      if (!slotButtonsEl) return;
      const timeSlots = payload?.time_slots || [];
      const rt =
        (payload?.room_types || []).find((r) => Number(r.id) === Number(roomTypeId)) || (payload?.room_types || [])[0];
      const reservedSet = new Set(Array.isArray(rt?.reserved_slots) ? rt.reserved_slots.map(Number) : []);

      if (!timeSlots.length) {
        slotButtonsEl.innerHTML = `<div class="text-body-secondary">No time slots.</div>`;
        return;
      }

      slotButtonsEl.innerHTML = timeSlots
        .map((s) => {
          const slotValue = Number(s.value);
          const label = escapeHtml(s.label);
          const isReserved = reservedSet.has(slotValue);
          const isSelected = selection && selection.roomTypeId === roomTypeId && selection.slot === slotValue;
          const cls = isReserved ? "btn-danger" : isSelected ? "btn-primary" : "btn-outline-success";
          const text = isReserved ? `${label} · Reserved` : isSelected ? `${label} · Selected` : label;
          const pressed = isSelected ? "true" : "false";

          if (isReserved) {
            return `
              <button
                type="button"
                class="btn btn-sm ${cls}"
                data-room-type-id="${roomTypeId}"
                data-slot="${slotValue}"
                disabled
                aria-disabled="true"
                title="Reserved"
              >
                ${text}
              </button>
            `;
          }

          return `
            <button
              type="button"
              class="btn btn-sm ${cls}"
              data-room-type-id="${roomTypeId}"
              data-slot="${slotValue}"
              aria-pressed="${pressed}"
              aria-label="${escapeHtml(isSelected ? "Selected" : "Select")}: ${label}"
              title="${escapeHtml(isSelected ? "Selected" : "Available")}"
            >
              ${text}
            </button>
          `;
        })
        .join("");
    };

    const refreshActiveRoomUI = async ({ force = false } = {}) => {
      if (!activeRoomTypeId) return null;
      const payload = await loadRoomAvailability(activeRoomTypeId, { force });
      if (payload && slotModalOpen) {
        renderSlotButtons(payload, activeRoomTypeId);
        if (slotModalSubtitleEl) {
          const roomName = roomNameById.get(activeRoomTypeId) || "Room";
          slotModalSubtitleEl.textContent = `${roomName} · ${payload.date}`;
        }
        setStatus(slotModalStatusEl, `Updated for ${payload.date}`);
      }
      return payload;
    };

    const debouncedRefresh = debounce(async () => {
      await loadSummaries();
      await refreshActiveRoomUI();
    }, 350);

    const onDateChanged = () => {
      // Date changes invalidate the slot selection (selection is date-scoped).
      selection = null;
      setReserveEnabled(false);
      setModalReserveEnabled(false);
      updateSelectedSummary();
      debouncedRefresh();
    };

    dateInput.addEventListener("change", () => onDateChanged());
    dateInput.addEventListener("input", () => onDateChanged());

    filterInput?.addEventListener("input", () => {
      if (isBusy()) return;
      if (!lastPayload) return;
      renderMatrix(headEl, bodyEl, lastPayload, filterInput.value, selection, highlightedRoomTypeId);
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
        setModalReserveEnabled(false);
      } else {
        selection = { roomTypeId, slot };
        setReserveEnabled(true);
        setModalReserveEnabled(true);
      }

      renderMatrix(headEl, bodyEl, lastPayload, filterInput?.value || "", selection, highlightedRoomTypeId);
      updateSelectedSummary();
    });

    // Slot picker modal selection
    slotButtonsEl?.addEventListener("click", (evt) => {
      const btn = evt.target?.closest?.("button[data-room-type-id][data-slot]");
      if (!btn) return;
      if (isBusy()) return;
      if (!lastPayload) return;

      const roomTypeId = Number(btn.dataset.roomTypeId);
      const slot = Number(btn.dataset.slot);

      if (selection && selection.roomTypeId === roomTypeId && selection.slot === slot) {
        selection = null;
      } else {
        selection = { roomTypeId, slot };
      }

      setReserveEnabled(Boolean(selection));
      setModalReserveEnabled(Boolean(selection));
      renderSlotButtons(lastPayload, roomTypeId);
      renderMatrix(headEl, bodyEl, lastPayload, filterInput?.value || "", selection, highlightedRoomTypeId);
      updateSelectedSummary();
    });

    const reserveSelection = async () => {
      if (!selection) return;
      if (!window.App?.confirm || !window.App?.toast) return;

      const date = dateInput.value;
      const roomName = roomNameById.get(selection.roomTypeId) || "Room";
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
      setStatus(statusEl, "Reserving…");
      setStatus(slotModalStatusEl, "Reserving…");
      setReserveEnabled(false);

      const reservedRoomTypeId = selection.roomTypeId;
      const reservedSlot = selection.slot;

      try {
        await window.App.fetchJSON("/api/reservations/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_type_id: reservedRoomTypeId,
            date,
            slot: reservedSlot,
          }),
        });

        window.App.toast("Reservation created successfully.", { variant: "success" });

        // Invalidate caches for this date because the backend state changed.
        summaryCacheByDate.delete(date);
        availabilityCache.delete(`${reservedRoomTypeId}::${date}`);
        selection = null;
        updateSelectedSummary();

        await loadSummaries({ force: true });
        await refreshActiveRoomUI({ force: true });

        // If the reservation was made from the slot picker modal, close it after success.
        if (slotModalOpen && slotModal) slotModal.hide();
      } catch (e) {
        const status = e?.status;
        const msg = e?.data?.error || "Failed to reserve. Please try again.";

        if (status === 401) {
          window.App.toast("Your session expired. Please login again.", { variant: "danger" });
          window.location.href = `/accounts/login/?next=${encodeURIComponent(window.location.pathname)}`;
          return;
        }

        if (status === 409) {
          window.App.toast(msg, { variant: "danger" });
          // Slot was taken; refresh to show the slot as reserved.
          summaryCacheByDate.delete(date);
          availabilityCache.delete(`${reservedRoomTypeId}::${date}`);
          selection = null;
          updateSelectedSummary();
          await loadSummaries({ force: true });
          await refreshActiveRoomUI({ force: true });
          return;
        }

        window.App.toast(msg, { variant: "danger" });
        setStatus(statusEl, "Failed");
        setStatus(slotModalStatusEl, "Failed");
      } finally {
        reserving = false;
        setBusyUI();
      }
    };

    reserveBtn?.addEventListener("click", () => reserveSelection());
    slotReserveBtn?.addEventListener("click", () => reserveSelection());

    const selectRoomType = async (roomTypeId, { openModal = false } = {}) => {
      if (!roomTypeId) return;
      if (isBusy()) return;
      const roomName = roomNameById.get(roomTypeId) || "";

      activeRoomTypeId = roomTypeId;
      highlightedRoomTypeId = roomTypeId;
      setActiveCard(roomTypeId);

      // Requirement: clicking a card sets the room type filter to that RoomType.
      if (filterInput && roomName) {
        filterInput.value = roomName;
        filterInput.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // If a selection exists for another room, clear it to prevent reserving the wrong room by accident.
      if (selection && selection.roomTypeId !== roomTypeId) {
        selection = null;
        setReserveEnabled(false);
        setModalReserveEnabled(false);
        updateSelectedSummary();
      }

      // New UX: open a modal to choose a slot and reserve (still reuses the same backend endpoints).
      if (openModal && slotModal) {
        const date = dateInput.value || "";
        const titleRoom = roomName || "Room";
        if (slotModalSubtitleEl) slotModalSubtitleEl.textContent = `${titleRoom} · ${date}`;
        setStatus(slotModalStatusEl, "Loading…");
        if (slotButtonsEl) {
          slotButtonsEl.innerHTML = `
            <span class="badge text-bg-secondary">
              <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
              Loading…
            </span>
          `;
        }
        setModalReserveEnabled(Boolean(selection));
        slotModal.show();
      }

      const payload = await loadRoomAvailability(roomTypeId);
      if (openModal) {
        if (payload) {
          renderSlotButtons(payload, roomTypeId);
          setStatus(slotModalStatusEl, `Updated for ${payload.date}`);
          if (slotModalSubtitleEl) {
            const titleRoom = roomName || "Room";
            slotModalSubtitleEl.textContent = `${titleRoom} · ${payload.date}`;
          }
        } else {
          setStatus(slotModalStatusEl, "Failed");
          if (slotButtonsEl) {
            slotButtonsEl.innerHTML = `<div class="text-body-secondary">Failed to load availability.</div>`;
          }
        }
      }
    };

    // Click flow:
    // Room Card click -> open slot picker modal -> load availability for that room/date (AJAX, cached) -> reserve.
    roomCardsGrid?.addEventListener("click", (evt) => {
      const card = evt.target?.closest?.(".room-card[data-room-type-id]");
      if (!card) return;
      evt.preventDefault();
      const id = Number(card.dataset.roomTypeId);
      if (!id) return;
      selectRoomType(id, { openModal: true });
    });

    roomCardsGrid?.addEventListener("keydown", (evt) => {
      if (evt.key !== "Enter" && evt.key !== " ") return;
      const card = evt.target?.closest?.(".room-card[data-room-type-id]");
      if (!card) return;
      evt.preventDefault();
      const id = Number(card.dataset.roomTypeId);
      if (!id) return;
      selectRoomType(id, { openModal: true });
    });

    // Initial: if the URL already specifies a room type (e.g., direct link / no-JS fallback),
    // auto-load that room's availability, still without fetching every room at once.
    const params = new URLSearchParams(window.location.search || "");
    const preselectId = Number(params.get("room_type_id"));
    if (preselectId) {
      // If the page was opened via a card link, load the grid for that room without auto-opening the modal.
      selectRoomType(preselectId, { openModal: false });
    }

    // Always load card summaries for the selected date (lightweight).
    loadSummaries();
  });
})();


