# Supporting documents in assessments

Select **Use [filename] in AI assessments** on an attachment. This is opt-in and applies to future assessment runs; changing selections does not silently rewrite previous assessments. Only the requester or a current reviewer/administrator may change a request's selections. Active agent runs block changes.

The first release supports UTF-8 plain text and Markdown. PDFs, images, CSV, and Office files remain downloadable attachments but are not extracted for AI context. Limits: five selected files; 256 KiB input per file; first 16 KiB of normalized text per file; at most 48 KiB of serialized source context per assessment. The byte ceiling is a conservative token upper bound of 49,152; actual tokenization is usually lower and the total agent context limit still applies. Processing states, per-file truncation, and omitted sources are shown. Retry pending/error documents after an interrupted processing request.

Text is returned as untrusted tool output, separately from system instructions. The assessment must read selected sources and supply validated attachment IDs and line ranges when saving. Citation validation establishes source existence, selection, and line bounds; reviewers still need to assess whether the cited evidence supports the model's conclusion. The tool cannot guarantee factual correctness.

Extracted text is stored alongside the private attachment. Deselecting or deleting the attachment deletes its extracted text. Saved citation metadata retains the filename, content hash, line range, and summarized conclusion, not a copied source passage. Historical assessments retain their conclusions and show when a source attachment has been removed. Raw document tool output is stripped from persisted conversation history; subsequent runs must read the currently selected sources again.

No external document connector is enabled. Blob access uses the application's private, organization/request-scoped storage key and current membership checks.
