# Supporting document context implementation plan

> **For agentic workers:** Use superpowers:executing-plans, test first, and verify each integration boundary.

**Goal:** Users explicitly select text/Markdown attachments for bounded, cited AI assessment context.
**Architecture:** Store extracted text and selection beside attachment IDs with cascading deletion. A guarded assessment tool returns selected documents as untrusted tool data and records validated citations. Source IDs never authorize attachment access.
**Tech Stack:** PostgreSQL, Vercel Blob private streams, Next.js server actions, AI SDK tools, React.
**Spec:** ../specs/2026-09-09-cct-2058-remaining-design.md

## Constraints

Only UTF-8 text/plain and text/markdown initially; no PDF/Office parsers or remote connectors. Maximum five selected files, 256 KiB input per file, 16 KiB extracted text per file, 48 KiB total context. Use UTF-8 byte counts as a conservative token upper bound, and visibly report omitted/truncated content. Read only authorized managed blob keys. Delete extraction when attachment is deleted or deselected. Keep generated assessment conclusions but no copied source excerpts in citation metadata.

## Tasks

Implementation is present. Local extraction/context/citation/assessment/history/attachment regressions pass on disposable PostgreSQL, with component and browser coverage. Independent review identified source-deletion and repeated-tool-output gaps; regression fixes now reject deletion during active runs, require citations for already-provided sources, strip extracted text from persisted history, and return raw document sources only once per run. The adjacent codebase tool now bounds keywords and aggregate source content. Browser verification covers processed/truncated state, citations, deselection, reload, and removed-source notices. Final aggregate build/CI/delivery remains pending.

- [x] lib/documents/text.ts and .test.ts: bounded stream decoding, invalid UTF-8/binary rejection, truncation metadata, stable line-numbered source content. Test multibyte boundaries and oversized streams.
- [x] migrations/0050_document-context.js and lib/documents/context.ts/.test.ts: current membership + request authorization, selected/processing/error state, max count, active-run guard, cascade removal, and safe source bundle. Test tenant boundaries and deletion.
- [x] Server actions and AttachmentsCard: explicit selection, processing/error/unsupported labels, retry and limit/retention copy. Query metadata through authorized request page.
- [x] Assessment get_supporting_documents tool and citation validation in save_assessment: keep text in tool output, require current selected source IDs and bounded line ranges; store safe source metadata and render citations through authorized download links.
- [x] Run focused DB/component/agent tests and mocked-storage browser flow; re-review prompt/data separation, retention, and authorization before issue completion.
