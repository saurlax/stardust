import type { NebulaTree } from "@/components/NebulaView";

export const memoryTreeMock: NebulaTree = {
  nodes: [
    { id: "root", title: "openviking", x: 0.02, y: -0.02, z: 0.2, size: 10, alpha: 1, phase: 0 },

    { id: "apps", title: "apps", x: -0.4, y: 0.18, z: 0.12, size: 6.5, alpha: 0.82, phase: 0.5, linksTo: ["root"] },
    { id: "services", title: "services", x: -0.2, y: 0.3, z: 0.1, size: 6.3, alpha: 0.8, phase: 0.8, linksTo: ["root"] },
    { id: "packages", title: "packages", x: 0.1, y: 0.34, z: 0.08, size: 6.2, alpha: 0.78, phase: 1.0, linksTo: ["root"] },
    { id: "infra", title: "infra", x: 0.34, y: 0.2, z: 0.11, size: 6.4, alpha: 0.8, phase: 1.2, linksTo: ["root"] },
    { id: "docs", title: "docs", x: 0.42, y: 0.02, z: 0.14, size: 5.9, alpha: 0.74, phase: 1.6, linksTo: ["root"] },
    { id: "scripts", title: "scripts", x: 0.34, y: -0.18, z: 0.12, size: 6, alpha: 0.76, phase: 1.9, linksTo: ["root"] },
    { id: "tests", title: "tests", x: 0.08, y: -0.32, z: 0.09, size: 6.1, alpha: 0.78, phase: 2.3, linksTo: ["root"] },
    { id: "configs", title: "configs", x: -0.2, y: -0.3, z: 0.12, size: 6.1, alpha: 0.8, phase: 2.7, linksTo: ["root"] },
    { id: "assets", title: "assets", x: -0.4, y: -0.08, z: 0.1, size: 5.8, alpha: 0.74, phase: 3.0, linksTo: ["root"] },

    { id: "apps_web", title: "apps/web", x: -0.54, y: 0.26, z: 0.06, size: 5.2, alpha: 0.68, phase: 3.4, linksTo: ["apps"] },
    { id: "apps_mobile", title: "apps/mobile", x: -0.56, y: 0.08, z: 0.05, size: 5.1, alpha: 0.66, phase: 3.6, linksTo: ["apps"] },
    { id: "apps_admin", title: "apps/admin", x: -0.5, y: -0.06, z: 0.04, size: 4.9, alpha: 0.64, phase: 3.9, linksTo: ["apps"] },

    { id: "svc_api", title: "services/api", x: -0.28, y: 0.42, z: 0.04, size: 5.2, alpha: 0.67, phase: 4.1, linksTo: ["services"] },
    { id: "svc_worker", title: "services/worker", x: -0.12, y: 0.44, z: 0.03, size: 5, alpha: 0.65, phase: 4.4, linksTo: ["services"] },

    { id: "pkg_ui", title: "packages/ui", x: 0.04, y: 0.48, z: 0.02, size: 5.1, alpha: 0.66, phase: 4.8, linksTo: ["packages"] },
    { id: "pkg_sdk", title: "packages/sdk", x: 0.2, y: 0.46, z: 0.03, size: 5, alpha: 0.65, phase: 5.1, linksTo: ["packages"] },

    { id: "infra_ci", title: "infra/ci", x: 0.52, y: 0.26, z: 0.05, size: 5, alpha: 0.65, phase: 5.4, linksTo: ["infra"] },
    { id: "infra_deploy", title: "infra/deploy", x: 0.56, y: 0.12, z: 0.04, size: 5.2, alpha: 0.67, phase: 5.8, linksTo: ["infra"] },

    { id: "docs_arch", title: "docs/architecture", x: 0.58, y: -0.02, z: 0.03, size: 4.8, alpha: 0.62, phase: 6.1, linksTo: ["docs"] },
    { id: "docs_api", title: "docs/api", x: 0.54, y: -0.12, z: 0.03, size: 4.8, alpha: 0.62, phase: 6.3, linksTo: ["docs"] },

    { id: "scripts_build", title: "scripts/build", x: 0.44, y: -0.28, z: 0.05, size: 4.9, alpha: 0.63, phase: 6.6, linksTo: ["scripts"] },
    { id: "scripts_release", title: "scripts/release", x: 0.3, y: -0.38, z: 0.06, size: 5.0, alpha: 0.64, phase: 6.9, linksTo: ["scripts"] },

    { id: "tests_unit", title: "tests/unit", x: 0.08, y: -0.46, z: 0.05, size: 4.9, alpha: 0.63, phase: 7.2, linksTo: ["tests"] },
    { id: "tests_e2e", title: "tests/e2e", x: -0.06, y: -0.44, z: 0.06, size: 4.9, alpha: 0.63, phase: 7.5, linksTo: ["tests"] },

    { id: "cfg_env", title: "config/env", x: -0.26, y: -0.42, z: 0.05, size: 4.8, alpha: 0.62, phase: 7.8, linksTo: ["configs"] },
    { id: "cfg_lint", title: "config/lint", x: -0.38, y: -0.34, z: 0.05, size: 4.8, alpha: 0.62, phase: 8.1, linksTo: ["configs"] },

    { id: "assets_icon", title: "assets/icons", x: -0.56, y: -0.16, z: 0.04, size: 4.7, alpha: 0.61, phase: 8.4, linksTo: ["assets"] },
    { id: "assets_img", title: "assets/images", x: -0.58, y: -0.02, z: 0.04, size: 4.7, alpha: 0.61, phase: 8.7, linksTo: ["assets"] },
  ],
};

