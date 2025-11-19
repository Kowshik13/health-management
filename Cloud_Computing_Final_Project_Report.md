**Cloud Computing Final Project Report — Health Management App**

**Project Overview:**
- **Project:** Health Management Platform (demo)
- **Repository root:** `health-management-app` (this folder)
- **High-level purpose:** A small web-based health-management demo combining a static frontend hosted on S3 with serverless backend APIs (AWS SAM / Lambda), a Cognito User Pool for authentication, and DynamoDB for state. The repo also contains a small `infra/` helper for creating a VPC, S3 replication (CRR) and optionally an EC2 demo instance.

**How to use this report:**
- This file documents the project layer-by-layer so you can use it as the basis for your Cloud Computing final project submission.
- Suggested place for screenshots: create `docs/screenshots/` and add images named as recommended (examples below). Reference the images from this markdown (e.g. `![S3 bucket](docs/screenshots/01-s3-bucket.png)`).

**Repository structure (important files & folders):**
- `index.html`, `signin.html`, `signup.html`, `doctor.html`, `patient.html`, `forgot-password.html` — static site pages.
- `assets/` — main client-side JavaScript and CSS:
  - `assets/app.js` — central client logic (signup/signin routines, Cognito interactions).
  - `assets/signup.js`, `signin.js`, `doctor.js`, `patient.js` — page-specific logic.
  - `assets/styles.css` and other static assets.
- `demo/` — demo notes and CREDS.md containing demo account credentials (default password `HealthPass!1`).
- `healthcare-sam-starter/` — serverless backend template and Lambda functions:
  - `template.yaml` — AWS SAM template describing the backend resources (API Gateway, Lambda functions, DynamoDB tables, Cognito user pool, S3 static site bucket).
  - `functions/` — Lambda handlers used for appointments, patients, doctors, and authentication post-confirm.
- `infra/` — deploy utilities and CloudFormation template used for low-level infra (VPC + CRR helper).
  - `vpc-stack.yaml` — CloudFormation VPC template (2 AZ public/private subnets; no NAT by default to keep costs low).
  - `deploy.ps1` — PowerShell helper that (now) can derive the S3 site bucket from the website URL, create a replica bucket and configure CRR, and optionally create a t3.micro EC2 instance in the created VPC.

**Architecture (layer-by-layer):**

**1) Presentation layer (Static site)**
- Location: repository root and `assets/`.
- Hosting: intended for a single S3 static site bucket (see `StaticSiteBucket` in the SAM `template.yaml`). The bucket name pattern is `hm-static-site-${EnvironmentName}-${AccountId}`.
- Responsibilities:
  - Provide HTML/CSS and client-side JS for doctors/patients to view and manage appointments.
  - Handle signup/signin workflows (Cognito) and call backend APIs for appointments.
- Notes for screenshots:
  - Screenshot `index.html` home page and any logged-in dashboard (`doctor.html`, `patient.html`).
  - Screenshot DevTools network tab showing `assets/app.js` loaded from the S3 website URL.
  - Suggested screenshot filenames: `docs/screenshots/01-site-home.png`, `docs/screenshots/02-doctor-dashboard.png`, `docs/screenshots/03-network-assets.png`.

**2) Authentication layer (Cognito)**
- Defined in `healthcare-sam-starter/template.yaml` as `CognitoUserPool` + `CognitoUserPoolClient`.
- Purpose:
  - Email-based sign-up/sign-in, group separation for DOCTOR/PATIENT.
  - Post-confirmation Lambda (`AuthPostConfirmationFunction`) persists user records into the `UsersTable`.
- Where to screenshot in AWS Console:
  - Cognito > User Pools > `health-users-<env>` > General settings (show Schema), App clients (show client id), Triggers (show PostConfirmation mapping).
  - Suggested filename: `docs/screenshots/04-cognito-userpool.png`.

**3) API & Business logic (API Gateway + Lambda)**
- Template entries in `template.yaml`:
  - `ApiGateway` (HttpApi): routes mounted for `/doctors`, `/appointments`, `/patient` endpoints.
  - Lambda functions in `functions/` implement CRUD-like appointment flows: create, confirm, decline, cancel, list by doctor/patient and patient health index.
- Responsibilities:
  - Validate requests, persist/modify appointments in DynamoDB, and emit events when required.
