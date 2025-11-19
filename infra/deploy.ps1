<#
Deploy script for infra: creates VPC stack and configures S3 Cross-Region Replication (CRR) for the static site bucket.
This script is intended for short-lived student/demo use. It tries to be conservative with costs:
- NAT Gateway is NOT created by default (set $EnableNAT = $true to create but costs apply)
- Replica bucket lifecycle is set to expire replicated objects after 3 days to limit cost

Prerequisites:
- AWS CLI configured with credentials that have CloudFormation/IAM/S3 permissions
- PowerShell

Usage: from repo root
  cd infra
  .\deploy.ps1

#>

Param(
    [string]$EnvName = "dev",
    [string]$ReplicaRegion = "us-east-1",
    [string]$StackName = "health-infra-vpc-$EnvName",
    [bool]$EnableNAT = $false,
    [string]$SiteUrl = "",
    [switch]$CreateEC2 = $false,
    [string]$SshCidr = "0.0.0.0/0"
)

function Get-AccountId {
    $id = (aws sts get-caller-identity --output json | ConvertFrom-Json).Account
    return $id
}

function Ensure-BucketExists {
    param($bucket, $region)
    try {
        aws s3api head-bucket --bucket $bucket | Out-Null
        Write-Output "Bucket $bucket exists"
        return $true
    } catch {
        Write-Output "Bucket $bucket does not exist"
        return $false
    }
}

function Enable-Versioning {
    param($bucket, $region)
    Write-Output "Enabling versioning on $bucket (region $region)"
    aws s3api put-bucket-versioning --bucket $bucket --versioning-configuration Status=Enabled --region $region | Out-Null
}

function Create-ReplicationRole {
    param($roleName, $sourceBucketName, $destBucketArn)
    $trustPolicy = @{
        Version = '2012-10-17'
        Statement = @(
            @{
                Effect = 'Allow'
                Principal = @{ Service = 's3.amazonaws.com' }
                Action = 'sts:AssumeRole'
            }
        )
    } | ConvertTo-Json -Depth 5

    try {
        $existingJson = aws iam get-role --role-name $roleName --output json 2>$null
        if ($existingJson) {
            $existing = $existingJson | ConvertFrom-Json
            Write-Host "Role $roleName exists"
            return $existing.Role.Arn
        }
    } catch {}

    Write-Host "Creating IAM role $roleName"
    $tmpTrust = [IO.Path]::GetTempFileName()
    Set-Content -Path $tmpTrust -Value $trustPolicy -Encoding Ascii
    $createJson = aws iam create-role --role-name $roleName --assume-role-policy-document file://$tmpTrust --output json 2>$null
    Remove-Item $tmpTrust -Force
    if (-not $createJson) { Write-Error "Failed to create role $roleName"; return $null }
    $create = $createJson | ConvertFrom-Json
    $roleArn = $create.Role.Arn

    # Build inline policy JSON and write to a temp file to avoid quoting issues
    $policyObj = @{
        Version = '2012-10-17'
        Statement = @(
            @{
                Effect = 'Allow'
                Action = @('s3:GetReplicationConfiguration','s3:ListBucket')
                Resource = "arn:aws:s3:::$sourceBucketName"
            },
            @{
                Effect = 'Allow'
                Action = @('s3:GetObjectVersion','s3:GetObjectVersionAcl','s3:GetObjectVersionForReplication','s3:GetObjectLegalHold','s3:GetObjectVersionTagging')
                Resource = "arn:aws:s3:::$sourceBucketName/*"
            },
            @{
                Effect = 'Allow'
                Action = @('s3:ReplicateObject','s3:ReplicateDelete','s3:ReplicateTags','s3:PutObject')
                Resource = $destBucketArn
            }
        )
    }
    $policyJson = $policyObj | ConvertTo-Json -Depth 6
    $tmpPolicy = [IO.Path]::GetTempFileName()
    Set-Content -Path $tmpPolicy -Value $policyJson -Encoding Ascii
    aws iam put-role-policy --role-name $roleName --policy-name s3-replication-policy --policy-document file://$tmpPolicy | Out-Null
    Remove-Item $tmpPolicy -Force
    return $roleArn
}

# Start
Push-Location (Resolve-Path ..).ProviderPath

$Region = (aws configure get region)
if (-not $Region) { $Region = 'eu-west-3' }
$AccountId = Get-AccountId
Write-Output "Using AWS region: $Region  account: $AccountId"

