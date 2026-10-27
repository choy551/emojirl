import { handleCityShare, ONLINE_UNAVAILABLE } from './cityShareBundle.js';

async function route(request: Request): Promise<Response> {
  try {
    return await handleCityShare(request);
  } catch (err) {
    console.error('city share route failed', err instanceof Error ? err.name : 'error');
    return Response.json({ online: false, error: ONLINE_UNAVAILABLE }, { status: 503 });
  }
}

export function GET(request: Request): Promise<Response> {
  return route(request);
}

export function POST(request: Request): Promise<Response> {
  return route(request);
}