- Where to screenshot in AWS Console:
  - API Gateway > HTTP APIs > select `health-platform` > Routes and Stages (capture the base URL and route list).
  - Lambda > list of functions (capture configuration of `appointments_create` and `auth_post_confirm`).
  - Suggested filenames: `docs/screenshots/05-api-gateway-routes.png`, `docs/screenshots/06-lambda-config.png`.

**4) Data layer (DynamoDB)**
- Tables declared in `template.yaml`:
  - `UsersTable` (PK: `userId`) — user profiles (Cognito mapping persisted by the PostConfirmation Lambda).
  - `AppointmentsTable` (PK: `appointmentId`, GSIs on `doctorId`/`slotISO` and `patientId`/`slotISO`) — appointment records.
  - `PatientHealthIndexTable` — health index records per patient.
- Features:
  - PAY_PER_REQUEST billing mode.
  - Server-side encryption enabled (`SSESpecification`).
- Where to screenshot:
  - DynamoDB > Tables > select each table > Overview (show GSIs), Metrics (optional), and Items (demonstrate seeded demo data). Filenames: `docs/screenshots/07-dynamo-users.png`, `docs/screenshots/08-dynamo-appointments.png`.

**5) Static site bucket & CRR (S3)**
- The SAM template creates `StaticSiteBucket` with website configuration and restrictive PublicAccessBlock + OwnershipControls.
- A separate `infra/deploy.ps1` was added to optionally create Cross-Region Replication (CRR) for a replica bucket named like `hm-static-site-replica-<env>-<account>-<region>` and to apply a 3-day lifecycle on the replica for cost limits.
- Important config to verify in AWS console (screenshot targets):
  - S3 > Buckets > select the static site bucket > Properties: Website hosting, Versioning, Replication rules. Filename: `docs/screenshots/09-s3-staticsite-properties.png`.
  - S3 > Buckets > select the replica bucket > Properties: Versioning and Lifecycle rules. Filename: `docs/screenshots/10-s3-replica-properties.png`.
  - S3 > Object > select `test.txt` (or a small file) in the source bucket and view Metadata/ReplicationStatus. Filename: `docs/screenshots/11-s3-object-replication-status.png`.

**6) Identity & Permissions (IAM)**
- The CRR operation requires an IAM role with a trust policy for `s3.amazonaws.com` and a policy allowing the role to read from the source and write to the destination; the script creates `s3-replication-role-<account>`.
- Lambda functions and other resources use least-privilege inline policies declared in `template.yaml` (for DynamoDB, Cognito add group, etc.).
- Where to screenshot:
  - IAM > Roles > `s3-replication-role-<account>` > Trust relationships and inline policies. Filename: `docs/screenshots/12-iam-replication-role.png`.
  - IAM > Roles > Lambda execution role(s) showing linked policies. Filename: `docs/screenshots/13-iam-lambda-role.png`.

**7) Networking (VPC) and demo EC2**
- `infra/vpc-stack.yaml` creates a small VPC: 2 public subnets, 2 private subnets, an Internet Gateway and a public route table. NAT is intentionally NOT created to avoid egress costs.
- `deploy.ps1` optionally launches a t3.micro EC2 in the first public subnet and creates an open-ish security group (adjust `-SshCidr` to restrict access to your IP for security).
- Where to screenshot in AWS Console:
  - VPC > Your VPCs > select `health-vpc-...` > Subnets (show subnet IDs and AZs). Filename: `docs/screenshots/14-vpc-overview.png`.
  - EC2 > Instances > select demo instance > Instance details (Public IP, Security group). Filename: `docs/screenshots/15-ec2-instance.png`.

**8) Observability & logs**
- CloudWatch Log Groups are created for API and Lambda (`/aws/http-api/health-platform-<env>` and the API Gateway logs). The SAM template sets retention to 30 days.
- Where to screenshot:
  - CloudWatch > Log groups > select `ApiLogGroup` and a Lambda log group. Filename: `docs/screenshots/16-cloudwatch-logs.png`.

**9) Deployment notes & scripts**
- `healthcare-sam-starter/template.yaml` is the SAM template that defines the backend. Deploy with SAM CLI or CloudFormation.
  - Example SAM build & deploy (from `healthcare-sam-starter`):
    ```powershell
    sam build
    sam deploy --guided
    ```
- The `infra/deploy.ps1` script is a helper for quick VPC creation, CRR setup and a demo EC2. It attempts to safely handle quoting/encoding issues in PowerShell and uses a 3-day lifecycle on replicas to limit costs.
- Important gotchas observed during development:
  - Creating buckets in `us-east-1` must not use a LocationConstraint; the script special-cases `us-east-1`.
  - AWS CLI + PowerShell quoting/BOM issues can break JSON passed on the command line; the script writes temp ASCII files and uses `file://` to reliably pass JSON documents.

