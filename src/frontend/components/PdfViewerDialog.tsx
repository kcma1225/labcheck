import { useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api, fileUrl } from "../api/client";
import { Button, Empty, ErrorText, GhostButton, Icon, Textarea } from "./ui";
import type { Resource, ResourceMark } from "../../shared/types";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * In-app PDF viewer with shared, workspace-wide page marks and notes — turns
 * a saved PDF into a lightweight team annotation surface instead of a plain
 * download link.
 */
export function PdfViewerDialog({
  workspaceId,
  resource,
  onClose,
}: {
  workspaceId: string;
  resource: Resource;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [marks, setMarks] = useState<ResourceMark[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getDocument({ url: fileUrl(workspaceId, resource.id) })
      .promise.then((pdf) => {
        if (cancelled) return;
        setDoc(pdf);
        setNumPages(pdf.numPages);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load PDF");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, resource.id]);

  function reloadMarks() {
    return api
      .get(`/workspaces/${workspaceId}/resources/${resource.id}/marks`)
      .then((r) => setMarks(r.marks));
  }

  useEffect(() => {
    reloadMarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, resource.id]);

  const currentMark = marks.find((m) => m.page_number === pageNum) ?? null;

  useEffect(() => {
    setNoteDraft(currentMark?.note ?? "");
  }, [pageNum, currentMark]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    doc.getPage(pageNum).then((page) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const viewport = page.getViewport({ scale: 1.3 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      page.render({ canvas, viewport });
    });
    return () => {
      cancelled = true;
    };
  }, [doc, pageNum]);

  async function saveMark() {
    setBusy(true);
    setError(null);
    try {
      if (currentMark) {
        await api.patch(`/workspaces/${workspaceId}/resources/${resource.id}/marks/${currentMark.id}`, {
          note: noteDraft.trim() || null,
        });
      } else {
        await api.post(`/workspaces/${workspaceId}/resources/${resource.id}/marks`, {
          page_number: pageNum,
          note: noteDraft.trim() || null,
        });
      }
      await reloadMarks();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeMark() {
    if (!currentMark) return;
    if (!window.confirm(`Remove the mark on page ${pageNum}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/workspaces/${workspaceId}/resources/${resource.id}/marks/${currentMark.id}`);
      await reloadMarks();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="safe-overlay fixed inset-0 z-50 flex overflow-y-auto bg-scrim/70" onClick={onClose}>
      <div
        className="flex min-w-0 flex-1 flex-col overflow-y-auto rounded-xl bg-white shadow-xl md:flex-row md:overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-[55dvh] min-w-0 flex-1 flex-col border-gray-200 md:min-h-0 md:border-r">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="min-w-0 truncate text-sm font-semibold text-gray-800">{resource.name}</div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <Icon name="x" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 border-b border-gray-100 px-4 py-2 text-sm">
            <GhostButton
              onClick={() => setPageNum((p) => Math.max(1, p - 1))}
              disabled={pageNum <= 1}
              className="px-2 py-1"
              aria-label="Previous page"
            >
              ‹
            </GhostButton>
            <span className="text-gray-700">
              Page {pageNum} of {numPages || "…"}
            </span>
            <GhostButton
              onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
              disabled={pageNum >= numPages}
              className="px-2 py-1"
              aria-label="Next page"
            >
              ›
            </GhostButton>
            {currentMark && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Marked
              </span>
            )}
          </div>

          <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-gray-100 p-4">
            {loading ? (
              <Empty>Loading PDF…</Empty>
            ) : loadError ? (
              <ErrorText>{loadError}</ErrorText>
            ) : (
              <canvas ref={canvasRef} className="h-auto max-w-full bg-paper shadow" />
            )}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col border-t border-gray-200 md:w-72 md:border-t-0">
          <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">
            Marks &amp; notes
          </div>
          <div className="max-h-40 flex-1 space-y-1 overflow-y-auto p-3 md:max-h-none">
            {marks.length === 0 ? (
              <Empty>No marked pages yet.</Empty>
            ) : (
              marks.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPageNum(m.page_number)}
                  className={`block w-full rounded-md p-2 text-left text-sm ${
                    m.page_number === pageNum ? "bg-gray-100" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="font-medium text-gray-800">Page {m.page_number}</div>
                  {m.note && <div className="truncate text-xs text-gray-500">{m.note}</div>}
                </button>
              ))
            )}
          </div>
          <div className="space-y-2 border-t border-gray-100 p-3">
            <div className="text-xs font-medium text-gray-500">Note on page {pageNum}</div>
            <Textarea
              rows={4}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add a note for the team on this page…"
            />
            <ErrorText>{error}</ErrorText>
            <div className="flex gap-2">
              <Button onClick={saveMark} disabled={busy}>
                {currentMark ? "Update mark" : "Mark this page"}
              </Button>
              {currentMark && (
                <Button variant="danger" onClick={removeMark} disabled={busy}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
