---
title: API reference (OpenAPI)
description: "Every app documents its own REST API: an OpenAPI 3.1 document and a Scalar reference page, generated from your resources and policies."
---

Every Flare app serves documentation for its own API, with nothing to write or
keep in sync:

| URL | What |
| --- | --- |
| `/api/reference` | An interactive reference ([Scalar](https://scalar.com)): endpoints, schemas, example requests, and a client to try them |
| `/api/openapi.json` | The OpenAPI 3.1 document behind it, for code generators, Postman or Insomnia |

Both are built on each request from `resources/` and `policies/`, the same data
the API runs on, so they can't drift from it. Add a resource or a field and
it's documented straight away. The admin sidebar links to the reference.

## Who sees what

The reference follows the API's own rules:

- **Signed out:** only the sign-in endpoints, with a note to sign in.
- **Signed in:** exactly the operations your role may call. An admin sees everything.

Requests sent from the reference use your session cookie, so "Try it" works as
soon as you're signed in to the app in the same browser.

To document every endpoint for everyone (requests still need the right role),
set `visibility` in `lib/api-docs.ts`:

```ts
export const apiDocs = {
  title: "Shop API",
  description: "Orders, products and customers.",
  version: "1.0.0",
  visibility: "public",
};
```

## What's in the document

- **One tag per resource.** Each has list, create, get, update (PATCH), replace
  (PUT) and delete, with the roles each one needs.
- **Models.** Each resource has `Contact`, `ContactCreate`, `ContactUpdate` and
  `ContactPage` schemas: required fields, lengths, ranges, enum options, and
  the field formats (E.164 phone numbers, ISO country codes, hostnames, hex
  colours).
- **List parameters.** `page`, `perPage`, `sort` (only sortable fields), `q`
  and `filter[field]` (only filterable fields).
- **Errors.** Every error shares one shape (`{ error, issues? }`), with 401,
  403, 404, 409 and 422 listed where they can happen.
- **Operation ids.** `listContacts`, `createContact`, `updateContact` and so
  on, for client generators.

Generate a typed client from it. Download the document while signed in (the
**Download OpenAPI Document** link on the reference page), or set `visibility:
"public"`, because a signed-out request only gets the sign-in endpoints:

```bash
npx openapi-typescript ./openapi.json -o api.d.ts
```