**Testing and verification steps (recommended)**
1. Verify frontend assets are served from the S3 website
   - Visit the website URL (example): `http://health-management-app.s3-website.eu-west-3.amazonaws.com/` and open DevTools → Network to confirm `assets/app.js` is served.
   - Screenshot: `docs/screenshots/01-site-home.png` and `03-network-assets.png`.

2. Verify Cognito and user flow
   - In Cognito console, create or seed demo users (the repo contains `demo/CREDS.md` with default `HealthPass!1`).
   - Sign up locally via the frontend and confirm the PostConfirmation Lambda populates `UsersTable`.
   - Screenshot: `docs/screenshots/04-cognito-userpool.png`, `docs/screenshots/07-dynamo-users.png`.

3. Verify backend APIs
   - From a logged-in browser or curl, call the API endpoints from `template.yaml` `ApiBaseUrl` to create an appointment and then query appointments by doctor or patient.
   - Screenshot: `docs/screenshots/05-api-gateway-routes.png`, `docs/screenshots/06-lambda-config.png`.

4. Verify S3 Cross-Region Replication
   - Run `infra/deploy.ps1 -SiteUrl '<your-site-url>'` (ensure AWS CLI credentials are set to the target account).
   - Upload a small file to the source bucket and check the replica bucket for the file (replication is asynchronous — allow a few minutes).
   - Screenshot: `docs/screenshots/09-s3-staticsite-properties.png`, `docs/screenshots/10-s3-replica-properties.png`, `docs/screenshots/11-s3-object-replication-status.png`.

5. Verify EC2 (optional)
   - If you ran `deploy.ps1 -CreateEC2`, find the instance in EC2 console and SSH using the PEM key saved by the script.
   - Screenshot EC2 instance details and Security Group rules: `docs/screenshots/15-ec2-instance.png`.

**Where to place screenshots in the report**
- Create the folder `docs/screenshots/` in the repo and add the images with the filenames suggested above.
- Insert the screenshots inline in this report by referencing the file path, for example:
  - `![Static site home](docs/screenshots/01-site-home.png)`
  - Place screenshots near the relevant section (S3 screenshots in the S3 section, Cognito in the Cognito section, etc.).

**Security & cost advice**
- The demo uses a t3.micro EC2 and S3 replica objects with a 3-day lifecycle. Delete EC2 and replica bucket when finished to avoid charges.
- Restrict SSH access to your IP via `-SshCidr` when creating the EC2.
- Do not store secrets or private keys in the repo. If `deploy.ps1` saved a PEM file locally, move it to a safe location and/or delete it when done.

**Appendix — useful AWS Console pages to screenshot (organized by section)**
- S3: Bucket list → select static site bucket → Properties (Website hosting, Versioning, Replication) and Object details.
- Cognito: User Pools → `health-users-<env>` → General settings, App client, Triggers.
- API Gateway: HTTP APIs → Stages & Routes → Stage variables and logs.
- Lambda: Functions → Handler configuration and environment variables for `AuthPostConfirmationFunction` and appointment functions.
- DynamoDB: Tables → Items / Indexes / Metrics for `health-users-<env>` and `health-appointments-<env>`.
- VPC: VPCs → Subnets / Route tables → show `health-vpc-<stackName>` details.
- EC2: Instances → Details (Public IP, Security groups, Key pair name).
- IAM: Roles → Replication role policies and Lambda execution roles.
- CloudWatch: Log groups for API and Lambda; CloudTrail if enabled for audit.

**Final notes & submission checklist**
- Add screenshots into `docs/screenshots/` per suggestions above.
- If the grader expects a single PDF, convert this markdown and the screenshots into a single document.
- Include the following in your submission ZIP or repo branch:
  - This repository (or a snapshot) with the `Cloud_Computing_Final_Project_Report.md` at root.
  - `docs/screenshots/` with the captured images.
  - `deployment-notes.txt` (optional) with commands you ran and the public EC2 IP if used.

---

File generated by the project assistant on request. If you want, I can now:
- Commit the changed files (I will stage & commit all repo modifications), and
- Optionally generate the `docs/screenshots/` folder placeholder (empty .gitkeep) so you have the folder structure ready.

Tell me whether to commit now (I will include a concise commit message) and whether to add the screenshots folder placeholder.