/** A failed retry cannot disprove an earlier write whose acknowledgment was lost. */
export function commandFailureIsDefinite(status, recovering) {
  return !recovering && Number.isInteger(status) && status >= 400 && status < 500 && status !== 408;
}
