// Server-only SMS sender. It does not create sessions or verify OTPs.
export async function sendOtpSms({ phone, code }, { apiId, fetcher = fetch } = {}) {
  if (!apiId) return { status: 'not_configured' };
  if (!/^\+7\d{10}$/.test(phone) || !/^\d{6}$/.test(code)) return { status: 'invalid_input' };
  try {
    const body = new URLSearchParams({ api_id: apiId, to: phone.slice(1), msg: `ФАС торги: код входа ${code}. Никому не сообщайте.`, json: '1' });
    const response = await fetcher('https://sms.ru/sms/send', { method: 'POST', body, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { status: 'unavailable' };
    const data = await response.json();
    const item = data.sms?.[phone.slice(1)];
    return data.status === 'OK' && item?.status === 'OK' ? { status: 'accepted' } : { status: 'rejected' };
  } catch { return { status: 'unavailable' }; }
}
