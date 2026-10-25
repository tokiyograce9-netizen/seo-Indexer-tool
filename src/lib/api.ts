// Universal authenticated fetch wrapper that passes both cookies and Authorization header
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Sends cookie automatically
  });
}

export function saveAuthToken(token: string) {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('seo_indexer_token', token);
  }
}

export function clearAuthToken() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('seo_indexer_token');
    localStorage.removeItem('seo_indexer_token');
  }
}

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('seo_indexer_token') || localStorage.getItem('seo_indexer_token');
  }
  return null;
}

export async function safeJsonParse<T = any>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || data?.message || `Server returned error (${res.status})`);
    }
    return data as T;
  }

  const rawText = await res.text();
  if (rawText.trim().startsWith('<') || rawText.includes('<!DOCTYPE') || rawText.includes('<!doctype')) {
    throw new Error(
      `Server returned unexpected HTML (${res.status}). Verify your backend is running and environment variables are set.`
    );
  }

  try {
    const parsed = JSON.parse(rawText);
    if (!res.ok) {
      throw new Error(parsed?.error || parsed?.message || `Server error (${res.status})`);
    }
    return parsed as T;
  } catch {
    throw new Error(rawText.slice(0, 120) || `Request failed with status ${res.status}`);
  }
}
