export const SPECIALTIES = [
  "Cardiology",
  "General Practice",
  "Dermatology",
  "Neurology",
  "Orthopedics",
  "Pediatrics",
  "Ophthalmology",
  "ENT",
  "Endocrinology",
  "Gastroenterology",
  "Psychiatry",
  "Pulmonology",
  "Urology",
  "Gynecology",
];

export const LANGUAGE_OPTIONS = ["English", "French", "German", "Spanish"];

export const CITY_OPTIONS = ["Paris", "Lyon", "Marseille", "Toulouse"];

export const ALLERGY_OPTIONS = [
  { value: "NONE", label: "None" },
  { value: "PENICILLIN", label: "Penicillin" },
  { value: "NSAIDS", label: "NSAIDs" },
  { value: "PEANUTS", label: "Peanuts" },
  { value: "SHELLFISH", label: "Shellfish" },
  { value: "OTHER", label: "Other" },
];

export const ALLERGY_OTHER_VALUE = "OTHER";

export const MANDATORY_VITALS = [
  {
    name: "heightCm",
    label: "Height (cm)",
    type: "number",
    min: 120,
    max: 230,
    step: 1,
    required: true,
  },
  {
    name: "weightKg",
    label: "Weight (kg)",
    type: "number",
    min: 30,
    max: 250,
    step: 0.1,
    required: true,
  },
  {
    name: "bloodPressureSystolic",
    label: "Blood pressure systolic",
    type: "number",
    min: 80,
    max: 220,
    step: 1,
    required: true,
  },
  {
    name: "bloodPressureDiastolic",
    label: "Blood pressure diastolic",
    type: "number",
    min: 40,
    max: 140,
    step: 1,
    required: true,
  },
  {
    name: "heartRate",
    label: "Heart rate (bpm)",
    type: "number",
    min: 40,
    max: 200,
    step: 1,
    required: true,
  },
];

const YES_NO = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
];

const PAIN_SEVERITY = Array.from({ length: 11 }).map((_, index) => ({
  value: String(index),
  label: String(index),
}));

const AFFECTED_AREAS = [
  "Knee",
  "Shoulder",
  "Back",
  "Hip",
  "Ankle",
  "Neck",
].map((label) => ({ value: label.toUpperCase(), label }));

const VISUAL_ACUITY = [
  { value: "NORMAL", label: "Normal" },
  { value: "MILD", label: "Mild blur" },
  { value: "SEVERE", label: "Severe blur" },
];

const PAIN_LOCATIONS = [
  { value: "RUQ", label: "Right upper quadrant" },
  { value: "LUQ", label: "Left upper quadrant" },
  { value: "RLQ", label: "Right lower quadrant" },
  { value: "LLQ", label: "Left lower quadrant" },
  { value: "EPIGASTRIC", label: "Epigastric" },
];

const VACCINATION_STATUS = [
  { value: "UP_TO_DATE", label: "Up-to-date" },
  { value: "DELAYED", label: "Delayed" },
  { value: "UNKNOWN", label: "Unknown" },
];

const SMOKING_STATUS = [
  { value: "NEVER", label: "Never" },
  { value: "FORMER", label: "Former" },
  { value: "CURRENT", label: "Current" },
];

