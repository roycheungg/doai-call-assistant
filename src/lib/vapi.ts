const VAPI_API_KEY = process.env.VAPI_API_KEY!;
const VAPI_BASE_URL = "https://api.vapi.ai";

export async function vapiRequest(path: string, options?: RequestInit) {
  const res = await fetch(`${VAPI_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vapi API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function listCalls(limit = 50) {
  return vapiRequest(`/call?limit=${limit}`);
}

export async function getCall(callId: string) {
  return vapiRequest(`/call/${callId}`);
}

export async function getAssistant(assistantId: string) {
  return vapiRequest(`/assistant/${assistantId}`);
}

export async function updateAssistant(assistantId: string, data: Record<string, unknown>) {
  return vapiRequest(`/assistant/${assistantId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}
