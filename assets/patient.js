import {
  bindSignOut,
  disableWhilePending,
  fetchJSON,
  formatDateTime,
  getSession,
  getUserEmail,
  loadConfig,
  requireRole,
  seedDemoData,
  showToast,
  statusBadge,
} from "./app.js";
import {
  ALLERGY_OPTIONS,
  ALLERGY_OTHER_VALUE,
  CHIEF_COMPLAINTS,
  CITY_OPTIONS,
  LANGUAGE_OPTIONS,
  MANDATORY_VITALS,
  getComplaintMeta,
} from "./constants.js";

const state = {
  intake: null,
  doctorResults: [],
  selectedDoctorId: null,
  selectedSlot: null,
};


function setError(name, message) {
  const target = document.querySelector(`[data-error-for="${name}"]`);
  if (target) {
    target.textContent = message || "";
  }
}

function clearErrors() {
  document.querySelectorAll("[data-error-for]").forEach((el) => {
    el.textContent = "";
  });
}

function createNumberInput(field) {
  const input = document.createElement("input");
  input.type = "number";
  if (field.step) input.step = field.step;
  if (field.min !== undefined) input.min = field.min;
  if (field.max !== undefined) input.max = field.max;
  input.required = Boolean(field.required);
  input.name = field.name;
  input.dataset.field = field.name;
  input.inputMode = "decimal";
  return input;
}

function createSelect(field) {
  const select = document.createElement("select");
  select.dataset.field = field.name;
  select.name = field.name;
  if (!field.required) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Select";
    select.appendChild(empty);
  }
  (field.options || []).forEach((option) => {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label;
    select.appendChild(el);
  });
  select.required = Boolean(field.required);
  return select;
}

function createDateInput(field) {
  const input = document.createElement("input");
  input.type = "date";
  input.required = Boolean(field.required);
  input.name = field.name;
  input.dataset.field = field.name;
  return input;
}

function renderField(container, field) {
  const wrapper = document.createElement("label");
  wrapper.className = "form-field";
  wrapper.dataset.fieldWrapper = field.name;
  wrapper.innerHTML = `<span>${field.label}${field.required ? "" : " <span class=\"text-muted\">(optional)</span>"}</span>`;
  let control;
  if (field.type === "select") {
    control = createSelect(field);
  } else if (field.type === "date") {
    control = createDateInput(field);
  } else {
    control = createNumberInput(field);
  }
  wrapper.appendChild(control);
  const error = document.createElement("span");
  error.className = "error-text";
  error.dataset.errorFor = field.name;
  wrapper.appendChild(error);
  container.appendChild(wrapper);
}

function populateMandatoryVitals() {
  const container = document.querySelector("#mandatoryVitals");
  container.innerHTML = "";
  MANDATORY_VITALS.forEach((field) => renderField(container, field));
  const bmiBadge = document.createElement("div");
  bmiBadge.className = "metric";
  bmiBadge.id = "bmiBadge";
  bmiBadge.textContent = "BMI: —";
  container.appendChild(bmiBadge);
}

function populateComplaintOptions() {
  const select = document.querySelector("#chiefComplaint");
  CHIEF_COMPLAINTS.forEach((complaint) => {
    const option = document.createElement("option");
    option.value = complaint.value;
    option.textContent = complaint.label;
    select.appendChild(option);
  });
}

function populateFilters() {
  const city = document.querySelector("#doctorCityFilter");
  CITY_OPTIONS.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    city.appendChild(option);
  });
  const language = document.querySelector("#doctorLanguageFilter");
  LANGUAGE_OPTIONS.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    language.appendChild(option);
  });
}

function populateAllergies() {
  const select = document.querySelector("#allergiesSelect");
  select.innerHTML = "";
  ALLERGY_OPTIONS.forEach((option) => {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    if (option.value === "NONE") {
      node.selected = true;
    }
    select.appendChild(node);
  });
}

