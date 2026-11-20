// Discord 웹훅 알림 (CLAUDE.md 4-1 모니터링) — 데드맨스위치·서킷브레이커 공용 채널.
// 알림 실패가 수집 잡을 깨뜨리면 안 되므로 절대 throw하지 않는다.

export async function sendAlert(message: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    // 웹훅 미설정 폴백 — 최소한 런타임 로그(Vercel Logs)에는 남겨 "무음 사망"을 막는다.
    // (방치형 전제: 데드맨스위치가 울려야 한다. 정식 알림은 ALERT_WEBHOOK_URL 설정 필요.)
    console.error(`[steambubbles][ALERT] ${message}`);
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `[steambubbles] ${message}` }),
    });
    if (!res.ok) {
      console.error(`sendAlert: 웹훅 응답 ${res.status}`);
    }
  } catch (err) {
    console.error("sendAlert 실패:", err);
  }
}