const COMPLAINT_META = {
  "Chest pain": {
    specialty: "Cardiology",
    extraVitals: [
      { name: "totalCholesterol", label: "Total cholesterol (mg/dL)", type: "number", min: 100, max: 400, step: 1, required: true },
      { name: "ldl", label: "LDL (mg/dL)", type: "number", min: 50, max: 300, step: 1, required: true },
      { name: "hdl", label: "HDL (mg/dL)", type: "number", min: 20, max: 120, step: 1, required: true },
      { name: "triglycerides", label: "Triglycerides (mg/dL)", type: "number", min: 50, max: 600, step: 1, required: true },
      { name: "fastingBloodSugar", label: "Fasting blood sugar (mg/dL)", type: "number", min: 60, max: 400, step: 1, required: true },
    ],
  },
  "Shortness of breath": {
    specialty: "Pulmonology",
    extraVitals: [
      { name: "smokingStatus", label: "Smoking status", type: "select", options: SMOKING_STATUS, required: true },
      { name: "o2Saturation", label: "O₂ saturation (%)", type: "number", min: 70, max: 100, step: 1, required: true },
    ],
  },
  "Skin rash/itch": {
    specialty: "Dermatology",
    extraVitals: [
      { name: "onsetDays", label: "Onset (days)", type: "number", min: 0, max: 60, step: 1, required: true },
      { name: "itchSeverity", label: "Itch severity (0-10)", type: "select", options: PAIN_SEVERITY, required: true },
    ],
  },
  "Headache/migraine": {
    specialty: "Neurology",
    extraVitals: [
      { name: "painSeverity", label: "Pain severity (0-10)", type: "select", options: PAIN_SEVERITY, required: true },
      { name: "durationHours", label: "Duration (hours)", type: "number", min: 0, max: 72, step: 1, required: true },
      { name: "aura", label: "Aura", type: "select", options: YES_NO, required: true },
    ],
  },
  "Knee/shoulder/back pain": {
    specialty: "Orthopedics",
    extraVitals: [
      { name: "painSeverity", label: "Pain severity (0-10)", type: "select", options: PAIN_SEVERITY, required: true },
      { name: "onsetDays", label: "Onset (days)", type: "number", min: 0, max: 120, step: 1, required: true },
      { name: "affectedArea", label: "Affected area", type: "select", options: AFFECTED_AREAS, required: true },
    ],
  },
  "Fever/cold/flu": {
    specialty: "General Practice",
    extraVitals: [
      { name: "temperatureC", label: "Temperature (°C)", type: "number", min: 34, max: 42, step: 0.1, required: true },
      { name: "onsetDays", label: "Onset (days)", type: "number", min: 0, max: 21, step: 1, required: true },
    ],
  },
  "Eye irritation/blurred vision": {
    specialty: "Ophthalmology",
    extraVitals: [
      { name: "visualAcuity", label: "Visual acuity", type: "select", options: VISUAL_ACUITY, required: true },
    ],
  },
  "Ear pain/sore throat": {
    specialty: "ENT",
    extraVitals: [
      { name: "onsetDays", label: "Onset (days)", type: "number", min: 0, max: 30, step: 1, required: true },
      { name: "fever", label: "Fever", type: "select", options: YES_NO, required: true },
    ],
  },
  "High blood sugar/diabetes follow-up": {
    specialty: "Endocrinology",
    extraVitals: [
      { name: "fastingBloodSugar", label: "Fasting blood sugar (mg/dL)", type: "number", min: 60, max: 400, step: 1, required: true },
      { name: "hba1c", label: "HbA1c (%)", type: "number", min: 4, max: 15, step: 0.1, required: false },
    ],
  },
  "Abdominal pain/acid reflux": {
    specialty: "Gastroenterology",
    extraVitals: [
      { name: "painLocation", label: "Pain location", type: "select", options: PAIN_LOCATIONS, required: true },
      { name: "onsetDays", label: "Onset (days)", type: "number", min: 0, max: 60, step: 1, required: true },
    ],
  },
  "Anxiety/depression check-in": {
    specialty: "Psychiatry",
    extraVitals: [
      { name: "phq2Q1", label: "Little interest or pleasure", type: "select", options: YES_NO, required: true },
      { name: "phq2Q2", label: "Feeling down or hopeless", type: "select", options: YES_NO, required: true },
    ],
  },
  "Urinary issues": {
    specialty: "Urology",
    extraVitals: [
      { name: "burning", label: "Burning sensation", type: "select", options: YES_NO, required: true },
      { name: "frequencyPerDay", label: "Frequency (times/day)", type: "number", min: 0, max: 30, step: 1, required: true },
    ],
  },
  "Women’s health consultation": {
    specialty: "Gynecology",
    extraVitals: [
      { name: "lmpDate", label: "Last menstrual period", type: "date", required: false },
      { name: "symptomType", label: "Symptom type", type: "select", options: [
        { value: "PAIN", label: "Pain" },
        { value: "BLEEDING", label: "Bleeding" },
        { value: "WELLNESS", label: "Routine wellness" },
      ], required: true },
    ],
  },
  "Child vaccination/fever": {
    specialty: "Pediatrics",
    extraVitals: [
      { name: "childWeightKg", label: "Child weight (kg)", type: "number", min: 2, max: 80, step: 0.1, required: true },
      { name: "temperatureC", label: "Temperature (°C)", type: "number", min: 34, max: 42, step: 0.1, required: true },
      { name: "vaccinationStatus", label: "Vaccination status", type: "select", options: VACCINATION_STATUS, required: true },
    ],
  },
};

export const CHIEF_COMPLAINTS = Object.entries(COMPLAINT_META).map(([label, meta]) => ({
  value: label,
  label,
  specialty: meta.specialty,
  extraVitals: meta.extraVitals,
}));

export function getComplaintMeta(label) {
  return COMPLAINT_META[label] || null;
}

export function generateDoctorSlots(days = 14) {
  const start = new Date();
  const slots = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start.getTime());
    date.setDate(start.getDate() + i);
    const day = date.getDay();
    if (day === 0 || day === 6) {
      continue;
    }
    for (let hour = 9; hour < 17; hour += 1) {
      for (let minute of [0, 30]) {
        const slot = new Date(Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate(),
          hour,
          minute,
          0,
          0
        ));
        slots.push(slot.toISOString());
      }
    }
  }
  return slots;
}

export const ALLOWED_COMPLAINT_LABELS = Object.keys(COMPLAINT_META);