function updateComplaintFields() {
  const container = document.querySelector("#complaintVitals");
  container.innerHTML = "";
  const select = document.querySelector("#chiefComplaint");
  const meta = getComplaintMeta(select.value);
  const badge = document.querySelector("#recommendedSpecialty");
  if (meta) {
    badge.textContent = `Recommended specialty: ${meta.specialty}`;
    meta.extraVitals.forEach((field) => renderField(container, field));
  } else {
    badge.textContent = "";
  }
}

function computeBmi(heightCm, weightKg) {
  if (!heightCm || !weightKg) return null;
  const meters = heightCm / 100;
  if (meters <= 0) return null;
  return Number((weightKg / (meters * meters)).toFixed(1));
}

function updateBmiDisplay() {
  const heightInput = document.querySelector('[data-field="heightCm"]');
  const weightInput = document.querySelector('[data-field="weightKg"]');
  const bmiBadge = document.querySelector("#bmiBadge");
  const height = Number(heightInput?.value);
  const weight = Number(weightInput?.value);
  const bmi = computeBmi(height, weight);
  bmiBadge.textContent = bmi ? `BMI: ${bmi}` : "BMI: —";
}

function sanitizeMedications(value) {
  return value
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/[^A-Za-z0-9 ,.;:()/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function gatherNumericValue(input, field) {
  const raw = input.value.trim();
  if (!raw) {
    if (field.required) {
      setError(field.name, `Enter ${field.label.toLowerCase()}`);
      return { ok: false };
    }
    return { ok: true, value: null };
  }
  const value = Number(raw);
  if (Number.isNaN(value)) {
    setError(field.name, `Enter a number for ${field.label.toLowerCase()}`);
    return { ok: false };
  }
  if (field.min !== undefined && value < field.min) {
    setError(field.name, `Must be ≥ ${field.min}`);
    return { ok: false };
  }
  if (field.max !== undefined && value > field.max) {
    setError(field.name, `Must be ≤ ${field.max}`);
    return { ok: false };
  }
  return { ok: true, value };
}

function gatherSelectValue(select, field) {
  const value = select.value;
  if (!value) {
    if (field.required) {
      setError(field.name, `Select ${field.label.toLowerCase()}`);
      return { ok: false };
    }
    return { ok: true, value: "" };
  }
  return { ok: true, value };
}

function gatherDateValue(input, field) {
  const value = input.value;
  if (!value) {
    if (field.required) {
      setError(field.name, `Select ${field.label.toLowerCase()}`);
      return { ok: false };
    }
    return { ok: true, value: "" };
  }
  return { ok: true, value };
}

function getFieldValue(field) {
  const element = document.querySelector(`[data-field="${field.name}"]`);
  if (!element) return { ok: true, value: null };
  if (field.type === "select") {
    return gatherSelectValue(element, field);
  }
  if (field.type === "date") {
    return gatherDateValue(element, field);
  }
  return gatherNumericValue(element, field);
}

function gatherVitals() {
  const vitals = {};
  let valid = true;

  MANDATORY_VITALS.forEach((field) => {
    const result = getFieldValue(field);
    if (!result.ok) {
      valid = false;
    } else if (result.value !== null) {
      vitals[field.name] = result.value;
    }
  });

  const complaint = document.querySelector("#chiefComplaint").value;
  const meta = getComplaintMeta(complaint);
  const extras = [];
  if (meta) {
    meta.extraVitals.forEach((field) => {
      const result = getFieldValue(field);
      if (!result.ok) {
        valid = false;
      } else if (result.value !== null && result.value !== "") {
        vitals[field.name] = result.value;
        extras.push(field.name);
      }
    });
  }

  const allergiesSelect = document.querySelector("#allergiesSelect");
  const allergyValues = Array.from(allergiesSelect.selectedOptions).map((option) => option.value);
  if (!allergyValues.length) {
    setError("allergies", "Select at least one allergy option");
    valid = false;
  }
  const vitalsAllergies = allergyValues.filter((value) => value !== ALLERGY_OTHER_VALUE);
  if (allergyValues.includes(ALLERGY_OTHER_VALUE)) {
    const otherInput = document.querySelector("#otherAllergyInput");
    const text = otherInput.value.trim();
    if (!text) {
      setError("otherAllergy", "Describe the other allergy");
      valid = false;
    } else if (!/^[A-Za-z0-9 ,.-]{3,80}$/.test(text)) {
      setError("otherAllergy", "Use letters, numbers, commas, and periods (3-80 chars)");
      valid = false;
    } else {
      vitalsAllergies.push(`Other: ${text}`);
    }
  }

  const medications = sanitizeMedications(document.querySelector("#medicationsInput").value || "");
  if (!valid) {
    return null;
  }

  const bmi = computeBmi(vitals.heightCm, vitals.weightKg);
  if (bmi) {
    vitals.bmi = bmi;
  }
  vitals.allergies = vitalsAllergies;
  if (medications) {
    vitals.medications = medications;
  }
  if (extras.length) {
    vitals.extraFields = extras;
  }
  return vitals;
}

function gatherIntake() {
  clearErrors();
  const complaint = document.querySelector("#chiefComplaint").value;
  if (!complaint) {
    setError("chiefComplaint", "Select a chief complaint");
    return null;
  }
  const vitals = gatherVitals();
  if (!vitals) {
    return null;
  }
  const meta = getComplaintMeta(complaint);
  return {
    chiefComplaint: complaint,
    recommendedSpecialty: meta?.specialty || "",
    vitals,
  };
}

function renderEmptyState(container, message) {
  container.innerHTML = "";
  const div = document.createElement("div");
  div.className = "empty-state";
  div.textContent = message;
  container.appendChild(div);
}

function resetBookingSelection() {
  state.selectedDoctorId = null;
  state.selectedSlot = null;
  document.querySelectorAll('.slot-chip.selected').forEach((chip) => chip.classList.remove('selected'));
  document.querySelectorAll('[data-book]').forEach((button) => {
    button.disabled = true;
  });
}

function slotIsInFuture(slotIso) {
  return new Date(slotIso).getTime() > Date.now();
}

function renderDoctorCard(doctor) {
  const profile = doctor.doctorProfile || {};
  const card = document.createElement("article");
  card.className = "list-item doctor-card";
  card.setAttribute("role", "listitem");
  const languagesList = (profile.languages || []).join(", ");
  const slots = (profile.availSlots || []).filter((slot) => slotIsInFuture(slot));
  card.innerHTML = `
    <div class="list-item-header">
      <div>
        <h3 data-name></h3>
        <p class="helper-text" data-meta></p>
      </div>
      <span class="badge" data-languages></span>
    </div>
    <div class="slot-list" role="group" aria-label="Available slots"></div>
    <div class="list-item-actions">
      <button type="button" class="secondary" data-book disabled>Book appointment</button>
    </div>
  `;
  const fullName = [doctor.firstName, doctor.lastName].filter(Boolean).join(' ') || 'Doctor';
  const metaParts = [profile.specialty, profile.city].filter(Boolean);
  card.querySelector('[data-name]').textContent = fullName;
  card.querySelector('[data-meta]').textContent = metaParts.length ? metaParts.join(' • ') : 'Specialty pending';
  card.querySelector('[data-languages]').textContent = languagesList || 'No languages listed';
  const slotContainer = card.querySelector(".slot-list");
  slotContainer.innerHTML = '';
  if (!slots.length) {
    const note = document.createElement('span');
    note.className = 'helper-text';
    note.textContent = 'No future slots published.';
    slotContainer.appendChild(note);
  } else {
    slots.slice(0, 12).forEach((slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slot-chip";
      button.textContent = formatDateTime(slot);
      button.dataset.slot = slot;
      button.addEventListener("click", () => {
        card.querySelectorAll(".slot-chip").forEach((chip) => chip.classList.remove("selected"));
        button.classList.add("selected");
        state.selectedDoctorId = doctor.userId;
        state.selectedSlot = slot;
        card.querySelector("[data-book]").disabled = false;
      });
      slotContainer.appendChild(button);
    });
  }
  const bookBtn = card.querySelector("[data-book]");
  bookBtn.addEventListener("click", () => {
    if (state.selectedDoctorId === doctor.userId && state.selectedSlot) {
      bookAppointment(doctor.userId, state.selectedSlot, bookBtn);
    }
  });
  return card;
}

function renderDoctorResults() {
  const container = document.querySelector("#doctorResults");
  container.innerHTML = "";
  if (!state.doctorResults.length) {
    renderEmptyState(container, "No doctors match the filters yet. Update your filters or try again later.");
    return;
  }
  state.doctorResults.forEach((doctor) => {
    const card = renderDoctorCard(doctor);
    container.appendChild(card);
  });
}

async function searchDoctors(triggeredByFilter = false) {
  if (!state.intake) {
    if (!triggeredByFilter) {
      showToast("Complete the intake form before searching", "error");
    }
    return;
  }
  const params = new URLSearchParams();
  if (state.intake.recommendedSpecialty) {
    params.set("specialty", state.intake.recommendedSpecialty);
  }
  const city = document.querySelector("#doctorCityFilter").value;
  const language = document.querySelector("#doctorLanguageFilter").value;
  if (city) params.set("city", city);
  if (language) params.set("language", language);
  const container = document.querySelector("#doctorResults");
  container.innerHTML = '<div class="helper-text">Loading available doctors…</div>';
  try {
    const { items = [] } = await fetchJSON(`/doctors${params.toString() ? `?${params.toString()}` : ""}`);
    state.doctorResults = items;
    resetBookingSelection();
    renderDoctorResults();
  } catch (error) {
    console.error(error);
    renderEmptyState(container, error.message || "Unable to load doctors");
  }
}

async function bookAppointment(doctorId, slotISO, button) {
  if (!state.intake) {
    showToast("Complete the intake form first", "error");
    return;
  }
  const payload = {
    doctorId,
    slotISO,
    chiefComplaint: state.intake.chiefComplaint,
    recommendedSpecialty: state.intake.recommendedSpecialty,
    vitals: state.intake.vitals,
  };
  try {
    await disableWhilePending(
      button,
      fetchJSON("/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
    showToast("Appointment requested", "success");
    resetBookingSelection();
    await Promise.all([loadAppointments(), loadHealthIndex()]);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to book appointment", "error");
  }
}

function renderAppointmentCard(appointment) {
  const card = document.createElement("article");
  card.className = "list-item";
  const summary = appointment.vitalsSummary || {};
  const allergies = Array.isArray(summary.allergies) ? summary.allergies.join(", ") : "Not provided";

  const header = document.createElement("div");
  header.className = "list-item-header";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = formatDateTime(appointment.slotISO);
  const doctorMeta = document.createElement("p");
  doctorMeta.className = "helper-text";
  doctorMeta.textContent = `Doctor ID: ${appointment.doctorId}`;
  titleWrap.appendChild(title);
  titleWrap.appendChild(doctorMeta);
  header.appendChild(titleWrap);
  const statusContainer = document.createElement("div");
  statusContainer.innerHTML = statusBadge(appointment.status);
  header.appendChild(statusContainer);
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

  const list = document.createElement("dl");
  list.className = "vitals-list";
  const allergiesRow = document.createElement("div");
  const allergiesTerm = document.createElement("dt");
  allergiesTerm.textContent = "Allergies";
  const allergiesValue = document.createElement("dd");
  allergiesValue.textContent = allergies;
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
  if (["PENDING", "CONFIRMED"].includes(appointment.status)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = "Cancel";
    button.addEventListener("click", () => cancelAppointment(appointment.appointmentId, button));
    actions.appendChild(button);
  }
  card.appendChild(actions);
  return card;
}

async function cancelAppointment(appointmentId, button) {
  try {
    await disableWhilePending(
      button,
      fetchJSON(`/appointments/${appointmentId}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    showToast("Appointment cancelled", "success");
    await loadAppointments();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to cancel appointment", "error");
  }
}

async function loadAppointments() {
  const container = document.querySelector("#appointmentsList");
  container.innerHTML = '<div class="helper-text">Refreshing appointments…</div>';
  try {
    const { items = [] } = await fetchJSON("/appointments/patient");
    if (!items.length) {
      renderEmptyState(container, "No appointments yet. Book a slot to see it listed here.");
      return;
    }
    container.innerHTML = "";
    items.sort((a, b) => new Date(a.slotISO) - new Date(b.slotISO));
    items.forEach((item) => container.appendChild(renderAppointmentCard(item)));
  } catch (error) {
    console.error(error);
    renderEmptyState(container, error.message || "Unable to load appointments");
  }
}

function renderHealthIndex(data) {
  const panel = document.querySelector("#healthIndexPanel");
  panel.innerHTML = "";
  if (!data.length) {
    renderEmptyState(panel, "No vitals submitted yet.");
    return;
  }
  data.slice(0, 3).forEach((record) => {
    const card = document.createElement("article");
    card.className = "list-item";
    const header = document.createElement("div");
    header.className = "list-item-header";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = record.chiefComplaint || "Intake";
    const meta = document.createElement("p");
    meta.className = "helper-text";
    meta.textContent = record.updatedAt ? new Date(record.updatedAt).toLocaleString() : "";
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    header.appendChild(titleWrap);
    card.appendChild(header);
    const pre = document.createElement("pre");
    pre.className = "helper-text vitals-pre";
    pre.textContent = JSON.stringify(record.summary || record, null, 2);
    card.appendChild(pre);
    panel.appendChild(card);
  });
}

async function loadHealthIndex() {
  try {
    const session = getSession();
    if (!session) {
      throw new Error('Session expired');
    }
    const { items = [] } = await fetchJSON(`/patient/${session.sub}/health/index`);
    renderHealthIndex(items);
  } catch (error) {
    console.error(error);
    renderHealthIndex([]);
  }
}

function watchAllergySelection() {
  const select = document.querySelector("#allergiesSelect");
  const field = document.querySelector("#otherAllergyField");
  const update = () => {
    const values = Array.from(select.selectedOptions).map((option) => option.value);
    field.hidden = !values.includes(ALLERGY_OTHER_VALUE);
  };
  select.addEventListener("change", update);
  update();
}

function attachEvents() {
  document.querySelector("#chiefComplaint").addEventListener("change", updateComplaintFields);
  document.querySelectorAll('[data-field="heightCm"], [data-field="weightKg"]').forEach((input) => {
    input.addEventListener("input", updateBmiDisplay);
  });
  document.querySelector("#findDoctorsBtn").addEventListener("click", () => {
    const intake = gatherIntake();
    if (!intake) return;
    state.intake = intake;
    searchDoctors(false);
  });
  document.querySelector("#doctorCityFilter").addEventListener("change", () => searchDoctors(true));
  document.querySelector("#doctorLanguageFilter").addEventListener("change", () => searchDoctors(true));
  watchAllergySelection();
}

async function init() {
  await loadConfig();
  if (!requireRole(["PATIENT"])) {
    return;
  }
  document.querySelector("#userEmail").textContent = getUserEmail();
  bindSignOut(document.querySelector("#signOutBtn"));
  populateMandatoryVitals();
  populateComplaintOptions();
  populateFilters();
  populateAllergies();
  updateComplaintFields();
  attachEvents();
  updateBmiDisplay();
  await seedDemoData();
  await Promise.all([loadAppointments(), loadHealthIndex()]);
}

window.addEventListener("DOMContentLoaded", init);
