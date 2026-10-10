import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getEnvioGraphqlHeaders,
  getEnvioServerConfig,
} from "../lib/envio-server-config-core";

describe("Envio server GraphQL configuration", function () {
  it("requires the GraphQL URL", function () {
    const config = getEnvioServerConfig({});

    assert.equal(config.status, "missing");
    assert.equal(config.reason, "Envio GraphQL URL is missing.");
  });

  it("uses the admin-secret header when a secret is configured", function () {
    const config = getEnvioServerConfig({
      ENVIO_GRAPHQL_URL: "http://localhost:8080/v1/graphql",
      ENVIO_GRAPHQL_ADMIN_SECRET: "testing",
    });

    assert.equal(config.status, "ready");
    assert.equal(config.authMode, "admin-secret");
    assert.deepEqual(getEnvioGraphqlHeaders(config), {
      "content-type": "application/json",
      "x-hasura-admin-secret": "testing",
    });
  });

  it("supports public HTTPS endpoints without an admin-secret header", function () {
    const config = getEnvioServerConfig({
      ENVIO_GRAPHQL_URL: "https://indexer.example.com/v1/graphql",
    });

    assert.equal(config.status, "ready");
    assert.equal(config.authMode, "public");
    assert.deepEqual(getEnvioGraphqlHeaders(config), {
      "content-type": "application/json",
    });
  });

  it("fails closed for local endpoints without an admin secret", function () {
    const config = getEnvioServerConfig({
      ENVIO_GRAPHQL_URL: "http://localhost:8080/v1/graphql",
    });

    assert.equal(config.status, "missing");
    assert.equal(
      config.reason,
      "Envio GraphQL admin secret is required unless the endpoint is public HTTPS.",
    );
  });

  it("fails closed for private network HTTPS endpoints without an admin secret", function () {
    const config = getEnvioServerConfig({
      ENVIO_GRAPHQL_URL: "https://192.168.1.10/v1/graphql",
    });

    assert.equal(config.status, "missing");
  });
});
