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

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function setDisabled(els, disabled) {
    els.forEach((el) => {
      if (el) el.disabled = disabled;
    });
  }

  function setSlotOptions(selectEl, timeSlots, reservedSet) {
    if (!selectEl) return;
    const previous = selectEl.value;
    const available = timeSlots.filter((s) => !reservedSet.has(Number(s.value)));

    selectEl.innerHTML = "";
    if (!available.length) {
      selectEl.innerHTML = `<option value="">No slots available</option>`;
      selectEl.value = "";
      selectEl.disabled = true;
      return;
    }

    available.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = String(s.value);
      opt.textContent = s.label;
      selectEl.appendChild(opt);
    });

    const stillAvailable = available.some((s) => String(s.value) === String(previous));
    selectEl.value = stillAvailable ? previous : String(available[0].value);
    selectEl.disabled = false;
  }

  function renderBadges(container, timeSlots, reservedSet) {
    if (!container) return;
    container.innerHTML = timeSlots
      .map((s) => {
        const reserved = reservedSet.has(Number(s.value));
        const cls = reserved ? "text-bg-danger" : "text-bg-success";
        const label = reserved ? `Reserved · ${s.label}` : `Available · ${s.label}`;
        return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
      })
      .join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("reservationEditForm");
    if (!form || !window.App?.fetchJSON || !window.App?.confirm || !window.App?.toast) return;

    const reservationId = Number(form.dataset.reservationId);
    if (!reservationId) return;

    const roomTypeEl = form.querySelector('select[name="room_type"]');
    const dateEl = form.querySelector('input[name="date"]');
    const slotEl = form.querySelector('select[name="slot"]');
    const statusEl = document.getElementById("editStatus");
    const badgesEl = document.getElementById("editSlotBadges");
    const submitBtn = document.getElementById("saveReservationBtn");

    if (!roomTypeEl || !dateEl || !slotEl || !submitBtn) return;

    let inFlight = false;
    let requestSeq = 0;
    let controller = null;

    const updateSubmitEnabled = () => {
      const ok = Boolean(roomTypeEl.value && dateEl.value && slotEl.value);
      submitBtn.disabled = !ok || inFlight;
    };

    const loadAvailability = async () => {
      const roomTypeId = Number(roomTypeEl.value);
      const date = dateEl.value;
      if (!roomTypeId || !date) return;

      const mySeq = ++requestSeq;
      if (controller) controller.abort();
      controller = new AbortController();

      inFlight = true;
      updateSubmitEnabled();
      form.setAttribute("aria-busy", "true");
      setDisabled([roomTypeEl, dateEl], true);
      slotEl.innerHTML = `<option value="">Loading…</option>`;
      slotEl.value = "";
      slotEl.disabled = true;
      setText(statusEl, "Loading…");
      if (badgesEl) {
        badgesEl.innerHTML = `
          <span class="badge text-bg-secondary">
            <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            Loading…
          </span>
        `;
      }

      try {
        const payload = await window.App.fetchJSON(
          `/api/availability/?date=${encodeURIComponent(date)}&room_type_id=${encodeURIComponent(
            roomTypeId
          )}&exclude_reservation_id=${encodeURIComponent(reservationId)}`,
          { signal: controller.signal }
        );
        if (mySeq !== requestSeq) return;

        const rt = (payload.room_types || [])[0];
        const reservedSet = new Set(Array.isArray(rt?.reserved_slots) ? rt.reserved_slots.map(Number) : []);

        setSlotOptions(slotEl, payload.time_slots || [], reservedSet);
        renderBadges(badgesEl, payload.time_slots || [], reservedSet);
        setText(statusEl, `Updated for ${payload.date}`);
      } catch (e) {
        if (e?.name === "AbortError") return;
        const msg = e?.data?.error || "Failed to load availability.";
        window.App.toast(msg, { variant: "danger" });
        setText(statusEl, "Failed");
      } finally {
        if (mySeq === requestSeq) {
          inFlight = false;
          setDisabled([roomTypeEl, dateEl], false);
          updateSubmitEnabled();
          form.removeAttribute("aria-busy");
        }
      }
    };

    const debouncedLoad = debounce(loadAvailability, 350);

    roomTypeEl.addEventListener("change", () => debouncedLoad());
    dateEl.addEventListener("change", () => debouncedLoad());
    dateEl.addEventListener("input", () => debouncedLoad());
    slotEl.addEventListener("change", () => updateSubmitEnabled());

    form.addEventListener("submit", async (evt) => {
      evt.preventDefault();
      updateSubmitEnabled();
      if (submitBtn.disabled) return;

      const prevSlotDisabled = slotEl.disabled;
      const roomTypeId = Number(roomTypeEl.value);
      const date = dateEl.value;
      const slot = Number(slotEl.value);

      const roomName = roomTypeEl.options[roomTypeEl.selectedIndex]?.textContent || "Room";
      const slotLabel = slotEl.options[slotEl.selectedIndex]?.textContent || "Slot";

      const ok = await window.App.confirm({
        title: "Confirm changes",
        body: `Update reservation to ${roomName} on ${date} at ${slotLabel}?`,
        okText: "Save changes",
        okVariant: "primary",
      });
      if (!ok) return;

      inFlight = true;
      updateSubmitEnabled();
      setDisabled([roomTypeEl, dateEl], true);
      slotEl.disabled = true;
      setText(statusEl, "Saving…");
      form.setAttribute("aria-busy", "true");
      let refreshedAvailability = false;

      try {
        await window.App.fetchJSON(`/api/reservations/${reservationId}/update/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room_type_id: roomTypeId, date, slot }),
        });

        window.App.toast("Reservation updated successfully.", { variant: "success" });
        window.location.href = "/my-reservations/";
      } catch (e) {
        const status = e?.status;
        const msg = e?.data?.error || "Failed to update reservation. Please try again.";

        if (status === 401) {
          window.App.toast("Your session expired. Please login again.", { variant: "danger" });
          window.location.href = `/accounts/login/?next=${encodeURIComponent(window.location.pathname)}`;
          return;
        }

        window.App.toast(msg, { variant: "danger" });
        setText(statusEl, "Failed");

        if (status === 409) {
          await loadAvailability();
          refreshedAvailability = true;
        }
      } finally {
        inFlight = false;
        setDisabled([roomTypeEl, dateEl], false);
        if (!refreshedAvailability) {
          slotEl.disabled = prevSlotDisabled;
        }
        updateSubmitEnabled();
        form.removeAttribute("aria-busy");
      }
    });

    // Initial load
    updateSubmitEnabled();
    debouncedLoad();
  });
})();


