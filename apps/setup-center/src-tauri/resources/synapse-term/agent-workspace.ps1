param(
    [string]$SessionName  = "synapse-work-default",
    [string]$ProjectPath  = "",
    [string]$PsmuxExe = "",
    [string]$LazygitExe = ""
)

if ([string]::IsNullOrWhiteSpace($PsmuxExe)) {
    $here = $PSScriptRoot
    $same = Join-Path $here "psmux.exe"
    if (Test-Path -LiteralPath $same) {
        $PsmuxExe = $same
    } else {
        $d = $here
        while ($d) {
            $c = Join-Path $d "bin\psmux.exe"
            if (Test-Path -LiteralPath $c) {
                $PsmuxExe = $c
                break
            }
            $p = Split-Path $d -Parent
            if (-not $p -or $p -eq $d) { break }
            $d = $p
        }
        if ([string]::IsNullOrWhiteSpace($PsmuxExe)) {
            $PsmuxExe = "psmux"
        }
    }
} elseif (-not (Test-Path -LiteralPath $PsmuxExe)) {
    throw "PsmuxExe not found: $PsmuxExe"
}

if ([string]::IsNullOrWhiteSpace($LazygitExe)) {
    $here = $PSScriptRoot
    $same = Join-Path $here "lazygit.exe"
    if (Test-Path -LiteralPath $same) {
        $LazygitExe = $same
    } else {
        $d = $here
        while ($d) {
            $c = Join-Path $d "bin\lazygit.exe"
            if (Test-Path -LiteralPath $c) {
                $LazygitExe = $c
                break
            }
            $p = Split-Path $d -Parent
            if (-not $p -or $p -eq $d) { break }
            $d = $p
        }
        if ([string]::IsNullOrWhiteSpace($LazygitExe)) {
            $LazygitExe = "lazygit"
        }
    }
} elseif (-not (Test-Path -LiteralPath $LazygitExe)) {
    throw "LazygitExe not found: $LazygitExe"
}

function Invoke-Psmux {
    & $PsmuxExe @args
}

$lazygitLaunch = if ($LazygitExe -like '*.exe') {
    "`"$LazygitExe`""
} else {
    $LazygitExe
}

if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
    throw "ProjectPath is required"
}

$cdCmd = "cd /d `"$ProjectPath`""

Invoke-Psmux kill-session -t $SessionName 2>$null
Start-Sleep -Milliseconds 500

Invoke-Psmux new-session -d -s $SessionName

$tmuxConf = Join-Path $PSScriptRoot "synapse-term-agent-tmux.conf"
if (-not (Test-Path -LiteralPath $tmuxConf)) {
    throw "synapse-term-agent-tmux.conf not found: $tmuxConf"
}
$tmuxConfPath = ((Resolve-Path -LiteralPath $tmuxConf).Path) -replace '\\', '/'
Invoke-Psmux source-file $tmuxConfPath

Invoke-Psmux select-layout -t "${SessionName}:0" main-vertical

Invoke-Psmux split-window -h -t "${SessionName}:0"

Invoke-Psmux resize-pane -t "${SessionName}:0.0" -x 50%

Invoke-Psmux split-window -v -p 20 -t "${SessionName}:0.1"

Invoke-Psmux send-keys -t "${SessionName}:0.0" $cdCmd Enter
Invoke-Psmux send-keys -t "${SessionName}:0.1" $cdCmd Enter
Invoke-Psmux send-keys -t "${SessionName}:0.2" $cdCmd Enter

Invoke-Psmux send-keys -t "${SessionName}:0.0" "claude --dangerously-skip-permissions" Enter
Invoke-Psmux send-keys -t "${SessionName}:0.1" $lazygitLaunch Enter

Invoke-Psmux select-pane -t "${SessionName}:0.0"
