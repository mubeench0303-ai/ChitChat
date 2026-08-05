param(
    [Parameter(Position = 0)]
    [ValidateSet("up", "down", "version", "create", "install")]
    [string]$Command = "up",

    [string]$Name,
    [int]$Steps = 1
)

$ErrorActionPreference = "Stop"

$MigrateVersion = "v4.18.2"
$Migrate = "go run -tags postgres github.com/golang-migrate/migrate/v4/cmd/migrate@$MigrateVersion"
$BackendRoot = Split-Path $PSScriptRoot -Parent
$EnvFile = Join-Path $BackendRoot ".env"
$MigrationsPath = "migrations"

function Get-DatabaseUrl {
    if (-not (Test-Path $EnvFile)) {
        throw ".env file not found at $EnvFile"
    }

    $vars = @{}
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) {
            return
        }

        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            $vars[$parts[0].Trim()] = $parts[1].Trim()
        }
    }

    $required = @("DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT", "DB_NAME", "DB_SSLMODE")
    foreach ($key in $required) {
        if (-not $vars.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($vars[$key])) {
            throw "Missing required environment variable: $key"
        }
    }

    $user = [uri]::EscapeDataString($vars["DB_USER"])
    $password = [uri]::EscapeDataString($vars["DB_PASSWORD"])

    return "postgres://$user`:$password@$($vars['DB_HOST']):$($vars['DB_PORT'])/$($vars['DB_NAME'])?sslmode=$($vars['DB_SSLMODE'])"
}

Push-Location $BackendRoot
try {
    switch ($Command) {
        "install" {
            go install -tags postgres "github.com/golang-migrate/migrate/v4/cmd/migrate@$MigrateVersion"
        }
        "create" {
            if ([string]::IsNullOrWhiteSpace($Name)) {
                throw "Usage: ./scripts/migrate.ps1 create -Name your_migration_name"
            }

            Invoke-Expression "$Migrate create -ext sql -dir $MigrationsPath -seq $Name"
        }
        default {
            $databaseUrl = Get-DatabaseUrl

            switch ($Command) {
                "up" {
                    Invoke-Expression "$Migrate -path $MigrationsPath -database `"$databaseUrl`" up"
                }
                "down" {
                    Invoke-Expression "$Migrate -path $MigrationsPath -database `"$databaseUrl`" down $Steps"
                }
                "version" {
                    Invoke-Expression "$Migrate -path $MigrationsPath -database `"$databaseUrl`" version"
                }
            }
        }
    }
}
finally {
    Pop-Location
}
