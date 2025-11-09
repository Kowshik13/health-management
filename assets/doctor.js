import {
  bindSignOut,
  disableWhilePending,
  fetchJSON,
  formatDateTime,
  getUserEmail,
  loadConfig,
  requireRole,
  showToast,
  statusBadge,
} from "./app.js";

const state = {
  appointments: [],
  currentAppointmentId: null,
  pollHandle: null,
  activeTab: "pending",
};

function setTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('[role="tab"]').forEach((button) => {
    const isActive = button.id === (tab === "pending" ? "tabPending" : "tabSchedule");
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  document.querySelector("#pendingPanel").hidden = tab !== "pending";
  document.querySelector("#schedulePanel").hidden = tab !== "schedule";
}

function renderEmpty(container, message) {
  container.innerHTML = "";
  const div = document.createElement("div");
  div.className = "empty-state";
  div.textContent = message;
  container.appendChild(div);
}

function extractSummary(appointment) {
  const summary = appointment.vitalsSummary || {};
  const allergies = Array.isArray(summary.allergies) ? summary.allergies.join(", ") : "Not provided";
  return {
    allergies,
    bmi: summary.bmi,
  };
}

function renderAppointmentCard(appointment, options = {}) {
  const card = document.createElement("article");
  card.className = "list-item";
  card.setAttribute("role", "listitem");
  const header = document.createElement("div");
  header.className = "list-item-header";
  const details = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = formatDateTime(appointment.slotISO);
  const patientMeta = document.createElement("p");
  patientMeta.className = "helper-text";
  patientMeta.textContent = `Patient ID: ${appointment.patientId}`;
  details.appendChild(title);
  details.appendChild(patientMeta);
  header.appendChild(details);
  const status = document.createElement("div");
  status.innerHTML = statusBadge(appointment.status);
  header.appendChild(status);
  card.appendChild(header);

  const chips = document.createElement("div");
  chips.className = "chips";
  const complaintChip = document.createElement("span");
  complaintChip.className = "badge";
  complaintChip.textContent = appointment.chiefComplaint || "No complaint";
  chips.appendChild(complaintChip);
  if (appointment.recommendedSpecialty) {
    const specialtyChip = document.createElement("span");
    specialtyChip.className = "badge info";
    specialtyChip.textContent = appointment.recommendedSpecialty;
    chips.appendChild(specialtyChip);
  }
  card.appendChild(chips);

  const summary = extractSummary(appointment);
  const list = document.createElement("dl");
  list.className = "vitals-list";
  const allergiesRow = document.createElement("div");
  const allergiesTerm = document.createElement("dt");
  allergiesTerm.textContent = "Allergies";
  const allergiesValue = document.createElement("dd");
  allergiesValue.textContent = summary.allergies;
  allergiesRow.appendChild(allergiesTerm);
  allergiesRow.appendChild(allergiesValue);
  list.appendChild(allergiesRow);
  if (summary.bmi) {
    const bmiRow = document.createElement("div");
    const bmiTerm = document.createElement("dt");
    bmiTerm.textContent = "BMI";
    const bmiValue = document.createElement("dd");
    bmiValue.textContent = String(summary.bmi);
    bmiRow.appendChild(bmiTerm);
    bmiRow.appendChild(bmiValue);
    list.appendChild(bmiRow);
  }
  card.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "list-item-actions";
  (options.actions || []).forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action.variant === "danger" ? "danger" : "secondary";
    button.textContent = action.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      action.handler(appointment, button);
    });
    actions.appendChild(button);
  });
  card.appendChild(actions);

  card.addEventListener("click", () => {
    state.currentAppointmentId = appointment.appointmentId;
    renderPatientSummary(appointment);
  });

  return card;
}

