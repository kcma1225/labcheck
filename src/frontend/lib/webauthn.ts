import { client } from "@passwordless-id/webauthn";
import { api } from "../api/client";
import type { PasskeySummary } from "../../shared/types";

export function passkeySupported(): boolean {
  return client.isAvailable();
}

/** Cheap check the login screen uses to decide whether to show the button at all. */
export async function checkPasskeyAvailable(workspaceId: string): Promise<boolean> {
  try {
    const res = await api.get(`/workspaces/${workspaceId}/passkey/available`);
    return !!res.available;
  } catch {
    return false;
  }
}

/** Runs the full passkey login ceremony and, on success, leaves the workspace unlocked (same as password). */
export async function loginWithPasskey(workspaceId: string): Promise<{ id: string; name: string }> {
  const { challenge, token, credentialIds } = await api.post(`/workspaces/${workspaceId}/passkey/login-options`);
  const authentication = await client.authenticate({
    challenge,
    allowCredentials: credentialIds,
    userVerification: "required",
  });
  const res = await api.post(`/workspaces/${workspaceId}/passkey/login`, { authentication, token });
  return res.workspace;
}

/** Registers a new passkey for this workspace — requires an already-unlocked session. */
export async function registerPasskey(workspaceId: string, name: string): Promise<PasskeySummary> {
  const { challenge, token } = await api.post(`/workspaces/${workspaceId}/passkeys/register-options`);
  const registration = await client.register({
    user: { name },
    challenge,
    userVerification: "required",
    discoverable: "preferred",
  });
  const res = await api.post(`/workspaces/${workspaceId}/passkeys/register`, { name, registration, token });
  return res.passkey;
}

export async function listPasskeys(workspaceId: string): Promise<PasskeySummary[]> {
  const res = await api.get(`/workspaces/${workspaceId}/passkeys`);
  return res.passkeys;
}

export async function removePasskey(workspaceId: string, id: string): Promise<void> {
  await api.delete(`/workspaces/${workspaceId}/passkeys/${id}`);
}
