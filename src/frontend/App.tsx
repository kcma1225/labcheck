import { Navigate, Route, Routes } from "react-router-dom";
import { WorkspaceGuard } from "./components/WorkspaceGuard";
import { UpdateBanner } from "./components/PwaControls";
import { Home } from "./pages/Home";
import { AdminCreateWorkspace } from "./pages/AdminCreateWorkspace";
import { Dashboard } from "./pages/Dashboard";
import {
  ProjectPage,
  ProjectNotesTab,
  ProjectOverviewTab,
  ProjectResourcesTab,
} from "./pages/ProjectPage";

export default function App() {
  return (
    <>
      <UpdateBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin/create-workspace" element={<AdminCreateWorkspace />} />

        <Route path="/w/:workspaceId" element={<WorkspaceGuard />}>
          <Route index element={<Dashboard />} />
          <Route path="projects/:projectId" element={<ProjectPage />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<ProjectOverviewTab />} />
            <Route path="notes" element={<ProjectNotesTab />} />
            <Route path="resources" element={<ProjectResourcesTab />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
