import type { Resource } from "../../shared/types";

export function isPdfResource(r: Resource): boolean {
  return r.type === "file" && r.mime_type === "application/pdf";
}
