import { useCallback, useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Layout } from "./Layout";
import { WorkspaceUnlock } from "../pages/WorkspaceUnlock";

type State =
  | { kind: "loading" }
  | { kind: "locked" }
  | { kind: "ok"; name: string };

/**
 * Gate for every /w/:workspaceId route. A missing/expired session surfaces
 * the password screen (spec section 12); a valid one renders the app shell.
 */
export function WorkspaceGuard() {
  const { workspaceId = "" } = useParams();
  const [state, setState] = useState<State>({ kind: "loading" });

  const check = useCallback(() => {
    setState({ kind: "loading" });
    api
      .get(`/workspaces/${workspaceId}`)
      .then((r) => setState({ kind: "ok", name: r.workspace.name }))
      .catch(() => setState({ kind: "locked" }));
  }, [workspaceId]);

  useEffect(check, [check]);

  if (state.kind === "loading") {
    return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  }
  if (state.kind === "locked") {
    return <WorkspaceUnlock workspaceId={workspaceId} onUnlocked={check} />;
  }
  return (
    <Layout workspaceId={workspaceId} workspaceName={state.name}>
      <Outlet />
    </Layout>
  );
}
