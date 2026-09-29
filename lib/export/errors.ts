/** A provider rejected creation before creating an item. Network/5xx errors are ambiguous. */
export class ExportRejected extends Error {}
/** Rejected for rate limiting: nothing was created, and trying again later is expected to work. */
export class ExportRateLimited extends ExportRejected {}
/** The item may or may not exist, and the tracker cannot find it. A person must check before anything is created again. */
export class ExportOutcomeUnknown extends Error {}
