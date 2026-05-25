import type { NebulaTree } from "@/components/NebulaView";

export const memoryTreeMock: NebulaTree = {
  nodes: [
    { id: "root", title: "openviking" },

    { id: "apps", title: "apps", linksTo: ["root"] },
    { id: "services", title: "services", linksTo: ["root"] },
    { id: "packages", title: "packages", linksTo: ["root"] },
    { id: "infra", title: "infra", linksTo: ["root"] },
    { id: "docs", title: "docs", linksTo: ["root"] },
    { id: "scripts", title: "scripts", linksTo: ["root"] },
    { id: "tests", title: "tests", linksTo: ["root"] },
    { id: "configs", title: "configs", linksTo: ["root"] },
    { id: "assets", title: "assets", linksTo: ["root"] },

    { id: "apps_web", title: "apps/web", linksTo: ["apps"] },
    { id: "apps_mobile", title: "apps/mobile", linksTo: ["apps"] },
    { id: "apps_admin", title: "apps/admin", linksTo: ["apps"] },

    { id: "svc_api", title: "services/api", linksTo: ["services"] },
    { id: "svc_worker", title: "services/worker", linksTo: ["services"] },

    { id: "pkg_ui", title: "packages/ui", linksTo: ["packages"] },
    { id: "pkg_sdk", title: "packages/sdk", linksTo: ["packages"] },

    { id: "infra_ci", title: "infra/ci", linksTo: ["infra"] },
    { id: "infra_deploy", title: "infra/deploy", linksTo: ["infra"] },

    { id: "docs_arch", title: "docs/architecture", linksTo: ["docs"] },
    { id: "docs_api", title: "docs/api", linksTo: ["docs"] },

    { id: "scripts_build", title: "scripts/build", linksTo: ["scripts"] },
    { id: "scripts_release", title: "scripts/release", linksTo: ["scripts"] },

    { id: "tests_unit", title: "tests/unit", linksTo: ["tests"] },
    { id: "tests_e2e", title: "tests/e2e", linksTo: ["tests"] },

    { id: "cfg_env", title: "config/env", linksTo: ["configs"] },
    { id: "cfg_lint", title: "config/lint", linksTo: ["configs"] },

    { id: "assets_icon", title: "assets/icons", linksTo: ["assets"] },
    { id: "assets_img", title: "assets/images", linksTo: ["assets"] },
  ],
};

