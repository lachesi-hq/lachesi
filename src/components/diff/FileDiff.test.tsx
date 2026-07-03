import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ImagePreviewState, ReviewFileData } from "@/lib/imageDiff";
import { FileDiff } from "./FileDiff";

const transparentPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function previewState(status: ImagePreviewState["status"]): ImagePreviewState {
  if (status === "ready") {
    return {
      status: "ready",
      preview: {
        path: "public/review-preview.png",
        mimeType: "image/png",
        dataUrl: transparentPng,
        size: 68,
      },
      error: null,
    };
  }
  if (status === "failed") return { status, preview: null, error: "not found" };
  return { status, preview: null, error: null };
}

function imageFile(status: ImagePreviewState["status"]): ReviewFileData {
  return {
    hunks: [],
    oldEndingNewLine: true,
    newEndingNewLine: true,
    oldPath: "public/review-preview.png",
    newPath: "public/review-preview.png",
    oldRevision: "",
    newRevision: "",
    oldMode: "100644",
    newMode: "100644",
    type: "modify",
    imageDiff: {
      kind: "image",
      status: "modified",
      oldPath: "public/review-preview.png",
      newPath: "public/review-preview.png",
      path: "public/review-preview.png",
      mimeType: "image/png",
      linesAdded: 0,
      linesRemoved: 0,
      previewSide: "new",
      preview: previewState(status),
    },
  };
}

describe("FileDiff image preview", () => {
  it("renders image previews for image diff files", () => {
    render(<FileDiff file={imageFile("ready")} viewType="unified" />);

    expect(screen.getByText("image/png")).toBeInTheDocument();
    expect(screen.getByText("68 B")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "public/review-preview.png" })).toHaveAttribute(
      "src",
      transparentPng,
    );
  });

  it("renders a clear fallback when the image preview cannot be loaded", () => {
    render(<FileDiff file={imageFile("failed")} viewType="unified" />);

    expect(screen.getByText("Image preview unavailable")).toBeInTheDocument();
    expect(screen.getByText("not found")).toBeInTheDocument();
  });
});
