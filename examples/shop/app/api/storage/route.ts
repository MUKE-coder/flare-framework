import { storage } from "@/lib/storage";

// Redeems signed URLs from lib/storage.ts: PUT uploads, GET/HEAD reads.
export const GET = (request: Request) => storage.handleRequest(request);
export const HEAD = GET;
export const PUT = GET;
