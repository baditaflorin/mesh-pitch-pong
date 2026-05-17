import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-pitch-pong",
  description: "Rotating peer pitches a 30s idea; audience reacts rocket/think/downvote.",
  accentHex: "#00ddaa",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