$SourceBucket = "hm-static-site-$EnvName-$AccountId"
Write-Output "Assumed source bucket: $SourceBucket"
if ($SiteUrl -and $SiteUrl.Trim() -ne "") {
    Write-Output "SiteUrl provided: $SiteUrl - attempting to derive bucket name"
    try {
        $u = [uri]$SiteUrl
        $hostname = $u.Host
    } catch {
        $hostname = $SiteUrl
    }
    # common pattern: <bucket>.s3-website(-region)?.<region>.amazonaws.com
    $m = [regex]::Match($hostname, '^(?<bucket>[^.]+)\.s3-website')
    if ($m.Success) {
        $SourceBucket = $m.Groups['bucket'].Value
        Write-Output "Derived source bucket: $SourceBucket from SiteUrl"
    } else {
        # fallback: take first label before dot
        $parts = $hostname -split '\.'
        if ($parts.Length -gt 0) { $SourceBucket = $parts[0]; Write-Output "Fallback derived bucket: $SourceBucket" }
    }
}

# If bucket doesn't exist, ask user
if (-not (Ensure-BucketExists -bucket $SourceBucket -region $Region)) {
    $provided = Read-Host "Source bucket not found. Paste the actual static site bucket name (or press Enter to abort)"
    if (-not $provided) { Write-Error "No bucket specified. Aborting."; exit 1 }
    $SourceBucket = $provided
    if (-not (Ensure-BucketExists -bucket $SourceBucket -region $Region)) { Write-Error "Provided bucket still not found. Aborting."; exit 1 }
}

# Deploy VPC CloudFormation stack (no NAT by default)
$stackFile = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Definition) 'vpc-stack.yaml'
Write-Output "Deploying VPC stack $StackName in region $Region"
aws cloudformation deploy --template-file $stackFile --stack-name $StackName --capabilities CAPABILITY_NAMED_IAM --region $Region

# Replica bucket
$ReplicaRegion = $ReplicaRegion
$ReplicaBucket = "hm-static-site-replica-$EnvName-$AccountId-$ReplicaRegion"
Write-Output "Replica bucket will be: $ReplicaBucket in region $ReplicaRegion"

if (-not (Ensure-BucketExists -bucket $ReplicaBucket -region $ReplicaRegion)) {
    Write-Output "Creating replica bucket $ReplicaBucket"
    if ($ReplicaRegion -eq 'us-east-1') {
        $createBucketJson = aws s3api create-bucket --bucket $ReplicaBucket --region $ReplicaRegion 2>$null
        if (-not $createBucketJson) { Write-Error "Failed to create replica bucket $ReplicaBucket in $ReplicaRegion" }
    } else {
        $createBucketJson = aws s3api create-bucket --bucket $ReplicaBucket --create-bucket-configuration LocationConstraint=$ReplicaRegion --region $ReplicaRegion 2>$null
        if (-not $createBucketJson) { Write-Error "Failed to create replica bucket $ReplicaBucket in $ReplicaRegion" }
    }
}

# Enable versioning on both buckets
Enable-Versioning -bucket $SourceBucket -region $Region
Enable-Versioning -bucket $ReplicaBucket -region $ReplicaRegion

# Create replication role
$roleName = "s3-replication-role-$AccountId"
# We need dest bucket ARN for policy
$destBucketArn = "arn:aws:s3:::$ReplicaBucket/*"

# Create role (passing explicit names)
$roleArn = Create-ReplicationRole -roleName $roleName -sourceBucketName $SourceBucket -destBucketArn $destBucketArn
Write-Output "Replication role ARN: $roleArn"

# Build replication configuration and write to a temp file to avoid CLI quoting
$replicationObj = @{
    Role = $roleArn
    Rules = @(
        @{
            ID = "replicate-all"
            Status = "Enabled"
            Priority = 1
            Filter = @{ }
            Destination = @{
                Bucket = "arn:aws:s3:::$ReplicaBucket"
                StorageClass = "STANDARD"
            }
            DeleteMarkerReplication = @{ Status = "Enabled" }
        }
    )
}
$replicationJson = $replicationObj | ConvertTo-Json -Depth 6
$tmpRepFile = [IO.Path]::GetTempFileName()
# write without BOM
Set-Content -Path $tmpRepFile -Value $replicationJson -Encoding Ascii

Write-Output "Applying replication configuration to source bucket $SourceBucket"
aws s3api put-bucket-replication --bucket $SourceBucket --replication-configuration file://$tmpRepFile --region $Region
Remove-Item $tmpRepFile -Force

# Put lifecycle on replica to expire objects after 3 days
$lifecycleObj = @{
    Rules = @(
        @{
            ID = "expire-3-days"
            Status = "Enabled"
            Filter = @{ }
            Expiration = @{ Days = 3 }
            NoncurrentVersionExpiration = @{ NoncurrentDays = 3 }
        }
    )
}
$lifecycleJson = $lifecycleObj | ConvertTo-Json -Depth 6
$tmpLifeFile = [IO.Path]::GetTempFileName()
# write without BOM
Set-Content -Path $tmpLifeFile -Value $lifecycleJson -Encoding Ascii

