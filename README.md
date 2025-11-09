# Health Management Demo

A lightweight Doctolib-style experience showing patient intake, role-based dashboards, and DynamoDB-backed appointment flows. The static frontend talks directly to the deployed AWS SAM backend that powers Cognito auth, doctor discovery, and appointment orchestration.

## Prerequisites

- Node-free environment (vanilla HTML/CSS/JS only).
- AWS CLI configured for the target account/region (`eu-west-3`).
- Cognito user pool and HTTP API already deployed (see `config.json`).

## 1. Configure the frontend

1. Update [`config.json`](./config.json) if stack outputs change. The current values map to:

   ```json
   {
     "apiBaseUrl": "https://jxwfu7p6jg.execute-api.eu-west-3.amazonaws.com/v1",
     "region": "eu-west-3",
     "userPoolId": "eu-west-3_qHf4LOBNa",
     "userPoolClientId": "3scslu2a91ae8en1v93r1225uv",
     "doctorMatchEndpoint": ""
   }
   ```

2. Run a local static server:

   ```bash
   python -m http.server 8080
   # visit http://localhost:8080
   ```

## 2. Seed users (CLI)

No SMS or MFA is enabled; create test users via the AWS CLI (email verification suppressed for rapid testing).

```bash
USER_POOL_ID=eu-west-3_qHf4LOBNa
CLIENT_ID=3scslu2a91ae8en1v93r1225uv

# Doctor example (Cardiology)
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username doc.cardio@example.com \
  --user-attributes Name="given_name",Value="Alice" Name="family_name",Value="Cardio" Name="custom:role",Value="DOCTOR" \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username doc.cardio@example.com \
  --password "DoctorPass!1" \
  --permanent

# Patient example
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username patient.one@example.com \
  --user-attributes Name="given_name",Value="Pat" Name="family_name",Value="One" Name="custom:role",Value="PATIENT" \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username patient.one@example.com \
  --password "PatientPass!1" \
  --permanent
```

### Doctor profile bootstrap

Doctor metadata (specialty, languages, city, availability slots) is provisioned via the Cognito post-confirmation trigger using the `clientMetadata` payload sent from the sign-up form. For existing accounts—or if you prefer explicit CLI seeding—update the DynamoDB record directly:

```bash
USERS_TABLE=health-users-dev
aws dynamodb update-item \
  --table-name "$USERS_TABLE" \
  --key '{"userId": {"S": "<doctor-sub>"}}' \
  --update-expression 'SET doctorProfile = :profile' \
  --expression-attribute-values '{":profile": {"M": {"specialty": {"S": "Cardiology"}, "city": {"S": "Paris"}, "languages": {"L": [{"S": "English"}, {"S": "French"}]}, "availSlots": {"L": []}}}}'
```

> Tip: the repository ships with [`assets/demo-data/doctors.json`](./assets/demo-data/doctors.json). Use it as a source of truth when scripting seeds.

## 3. Doctor availability slots

Slots are generated client-side for the next 14 business days (Mon–Fri, 09:00–17:00 in 30-minute increments) and stored alongside the doctor profile in DynamoDB. Update via the CLI example above or by signing up through the UI as a doctor.

## 4. Frontend walkthrough

### Sign in / Sign up

- Sign-up enforces strong passwords and role selection.
- Doctors choose specialty, languages, and city from curated dropdowns. Data flows to DynamoDB via Cognito `clientMetadata`—no custom Cognito attributes beyond `custom:role`.
- After email confirmation, sign in via `signin.html`. Sessions persist in `localStorage` with automatic expiry handling.

### Patient workspace (`patient.html`)

1. **Prepare your visit**
   - Select a chief complaint from controlled options (e.g., “Chest pain”, “Fever/cold/flu”).
   - Mandatory vitals: height, weight, blood pressure (systolic/diastolic), heart rate.
   - Complaint-specific vitals appear dynamically (e.g., cholesterol panel for cardiology, smoking status for pulmonology).
   - Known allergies are a multi-select list; selecting “Other” reveals a controlled text input.
   - Medications field accepts sanitized free text (no HTML injection).
   - BMI auto-calculates after entering height and weight.

2. **Find doctors**
   - Recommended specialty is derived from the complaint.
   - Optional filters for city and language apply on top of the specialty.
   - Doctor cards display specialty, location, languages, and up to 12 future slots as selectable chips.

3. **Book appointment**
   - Choose a slot chip then press **Book appointment**.
   - Appointment status starts as `PENDING`.
   - My Appointments panel lists bookings with status badges and a cancel action for pending/confirmed entries.
   - Latest submitted vitals section pulls from the PatientHealthIndex table for quick reference.

### Doctor workspace (`doctor.html`)

- Tabs split `Pending requests` and `My schedule` (confirmed appointments).
- Cards highlight chief complaint, recommended specialty, allergies, and BMI.
- Confirm/Decline actions update DynamoDB and emit analytics events.
- Selecting any card fetches the patient’s health summary via `/patient/{patientId}/health/summary` (read-only).
- Auto-refresh runs every 10 seconds (polling). The last refreshed time appears as a badge.

### Inline validation & accessibility

- All actionable controls include keyboard focus styles and ARIA labelling where applicable.
- Error messages render inline under their respective inputs.
- Buttons show `aria-busy="true"` during async calls for screen-reader hints.

## 5. Deploy the static site to S3

Use the stack’s static bucket (`hm-static-site-dev-810278669680`) and keep it simple—no CloudFront automation is required for this task.

```bash
aws s3 sync . s3://hm-static-site-dev-810278669680 \
  --exclude ".git/*" \
  --exclude "healthcare-sam-starter/*" \
  --delete
aws s3 website s3://hm-static-site-dev-810278669680 --index-document index.html
```

Ensure the bucket policy allows public `GET` access to objects (or front with CloudFront + OAC in production).

## 6. Screenshots (placeholders)

- `docs/screenshots/patient-intake.png` – patient intake form with vitals.
- `docs/screenshots/doctor-dashboard.png` – doctor pending requests view.

Capture and replace the placeholders when running the UI locally.

## 7. Troubleshooting

- **401/403 errors**: clear `localStorage` or sign out—expired tokens are dropped automatically.
- **Doctor list empty**: verify doctor profiles contain specialty/city/languages and that availability slots include future timestamps.
- **Health summary 403**: doctors may only access patient data for appointments where they are the assigned doctor and the status is `PENDING` or `CONFIRMED`.
- **Time drift**: ensure the client machine clock is accurate; ISO timestamps must be in the future to pass clash checks.
- **Seeding via UI**: append `?seed=1` to the URL and sign in; the helper attempts to call `/admin/seed/doctors`. In this environment the endpoint is intentionally absent, and the UI will prompt you to run the CLI steps above instead.

---

_This repository intentionally avoids frontend frameworks to keep the bundle light and deployable on any static host._
