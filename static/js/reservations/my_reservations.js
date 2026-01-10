(() => {
  function text(el) {
    return (el?.textContent || "").trim();
  }

  function updateCount(el, value) {
    if (!el) return;
    el.textContent = String(value);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!window.App?.fetchJSON || !window.App?.confirm || !window.App?.toast) return;

    const upcomingBody = document.getElementById("upcomingBody");
    const upcomingCountEl = document.getElementById("upcomingCount");

    if (!upcomingBody) return;

    upcomingBody.addEventListener("click", async (evt) => {
      const btn = evt.target?.closest?.('button[data-action="cancel"][data-reservation-id]');
      if (!btn) return;

      const reservationId = Number(btn.dataset.reservationId);
      const row = btn.closest("[data-reservation-row]");

      const cells = row?.querySelectorAll?.("td") || [];
      const roomName = text(cells[0]);
      const dateText = text(cells[1]);
      const slotText = text(cells[2]);

      const ok = await window.App.confirm({
        title: "Cancel reservation",
        body: `Cancel ${roomName} on ${dateText} at ${slotText}?`,
        okText: "Cancel reservation",
        okVariant: "danger",
      });
      if (!ok) return;

      btn.disabled = true;
      const oldLabel = btn.textContent;
      btn.textContent = "Cancelling…";

      try {
        await window.App.fetchJSON(`/api/reservations/${reservationId}/cancel/`, { method: "POST" });
        window.App.toast("Reservation cancelled.", { variant: "success" });

        row?.remove();

        const remainingRows = upcomingBody.querySelectorAll("[data-reservation-row]").length;
        updateCount(upcomingCountEl, remainingRows);

        if (remainingRows === 0) {
          upcomingBody.innerHTML = `
            <tr>
              <td colspan="4" class="text-body-secondary">No upcoming reservations yet.</td>
            </tr>
          `;
        }
      } catch (e) {
        const status = e?.status;
        const msg = e?.data?.error || "Failed to cancel reservation. Please try again.";

        if (status === 401) {
          window.App.toast("Your session expired. Please login again.", { variant: "danger" });
          window.location.href = `/accounts/login/?next=${encodeURIComponent(window.location.pathname)}`;
          return;
        }

        window.App.toast(msg, { variant: "danger" });
      } finally {
        btn.disabled = false;
        btn.textContent = oldLabel;
      }
    });
  });
})();


