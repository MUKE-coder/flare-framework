/**
 * The API reference at /api/reference (Scalar), built from the OpenAPI document at
 * /api/openapi.json. Both are generated from resources/ and policies/ on every
 * request, so they always match the API.
 */
export const apiDocs = {
  title: "__APP_NAME__ API",
  description: "",
  version: "1.0.0",
  /**
   * "role": a signed-in user sees the endpoints their role may call (admins see
   * everything), a visitor only the sign-in endpoints.
   * "public": everyone sees every endpoint (requests still need the right role).
   */
  visibility: "role" as "role" | "public",
};
