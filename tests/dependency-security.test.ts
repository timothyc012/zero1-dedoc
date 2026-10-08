/** Offline regressions for the security fixes in the installed MCP dependency graph. */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { OAuthClientInformationSchema, OAuthTokensSchema } from "@modelcontextprotocol/sdk/shared/auth.js"

const require = createRequire(import.meta.url)
const sdkRequire = createRequire(require.resolve("@modelcontextprotocol/sdk/server/mcp.js"))
// Resolve from each actual consumer, including when npm nests a dependency.
const ajvRequire = createRequire(sdkRequire.resolve("ajv"))
const expressRequire = createRequire(sdkRequire.resolve("express"))
const rateLimitRequire = createRequire(sdkRequire.resolve("express-rate-limit"))
const uri = ajvRequire("fast-uri")
const proxyaddr = expressRequire("proxy-addr")
const { Address4, Address6 } = rateLimitRequire("ip-address")

describe("dependency security regressions", () => {
  it("preserves the OAuth issuer when stored credentials are schema-validated", () => {
    // Synthetic values only; no network, persisted credentials, or real tokens.
    const tokens = { access_token: "test-only", token_type: "Bearer", issuer: "https://issuer.example" }
    const client = { client_id: "test-only", issuer: "https://issuer.example" }
    assert.deepEqual(OAuthTokensSchema.parse(tokens), tokens)
    assert.deepEqual(OAuthClientInformationSchema.parse(client), client)
  })

  it("normalizes percent-encoded scheme-relative hosts consistently", () => {
    assert.equal(uri.parse("//%41.example").host, "a.example")
    assert.equal(uri.equal("//%41.example", "//a.example"), true)
    assert.equal(uri.equal("//A.example", "//a.example"), true)
  })

  it("does not admit an address into a subnet of a different IP family", () => {
    assert.equal(new Address6("a00::1").isInSubnet(new Address4("10.0.0.0/8")), false)
    assert.equal(new Address4("32.1.13.184").isInSubnet(new Address6("2001:db8::/32")), false)
    assert.equal(new Address4("10.0.0.1").isInSubnet(new Address4("10.0.0.0/8")), true)
    assert.equal(new Address6("2001:db8::1").isInSubnet(new Address6("2001:db8::/32")), true)
  })

  it("does not trust arbitrary IPv4 peers through an incomplete mapped-IPv6 subnet", () => {
    const peer = "203.0.113.9"
    const request = { socket: { remoteAddress: peer }, headers: { "x-forwarded-for": "10.0.0.1" } }
    assert.equal(proxyaddr(request, proxyaddr.compile(["::ffff:10.0.0.0/8"])), peer)
    assert.equal(proxyaddr.compile(["::/1"])(peer, 0), false)
    assert.equal(proxyaddr.compile(["::ffff:10.0.0.0/104"])("10.0.0.1", 0), true)
  })
})