Write-Output "Setting lifecycle on replica bucket to expire after 3 days"
aws s3api put-bucket-lifecycle-configuration --bucket $ReplicaBucket --lifecycle-configuration file://$tmpLifeFile --region $ReplicaRegion
Remove-Item $tmpLifeFile -Force

# Retrieve VPC/ subnet outputs from the CloudFormation stack for optional EC2 creation
Write-Output "Retrieving CloudFormation stack outputs for $StackName"
$stackDescJson = aws cloudformation describe-stacks --stack-name $StackName --region $Region --output json 2>$null
if ($stackDescJson) {
    $st = $stackDescJson | ConvertFrom-Json
    $outputs = @{}
    foreach ($o in $st.Stacks[0].Outputs) { $outputs[$o.OutputKey] = $o.OutputValue }
    $VpcId = $outputs['VpcId']
    $PublicSubnetIds = @()
    if ($outputs['PublicSubnetIds']) { $PublicSubnetIds = $outputs['PublicSubnetIds'] -split ',' }
    Write-Output "Stack outputs loaded. VpcId=$VpcId PublicSubnetIds=$($PublicSubnetIds -join ',')"
} else {
    Write-Output "Unable to read stack outputs. EC2 creation (if requested) may fail."
}

# Optionally create a tiny EC2 instance in the first public subnet
if ($CreateEC2) {
    if (-not $VpcId -or -not $PublicSubnetIds -or $PublicSubnetIds.Count -eq 0) { Write-Error "Missing VPC or public subnet info; cannot create EC2." } else {
        $pubSubnet = $PublicSubnetIds[0]
        Write-Output "Creating key pair and security group for demo EC2"
        $keyName = "health-demo-key-$AccountId-$EnvName"
        $keyFile = Join-Path (Get-Location) "$keyName.pem"
        $keyMaterial = aws ec2 create-key-pair --key-name $keyName --query 'KeyMaterial' --output text --region $Region 2>$null
            if ($keyMaterial) {
            Set-Content -Path $keyFile -Value $keyMaterial -Encoding Ascii
            Write-Output "Saved key to $keyFile - protect this file (chmod/chown as needed)"
        } else { Write-Output "Key pair may already exist or failed to create; proceeding without writing key." }

        $sgName = "health-demo-sg-$EnvName"
        $sgJson = aws ec2 create-security-group --group-name $sgName --description "Allow SSH/HTTP for demo" --vpc-id $VpcId --region $Region 2>$null
        if ($sgJson) {
            $sg = $sgJson | ConvertFrom-Json
            $sgId = $sg.GroupId
            Write-Output "Created security group $sgId"
        } else {
            Write-Output "create-security-group failed or already exists; attempting to find existing security group by name"
            $found = aws ec2 describe-security-groups --filters "Name=group-name,Values=$sgName" --region $Region --output json 2>$null
            if ($found) {
                $fg = $found | ConvertFrom-Json
                if ($fg.SecurityGroups.Count -gt 0) { $sgId = $fg.SecurityGroups[0].GroupId; Write-Output "Found existing security group $sgId" }
            }
            if (-not $sgId) { Write-Error "Failed to create or find security group $sgName" }
        }
            aws ec2 authorize-security-group-ingress --group-id $sgId --protocol tcp --port 22 --cidr $SshCidr --region $Region | Out-Null
            aws ec2 authorize-security-group-ingress --group-id $sgId --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $Region | Out-Null

            # Get latest Amazon Linux 2 AMI via SSM Parameter Store
            $ami = aws ssm get-parameter --name "/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2" --query Parameter.Value --output text --region $Region 2>$null
            if (-not $ami) { Write-Error "Failed to find AMI via SSM" } else {
                Write-Output "Launching t3.micro EC2 in subnet $pubSubnet using AMI $ami"
                $runJson = aws ec2 run-instances --image-id $ami --count 1 --instance-type t3.micro --key-name $keyName --security-group-ids $sgId --subnet-id $pubSubnet --associate-public-ip-address --region $Region --output json 2>$null
                if ($runJson) {
                    $run = $runJson | ConvertFrom-Json
                    $instId = $run.Instances[0].InstanceId
                    Write-Output "EC2 launched: $instId - wait a minute for it to enter running state"
                } else { Write-Error "EC2 launch failed" }
            }
        }
    }
}

Write-Output "Done. Test by uploading a small file to the source bucket and confirm it appears in the replica bucket within a few minutes."

Pop-Location
