# --- [1호점] WScript System-Modal Alarm Engine ---
[void] [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')

# Identity setting
$myStoreId = "store_A"
$projectId = 'teamchat-d623c'

$url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents:runQuery"
$script:lastMsgTime = '' 

$queryBody = @{
    structuredQuery = @{
        from = @(@{ collectionId = "messages" })
        orderBy = @(@{ field = @{ fieldPath = "timestamp" }; direction = "DESCENDING" })
        limit = 1
    }
} | ConvertTo-Json -Depth 5

Clear-Host
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " [System] Alarm Engine successfully loaded." -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

while($true) {
    $timeNow = (Get-Date).ToString('HH:mm:ss')
    try {
        $res = Invoke-RestMethod -Uri $url -Method Post -Body $queryBody -ContentType "application/json" -ErrorAction Stop
        
        if ($res -and $res[0].document) {
            $doc = $res[0].document
            $roomId = $doc.fields.roomId.stringValue
            $msgSender = $doc.fields.sender.stringValue
            $msgTime = $doc.createTime
            
            # 1. 최초 실행 시 기준점 잡기
            if ($script:lastMsgTime -eq '') {
                $script:lastMsgTime = $msgTime
                Write-Host "[$timeNow] => [OK] Connected to chat. Waiting for NEW messages..." -ForegroundColor Cyan
                Write-Host "         (Latest DB Msg -> From: $msgSender | Room: $roomId)" -ForegroundColor DarkGray
            } 
            # 2. 새로운 메시지 포착 시
            # 🚨 [확인 완료] 'elseif' 문법 정확하게 들어갔습니다!
            elseif ($msgTime -ne $script:lastMsgTime) {
                $script:lastMsgTime = $msgTime
                
                # [조건 검사] 내가 보낸 게 아니고, 내 매장(store_A) 대화방인 경우
                if ($msgSender -ne $myStoreId -and $roomId.Contains($myStoreId)) {
                    Write-Host "[$timeNow] ★ [NEW MESSAGE DETECTED!!] Displaying alert window!" -ForegroundColor Magenta
                    [System.Media.SystemSounds]::Hand.Play()
                    
                    # 모든 프로그램을 뚫고 나오는 시스템 모달 알림창 팝업
                    $wsh = New-Object -ComObject WScript.Shell
                    
                    # '새로운 메시지가 도착했습니다' 문구 인코딩 보호 처리
                    $msgText = "$([char]0xC0C8)$([char]0xB85C)$([char]0xC6B4)$([char]0x20)$([char]0xBA54)$([char]0xC2DC)$([char]0xC9C0)$([char]0xAC00)$([char]0x20)$([char]0xB3C4)$([char]0xCC29)$([char]0xD588)$([char]0xC2B5)$([char]0xB2C8)$([char]0xB2E4)"
                    
                    # 타이틀 [8Pharmacy Teamchat] 고정 표출
                    $wsh.Popup($msgText, 0, "8Pharmacy Teamchat", 4144) | Out-Null
                } else {
                    Write-Host "[$timeNow] -> Log: New message skipped (Sent by me or not for me)." -ForegroundColor DarkGray
                }
            }
        }
    } catch {
        Write-Host "[$timeNow] ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Seconds 3
}