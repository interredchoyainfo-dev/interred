$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:3002/')
$listener.Start()
Write-Host 'Server started on http://localhost:3002'

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    
    $localPath = $request.Url.LocalPath
    if ($localPath -eq '/') { $localPath = '/index.html' }
    
    $scriptRoot = $PSScriptRoot
    if (-not $scriptRoot) { $scriptRoot = Get-Location }
    $filePath = Join-Path $scriptRoot ($localPath -replace '/', '\')
    
    # Static file check
    $hasExtension = $localPath -match '\.[a-zA-Z0-9]+$'
    if (-not (Test-Path $filePath) -and -not $hasExtension) {
        # Redirect to index.html for SPA routes (e.g. /clientes)
        $filePath = Join-Path $scriptRoot 'index.html'
    }

    if (Test-Path $filePath) {
        $content = [System.IO.File]::ReadAllBytes($filePath)
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        
        $contentType = switch ($ext) {
            '.html' { 'text/html; charset=utf-8' }
            '.css'  { 'text/css; charset=utf-8' }
            '.js'   { 'application/javascript; charset=utf-8' }
            '.json' { 'application/json; charset=utf-8' }
            '.png'  { 'image/png' }
            '.webp' { 'image/webp' }
            '.svg'  { 'image/svg+xml' }
            default { 'application/octet-stream' }
        }
        
        $response.ContentType = $contentType
        $response.ContentLength64 = $content.Length
        $response.OutputStream.Write($content, 0, $content.Length)
    } else {
        $response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
        $response.OutputStream.Write($msg, 0, $msg.Length)
    }
    
    $response.Close()
    Write-Host "$($request.HttpMethod) $($request.Url.LocalPath) -> $($response.StatusCode)"
}
