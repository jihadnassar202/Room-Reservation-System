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
    selectEl.value = stillAvailable ? previous : String(available[0]?.value || "");
    selectEl.disabled = false;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("reservationCreateForm");
    if (!form || !window.App?.fetchJSON) return;

    const roomTypeEl = form.querySelector('select[name="room_type"]');
    const dateEl = form.querySelector('input[name="date"]');
    const slotEl = form.querySelector('select[name="slot"]');
    const updateBtn = form.querySelector('button[name="action"][value="update"]');
    const helpText = document.getElementById("createSlotHelp");

    if (!roomTypeEl || !dateEl || !slotEl) return;

    let inFlight = false;
    let requestSeq = 0;
    let controller = null;

    const updateSubmitEnabled = () => {
      const reserveBtn = form.querySelector('button[name="action"][value="reserve"]');
      if (reserveBtn) {
        const ok = Boolean(roomTypeEl.value && dateEl.value && slotEl.value);
        reserveBtn.disabled = !ok || inFlight;
      }
    };

    const loadAvailability = async () => {
      const roomTypeId = Number(roomTypeEl.value);
      const date = dateEl.value;
      if (!roomTypeId || !date) {
        slotEl.innerHTML = `<option value="">Select room type and date first</option>`;
        slotEl.value = "";
        slotEl.disabled = true;
        updateSubmitEnabled();
        return;
      }

      const mySeq = ++requestSeq;
      if (controller) controller.abort();
      controller = new AbortController();

      inFlight = true;
      updateSubmitEnabled();
      form.setAttribute("aria-busy", "true");
      slotEl.innerHTML = `<option value="">Loading…</option>`;
      slotEl.value = "";
      slotEl.disabled = true;

      if (helpText) {
        helpText.textContent = "Loading available slots…";
      }

      try {
        const payload = await window.App.fetchJSON(
          `/api/availability/?date=${encodeURIComponent(date)}&room_type_id=${encodeURIComponent(roomTypeId)}`,
          { signal: controller.signal }
        );
        if (mySeq !== requestSeq) return;

        const rt = (payload.room_types || [])[0];
        const reservedSet = new Set(Array.isArray(rt?.reserved_slots) ? rt.reserved_slots.map(Number) : []);

        setSlotOptions(slotEl, payload.time_slots || [], reservedSet);
        updateSubmitEnabled();

        if (helpText) {
          const availableCount = (payload.time_slots || []).length - reservedSet.size;
          const totalCount = (payload.time_slots || []).length;
          helpText.textContent = `${availableCount} of ${totalCount} slots available for the selected room type and date.`;
        }
      } catch (e) {
        if (e?.name === "AbortError") return;
        const msg = e?.data?.error || "Failed to load availability.";
        window.App.toast(msg, { variant: "danger" });
        slotEl.innerHTML = `<option value="">Error loading slots</option>`;
        slotEl.value = "";
        slotEl.disabled = true;
        if (helpText) {
          helpText.textContent = "Error loading availability. Please try again.";
        }
      } finally {
        if (mySeq === requestSeq) {
          inFlight = false;
          updateSubmitEnabled();
          form.removeAttribute("aria-busy");
        }
      }
    };

    const debouncedLoad = debounce(loadAvailability, 350);

    // Hide the "Update available slots" button when JS is enabled
    if (updateBtn) {
      updateBtn.style.display = "none";
    }

    // Update help text to indicate auto-update
    if (helpText) {
      const originalText = helpText.textContent;
      helpText.innerHTML = `
        Only available time slots are displayed for your selected room and date.
        <span class="d-block">
          Options refresh instantly as you explore different rooms and dates.
        </span>
      `;
    }

    roomTypeEl.addEventListener("change", () => {
      debouncedLoad();
    });

    dateEl.addEventListener("change", () => {
      debouncedLoad();
    });

    dateEl.addEventListener("input", () => {
      debouncedLoad();
    });

    slotEl.addEventListener("change", () => {
      updateSubmitEnabled();
    });

    // Initial load if room type and date are already selected
    if (roomTypeEl.value && dateEl.value) {
      loadAvailability();
    }

    updateSubmitEnabled();
  });
})();

