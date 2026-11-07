# Hosted connector packages

`chatgpt/` is the ChatGPT plugin package for the hosted Vincentt connector
(`https://mcp.vincentt.studio/mcp`). It is not generated from `recognition.md`: it carries the
connector only, with OAuth sign-in, the directory listing and the review test cases. The local CLI
plugin stays in `dist/chatgpt` and has no MCP server.

Build the upload ZIP (Plugins -> With MCP at platform.openai.com):

```sh
node build/zip-connector.mjs --countries US,GB --demo-url https://...
```

The ZIP lands in `out/` (git-ignored). Countries and the demo video are owner-only and never
committed; without the flags the ZIP omits them, which the portal accepts at upload and asks for
before "Submit for review". Reviewer credentials go in the portal, never in the package.

Sign-in: `mcp.json` declares no auth block. ChatGPT discovers OAuth from the server's
protected-resource metadata and prefers a client metadata document (CIMD), which the api
advertises. The Agent Plugins 1.0.0 schema rejects an `extensions` object on a server entry, so
the package relies on discovery.

Domain verification: when the server is connected in the portal, OpenAI shows a challenge token.
The api serves it at `https://mcp.vincentt.studio/.well-known/openai-apps-challenge` from the SSM
value `/vincentt/prod/api/OPENAI_APPS_CHALLENGE` (set by the owner, then redeploy the api).

Rules checked by `test/qa_chatgpt_connector.test.mjs`, from OpenAI's submission guide and error
reference.
