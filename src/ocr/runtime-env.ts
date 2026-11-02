/** ORT 1.29 POSIX telemetry must be disabled before native environment creation. */
export function disableOrtTelemetry(): void {
  if (typeof process !== "undefined" && process.env) process.env.ORT_DISABLE_TELEMETRY = "1"
}
