import { CaretDown, CaretRight, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReviewReferenceInput } from "@/hooks/useReviewReferences";
import { jiraBrowseUrl } from "@/lib/jira";
import type { PullRequestSummary, RepoRef, ReviewReference, ReviewReferenceType } from "@/types";

const TYPE_LABEL: Record<ReviewReferenceType, string> = {
  pullRequest: "PR",
  repository: "Repository",
  jira: "Jira",
  notion: "Notion",
  note: "Note",
};

interface ReferenceFormState {
  type: ReviewReferenceType;
  title: string;
  url: string;
  key: string;
  workspace: string;
  repo: string;
  prId: string;
  localPath: string;
  body: string;
}

const EMPTY_FORM: ReferenceFormState = {
  type: "pullRequest",
  title: "",
  url: "",
  key: "",
  workspace: "",
  repo: "",
  prId: "",
  localPath: "",
  body: "",
};

export interface ReviewReferencesPanelProps {
  jiraKeys: string[];
  jiraBaseUrl: string | null;
  availablePullRequests: PullRequestSummary[];
  availableRepositories: RepoRef[];
  references: ReviewReference[];
  onAddReference: (input: ReviewReferenceInput) => void;
  onUpdateReference: (id: string, input: ReviewReferenceInput) => void;
  onRemoveReference: (id: string) => void;
}

function bitbucketPullRequestUrl(workspace: string, repo: string, prId: number): string {
  return `https://bitbucket.org/${workspace}/${repo}/pull-requests/${prId}`;
}

function bitbucketRepositoryUrl(workspace: string, repo: string): string {
  return `https://bitbucket.org/${workspace}/${repo}`;
}

function pullRequestOptionKey(pr: PullRequestSummary): string {
  return `${pr.workspace}/${pr.repo}#${pr.id}`;
}

function repositoryOptionKey(repo: RepoRef): string {
  return `${repo.workspace}/${repo.repo}`;
}

function titleFor(reference: ReviewReference): string {
  if (reference.type === "note") return reference.body || "Reviewer note";
  if (reference.type === "jira") return reference.key || reference.title || "Jira ticket";
  if (reference.type === "repository") {
    const repo = [reference.workspace, reference.repo].filter(Boolean).join("/");
    return repo || reference.localPath || "Repository";
  }
  return reference.title || reference.url || TYPE_LABEL[reference.type];
}

function subtitleFor(reference: ReviewReference): string | null {
  if (reference.type === "note") return null;
  if (reference.type === "repository") return reference.localPath || null;
  return reference.url || reference.title || null;
}

function formFromReference(reference: ReviewReference): ReferenceFormState {
  return {
    type: reference.type,
    title: reference.title ?? "",
    url: reference.url ?? "",
    key: reference.key ?? "",
    workspace: reference.workspace ?? "",
    repo: reference.repo ?? "",
    prId: reference.prId?.toString() ?? "",
    localPath: reference.localPath ?? "",
    body: reference.body ?? "",
  };
}

function inputFromForm(form: ReferenceFormState): ReviewReferenceInput {
  return {
    type: form.type,
    title: form.title.trim() || undefined,
    url: form.url.trim() || undefined,
    key: form.type === "jira" ? form.key.trim() || undefined : undefined,
    workspace:
      form.type === "pullRequest" || form.type === "repository"
        ? form.workspace.trim() || undefined
        : undefined,
    repo:
      form.type === "pullRequest" || form.type === "repository"
        ? form.repo.trim() || undefined
        : undefined,
    prId: form.type === "pullRequest" && form.prId.trim() ? Number(form.prId.trim()) : undefined,
    localPath: form.type === "repository" ? form.localPath.trim() || undefined : undefined,
    body: form.body.trim() || undefined,
  };
}

function isValid(form: ReferenceFormState): boolean {
  if (form.type === "note") return form.body.trim().length > 0;
  if (form.type === "jira") return form.key.trim().length > 0 || form.url.trim().length > 0;
  if (form.type === "repository") {
    return (
      form.repo.trim().length > 0 || form.localPath.trim().length > 0 || form.url.trim().length > 0
    );
  }
  return form.url.trim().length > 0 || form.title.trim().length > 0;
}