async function confirmAppointment(appointment, button) {
  try {
    await disableWhilePending(
      button,
      fetchJSON(`/appointments/${appointment.appointmentId}/confirm`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    showToast("Appointment confirmed", "success");
    await loadAppointments();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to confirm", "error");
  }
}

async function declineAppointment(appointment, button) {
  try {
    await disableWhilePending(
      button,
      fetchJSON(`/appointments/${appointment.appointmentId}/decline`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    showToast("Appointment declined", "success");
    await loadAppointments();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to decline", "error");
  }
}

function renderAppointments() {
  const pendingContainer = document.querySelector("#pendingRequests");
  const scheduleContainer = document.querySelector("#confirmedSchedule");
  pendingContainer.innerHTML = "";
  scheduleContainer.innerHTML = "";

  const pending = state.appointments.filter((item) => item.status === "PENDING");
  const confirmed = state.appointments.filter((item) => item.status === "CONFIRMED");

  if (!pending.length) {
    renderEmpty(pendingContainer, "No pending requests right now.");
  } else {
    pending.forEach((appointment) => {
      const card = renderAppointmentCard(appointment, {
        actions: [
          { label: "Confirm", handler: confirmAppointment },
          { label: "Decline", handler: declineAppointment, variant: "danger" },
        ],
      });
      pendingContainer.appendChild(card);
    });
  }

  if (!confirmed.length) {
    renderEmpty(scheduleContainer, "No confirmed appointments yet.");
  } else {
    confirmed.forEach((appointment) => {
      const card = renderAppointmentCard(appointment);
      scheduleContainer.appendChild(card);
    });
  }

  const lastUpdated = document.querySelector("#lastUpdated");
  if (state.appointments.length) {
    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    lastUpdated.textContent = "";
  }
}

function renderHealthSummary(items) {
  const container = document.querySelector("#healthSummary");
  container.innerHTML = "";
  if (!items.length) {
    renderEmpty(container, "No additional health records for this patient.");
    return;
  }
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "list-item";
    const header = document.createElement("div");
    header.className = "list-item-header";
    const title = document.createElement("h3");
    title.textContent = item.recordId || "Record";
    const meta = document.createElement("p");
    meta.className = "helper-text";
    meta.textContent = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "";
    header.appendChild(title);
    header.appendChild(meta);
    card.appendChild(header);
    const pre = document.createElement("pre");
    pre.className = "helper-text vitals-pre";
    pre.textContent = JSON.stringify(item.summary || item.payload || item, null, 2);
    card.appendChild(pre);
    container.appendChild(card);
  });
}

async function renderPatientSummary(appointment) {
  const container = document.querySelector("#healthSummary");
  container.innerHTML = '<div class="helper-text">Loading health summary…</div>';
  try {
    const data = await fetchJSON(`/patient/${appointment.patientId}/health/summary?appointmentId=${appointment.appointmentId}`);
    renderHealthSummary(data.items || []);
  } catch (error) {
    console.error(error);
    renderEmpty(container, error.message || "Unable to load patient summary");
  }
}

async function loadAppointments() {
  const pendingContainer = document.querySelector("#pendingRequests");
  pendingContainer.innerHTML = '<div class="helper-text">Refreshing appointments…</div>';
  try {
    const { items = [] } = await fetchJSON("/appointments/doctor");
    state.appointments = items;
    renderAppointments();
    if (state.currentAppointmentId) {
      const current = items.find((item) => item.appointmentId === state.currentAppointmentId);
      if (current) {
        await renderPatientSummary(current);
      } else {
        state.currentAppointmentId = null;
        renderEmpty(document.querySelector("#healthSummary"), "Select an appointment to view vitals.");
      }
    }
  } catch (error) {
    console.error(error);
    renderEmpty(pendingContainer, error.message || "Unable to load appointments");
  }
}

function startPolling() {
  stopPolling();
  state.pollHandle = setInterval(loadAppointments, 10000);
}

function stopPolling() {
  if (state.pollHandle) {
    clearInterval(state.pollHandle);
    state.pollHandle = null;
  }
}

function attachTabEvents() {
  document.querySelector("#tabPending").addEventListener("click", () => setTab("pending"));
  document.querySelector("#tabSchedule").addEventListener("click", () => setTab("schedule"));
}

async function init() {
  await loadConfig();
  if (!requireRole(["DOCTOR"])) {
    return;
  }
  document.querySelector("#userEmail").textContent = getUserEmail();
  bindSignOut(document.querySelector("#signOutBtn"));
  attachTabEvents();
  setTab("pending");
  renderEmpty(document.querySelector("#healthSummary"), "Select an appointment to view vitals.");
  await loadAppointments();
  startPolling();
}

window.addEventListener("beforeunload", stopPolling);
window.addEventListener("DOMContentLoaded", init);
