import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RepoRef, ReviewTerminalOption } from "@/types";
import { SettingsPage, type SettingsSaveInput } from "./SettingsDialog";

const terminalOptions: ReviewTerminalOption[] = [
  { id: "terminal", label: "Terminal", available: true },
];

const repos: RepoRef[] = [
  { provider: "bitbucket", workspace: "example-workspace", repo: "frontend-app" },
  { provider: "github", workspace: "lachesi-hq", repo: "lachesi" },
];

function renderSettings(onSave = vi.fn()) {
  render(
    <SettingsPage
      repos={repos}
      reviewProvider="bitbucket"
      defaultDiffView="unified"
      reviewTerminal={null}
      aiProvider="claude"
      claudeModel={null}
      claudeEffort={null}
      codexModel={null}
      codexEffort={null}
      reviewTerminalOptions={terminalOptions}
      jiraBaseUrl={null}
      automaticSyncIntervalSeconds={null}
      menuBarSyncEnabled
      notificationsEnabled={false}
      hasCredentials={false}
      hasGithubCredentials={false}
      hasJira={false}
      hasNotion={false}
      onTestConnection={async () => ({ displayName: "Alex" })}
      onSave={onSave}
      onBack={() => {}}
    />,
  );
}

describe("SettingsDialog", () => {
  it("persists GitHub as a review provider with GitHub repositories and token", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<(_input: SettingsSaveInput) => Promise<void>>().mockResolvedValue();
    renderSettings(onSave);

    expect(screen.getByDisplayValue("example-workspace")).toBeVisible();
    expect(screen.queryByDisplayValue("lachesi-hq")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Review provider"), "github");
    expect(screen.queryByDisplayValue("example-workspace")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("lachesi-hq")).toBeVisible();

    await user.type(screen.getByLabelText("GitHub token"), "test-token");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewProvider: "github",
        githubToken: "test-token",
        repos: expect.arrayContaining([
          expect.objectContaining({
            provider: "bitbucket",
            workspace: "example-workspace",
            repo: "frontend-app",
          }),
          expect.objectContaining({
            provider: "github",
            workspace: "lachesi-hq",
            repo: "lachesi",
          }),
        ]),
      }),
    );
  });
});
