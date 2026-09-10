export const TARGET_PROTOCOL_VERSION = '2025-03-26';
export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
  '2025-11-25',
  '2025-03-26',
  '2024-11-05'
]);

export function negotiateProtocolVersion(version) {
  if (SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
    return TARGET_PROTOCOL_VERSION;
  }
  throw new Error(
    `Unsupported protocol version "${version}". Supported versions are: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}`
  );
}

/**
 * Creates a bidirectional protocol adapter module for MCP protocol versions.
 * Translates client initialize requests to upstream's required version (2025-03-26)
 * and echoes the client's expected version in the initialize response.
 */
export function createProtocolAdapter() {
  let clientRequestedVersion = null;
  let initializeId = null;

  return {
    get clientRequestedVersion() {
      return clientRequestedVersion;
    },
    get initializeId() {
      return initializeId;
    },

    /**
     * Adapts an inbound client message.
     * If the message is `initialize`, validates the requested protocol version,
     * translates it to upstream target (2025-03-26), and records the client's expected version.
     *
     * @param {object} message Parsed JSON-RPC message
     * @returns {{ message: object, adaptedLine?: string, error?: { code: number, message: string } }}
     */
    adaptInbound(message) {
      if (message?.method !== 'initialize') {
        return { message };
      }

      initializeId = message.id;
      const requestedVersion = message.params?.protocolVersion;

      try {
        const negotiatedVersion = negotiateProtocolVersion(requestedVersion);
        clientRequestedVersion = requestedVersion;

        if (negotiatedVersion !== requestedVersion) {
          message.params.protocolVersion = negotiatedVersion;
          return { message, adaptedLine: JSON.stringify(message) };
        }
        return { message };
      } catch (err) {
        return {
          message,
          error: {
            code: -32602,
            message: err.message
          }
        };
      }
    },

    /**
     * Adapts an outbound upstream message.
     * If the message is the response to `initialize`, echoes the client's original version.
     *
     * @param {object} message Parsed JSON-RPC message
     * @returns {{ message: object, adaptedLine?: string }}
     */
    adaptOutbound(message) {
      if (
        message?.id === initializeId &&
        message?.result?.serverInfo &&
        message?.result?.protocolVersion &&
        clientRequestedVersion
      ) {
        message.result.protocolVersion = clientRequestedVersion;
        return { message, adaptedLine: JSON.stringify(message) };
      }
      return { message };
    },

    getClientVersion() {
      return clientRequestedVersion;
    },

    isNegotiated() {
      return Boolean(clientRequestedVersion);
    },

    /**
     * Alias for adaptInbound that throws on invalid protocol version.
     */
    adaptRequest(message) {
      const adapted = this.adaptInbound(message);
      if (adapted.error) {
        throw new Error(adapted.error.message);
      }
      return adapted;
    },

    /**
     * Alias for adaptOutbound.
     */
    adaptResponse(message) {
      return this.adaptOutbound(message);
    }
  };
}