export function ReviewReferencesPanel({
  jiraKeys,
  jiraBaseUrl,
  availablePullRequests,
  availableRepositories,
  references,
  onAddReference,
  onUpdateReference,
  onRemoveReference,
}: ReviewReferencesPanelProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ReferenceFormState>(EMPTY_FORM);
  const detectedCount = jiraKeys.length;
  const total = detectedCount + references.length;

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submit = () => {
    if (!isValid(form)) return;
    const input = inputFromForm(form);
    if (editingId) onUpdateReference(editingId, input);
    else onAddReference(input);
    resetForm();
    setOpen(true);
  };
  const selectedRepositoryValue =
    form.workspace && form.repo ? `${form.workspace}/${form.repo}` : "";

  const selectPullRequest = (value: string) => {
    if (!value) {
      setForm((prev) => ({
        ...prev,
        title: "",
        url: "",
        workspace: "",
        repo: "",
        prId: "",
      }));
      return;
    }
    const pr = availablePullRequests.find((item) => pullRequestOptionKey(item) === value);
    if (!pr) return;
    setForm((prev) => ({
      ...prev,
      title: `#${pr.id} ${pr.title}`,
      url: bitbucketPullRequestUrl(pr.workspace, pr.repo, pr.id),
      workspace: pr.workspace,
      repo: pr.repo,
      prId: String(pr.id),
    }));
  };

  const selectRepository = (value: string) => {
    if (!value) {
      setForm((prev) => ({
        ...prev,
        title: "",
        url: "",
        workspace: "",
        repo: "",
        localPath: "",
      }));
      return;
    }
    const repo = availableRepositories.find((item) => repositoryOptionKey(item) === value);
    if (!repo) return;
    setForm((prev) => ({
      ...prev,
      title: `${repo.workspace}/${repo.repo}`,
      url: bitbucketRepositoryUrl(repo.workspace, repo.repo),
      workspace: repo.workspace,
      repo: repo.repo,
      localPath: repo.localPath ?? "",
    }));
  };

  return (
    <section className="border-b border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-6 py-2 text-left text-sm hover:bg-muted/40"
        aria-expanded={open}
      >
        {open ? <CaretDown size={14} /> : <CaretRight size={14} />}
        <span className="font-medium">References</span>
        <Badge variant={total > 0 ? "secondary" : "muted"}>{total}</Badge>
        <span className="text-xs text-muted-foreground">
          Context sent to Claude with the review prompt.
        </span>
      </button>
      {open && (
        <div className="space-y-3 px-6 pb-4">
          {jiraKeys.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Detected
              </div>
              <div className="flex flex-wrap gap-2">
                {jiraKeys.map((key) => (
                  <Badge key={key} variant="outline">
                    {jiraBaseUrl ? (
                      <a href={jiraBrowseUrl(jiraBaseUrl, key)} target="_blank" rel="noreferrer">
                        Jira {key}
                      </a>
                    ) : (
                      `Jira ${key}`
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {references.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Manual
              </div>
              <div className="space-y-2">
                {references.map((reference) => (
                  <div
                    key={reference.id}
                    className="flex items-start gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm"
                  >
                    <Badge variant="secondary">{TYPE_LABEL[reference.type]}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{titleFor(reference)}</div>
                      {subtitleFor(reference) && (
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {subtitleFor(reference)}
                        </div>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Edit reference"
                      onClick={() => {
                        setEditingId(reference.id);
                        setForm(formFromReference(reference));
                      }}
                    >
                      <PencilSimple size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remove reference"
                      onClick={() => onRemoveReference(reference.id)}
                    >
                      <Trash size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-md border border-border bg-muted/20 p-3">
            <div className="grid gap-2 md:grid-cols-[160px_1fr_1fr]">
              <select
                value={form.type}
                onChange={(event) =>
                  setForm({ ...EMPTY_FORM, type: event.target.value as ReviewReferenceType })
                }
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              >
                <option value="pullRequest">Pull request</option>
                <option value="repository">Repository</option>
                <option value="jira">Jira ticket</option>
                <option value="notion">Notion page</option>
                <option value="note">Note</option>
              </select>
              {form.type === "jira" ? (
                <Input
                  value={form.key}
                  onChange={(event) => setForm((prev) => ({ ...prev, key: event.target.value }))}
                  placeholder="Jira key, e.g. CB-1234"
                />
              ) : form.type === "repository" ? (
                availableRepositories.length > 0 ? (
                  <select
                    value={selectedRepositoryValue}
                    onChange={(event) => selectRepository(event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  >
                    <option value="">Choose configured repository...</option>
                    {availableRepositories.map((repo) => (
                      <option key={repositoryOptionKey(repo)} value={repositoryOptionKey(repo)}>
                        {repo.workspace}/{repo.repo}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={form.repo}
                    onChange={(event) => setForm((prev) => ({ ...prev, repo: event.target.value }))}
                    placeholder="Repository, e.g. workspace/repo"
                  />
                )
              ) : form.type === "note" ? (
                <Input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Optional note title"
                />
              ) : form.type === "pullRequest" ? (
                availablePullRequests.length > 0 ? (
                  <select
                    value={
                      form.workspace && form.repo && form.prId
                        ? `${form.workspace}/${form.repo}#${form.prId}`
                        : ""
                    }
                    onChange={(event) => selectPullRequest(event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  >
                    <option value="">Choose open PR...</option>
                    {availablePullRequests.map((pr) => (
                      <option key={pullRequestOptionKey(pr)} value={pullRequestOptionKey(pr)}>
                        #{pr.id} {pr.title} — {pr.workspace}/{pr.repo}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={form.title}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                    placeholder="Optional title"
                  />
                )
              ) : (
                <Input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Optional title"
                />
              )}
              {form.type !== "note" && (
                <Input
                  value={form.url}
                  onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
                  placeholder={
                    form.type === "repository" ? "Optional repo URL" : "URL or identifier"
                  }
                />
              )}
            </div>
            {form.type === "repository" && (
              <Input
                className="mt-2"
                value={form.localPath}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, localPath: event.target.value }))
                }
                placeholder="Optional local path"
              />
            )}
            <textarea
              value={form.body}
              onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
              placeholder="Optional guidance for Claude. Required for note references."
              rows={3}
              className="mt-2 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <p className="mr-auto text-xs text-muted-foreground">
                Stored locally. Inaccessible links are passed to Claude as explicit limitations.
              </p>
              {editingId && (
                <Button size="sm" variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
              )}
              <Button size="sm" onClick={submit} disabled={!isValid(form)}>
                <Plus size={14} />
                {editingId ? "Save reference" : "Add reference"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
