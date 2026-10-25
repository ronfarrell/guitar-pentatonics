import { Suspense, lazy } from "react";

// Split so a phone joining the TV doesn't download the desktop app (and its
// visualizer), and vice versa.
const AuthGate = lazy(() => import("./components/AuthGate"));
const ControllerApp = lazy(() => import("./controller/ControllerApp"));

/**
 * Picks the app for this page. A query parameter rather than a path: the
 * Windows launcher serves the build from FastAPI's StaticFiles, which has no
 * SPA fallback for /join/... routes.
 */
export default function Root() {
  const joinRoom = new URLSearchParams(window.location.search).get("join");
  return (
    <Suspense fallback={null}>
      {joinRoom ? <ControllerApp roomId={joinRoom} /> : <AuthGate />}
    </Suspense>
  );
}
