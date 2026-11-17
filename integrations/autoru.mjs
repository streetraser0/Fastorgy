// Server-only adapter. Do not import into the browser bundle.
export async function evaluateVehicle({ vinOrPlate, mileage, geoId }, { token, fetcher = fetch } = {}) {
  if (!token) return { status: 'not_configured', provider: 'autoru' };
  if (typeof vinOrPlate !== 'string' || !vinOrPlate.trim() || !Number.isInteger(mileage) || mileage < 0 || !Number.isInteger(geoId) || geoId <= 0) {
    return { status: 'invalid_input', provider: 'autoru' };
  }
  let response;
  try {
    response = await fetcher('https://apiauto.ru/1.0/stats/partner/predict_by_vin_or_lp', {
      method: 'POST',
      headers: { 'x-authorization': token, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ vin_or_lp: vinOrPlate.trim(), mileage, geo_id: geoId, seller_type: 'COMMERCIAL' }),
      signal: AbortSignal.timeout(15000),
    });
  } catch { return { status: 'unavailable', provider: 'autoru' }; }
  if (response.status === 202) return { status: 'pending', provider: 'autoru' };
  if ([401, 403].includes(response.status)) return { status: 'access_required', provider: 'autoru' };
  if (response.status === 429) return { status: 'rate_limited', provider: 'autoru' };
  if (response.status === 404) return { status: 'not_found', provider: 'autoru' };
  if (!response.ok) return { status: 'unavailable', provider: 'autoru' };
  let data;
  try { data = await response.json(); } catch { return { status: 'unavailable', provider: 'autoru' }; }
  const low = data?.price_range?.from, high = data?.price_range?.to;
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high < low) return { status: 'insufficient_data', provider: 'autoru' };
  return { status: 'ready', provider: 'autoru', currency: 'RUB', low, high, reference: Math.round((low + high) / 2), referenceMethod: 'range_midpoint', assessedAt: new Date().toISOString() };
}
