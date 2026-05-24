import { v4 as uuidv4 } from "uuid";
import { storeEncryptedItem, getDecryptedItem } from "@utils/storage";
import { getAppKey } from "@config/global/keyConfig";
import {
  InternalSessionState,
  LocationPreference,
  SessionConfigObject,
  SessionConfig
} from "@/types/SessionConfig";

const SESSION_KEY = "session_config_";

const internalSessionState: InternalSessionState = {
  sessionId: uuidv4(),
  persistencePreference: "session",
};

let _sessionConfig: SessionConfig = Object.freeze({
  SESSION_ID: internalSessionState.sessionId,
  PERSISTENCE: internalSessionState.persistencePreference,
});

/**
 * Tracks whether the session config has been loaded from storage at least once.
 * Avoids an AES decrypt on every `getSessionPersistence()` call — which the Axios
 * request interceptor invokes on *every* request. The in-memory `_sessionConfig`
 * is authoritative once loaded or explicitly set via `configSession`.
 */
let _loaded = false;

/**
 * Updates the immutable `_sessionConfig` object with the current state of `internalSessionState`
 * and freezes it.
 */
function updateSessionConfig(): void {
  _sessionConfig = Object.freeze({
    SESSION_ID: internalSessionState.sessionId,
    PERSISTENCE: internalSessionState.persistencePreference,
  });
}

/**
 * Saves the current session configuration to local or session storage.
 * @returns {Promise<void>} A promise that resolves when the session configuration has been saved.
 */
async function saveSessionConfig(): Promise<void> {
  const location = internalSessionState.persistencePreference;
  try {
    await storeEncryptedItem(
      SESSION_KEY,
      JSON.stringify(_sessionConfig),
      getAppKey(),
      location
    );
  } catch (error) {
    console.error("Error saving session configuration to storage:", error);
  }
}

/**
 * Attempts to load the configuration from storage.
 * If it fails or is not found, `internalSessionState` will retain its current values (initial or last configured).
 * Then, it updates `_sessionConfig`.
 *
 * @returns {Promise<void>} A promise that resolves when the state has been loaded and updated.
 */
async function loadSessionConfig(): Promise<void> {
  if (_loaded) {
    return;
  }
  const location = internalSessionState.persistencePreference;
  try {
    const storedConfig = await getDecryptedItem(SESSION_KEY, getAppKey(), location);
    if (storedConfig) {
      const parsedConfig = JSON.parse(storedConfig);
      internalSessionState.sessionId = parsedConfig.SESSION_ID;
      internalSessionState.persistencePreference = parsedConfig.PERSISTENCE;
      updateSessionConfig();
    }
    // Mark as loaded only after a successful read attempt; on error we leave it
    // false so the next call retries.
    _loaded = true;
  } catch (error) {
    console.warn(`Error loading or parsing from storage`, error);
  }
}

/**
 * Configures the session ID and persistence preference for the application.
 * This function allows setting a custom session ID and specifying whether session-related
 * data should be stored in `localStorage` or `sessionStorage`. The configuration is
 * then encrypted and saved to the chosen storage.
 *
 * @param {SessionConfigObject} config - An object containing the session configuration.
 * @param {string} [config.sessionId] - A unique identifier for the session. If not provided, the existing one is maintained.
 * @param {LocationPreference} [config.persistencePreference] - The storage location ('local' or 'session').
 *   If not provided, the existing preference is maintained.
 * @returns {Promise<void>} A promise that resolves once the session has been configured and saved.
 */
export async function configSession(
  config: SessionConfigObject
): Promise<void> {
  if (config.sessionId) {
    internalSessionState.sessionId = config.sessionId;
  }
  if (config.persistencePreference) {
    internalSessionState.persistencePreference = config.persistencePreference;
  }
  updateSessionConfig();
  // The in-memory state is now authoritative — skip the storage round-trip on reads.
  _loaded = true;
  await saveSessionConfig();
}

/**
 * Retrieves the current session identifier, loading it from storage if available.
 *
 * @returns {Promise<string>} A promise that resolves with the session ID.
 */
export async function getSessionId(): Promise<string> {
  await loadSessionConfig();
  return _sessionConfig.SESSION_ID;
}

/**
 * Retrieves the current data persistence preference, loading it from storage if available.
 *
 * @returns {Promise<LocationPreference>} A promise that resolves with the persistence preference ('local' or 'session').
 */
export async function getSessionPersistence(): Promise<LocationPreference> {
  await loadSessionConfig();
  return _sessionConfig.PERSISTENCE;
}

/**
 * Retrieves the complete session configuration object, loading it from storage if available.
 *
 * @returns {Promise<SessionConfig>} A promise that resolves with the full session configuration.
 */
export async function getSessionConfig(): Promise<SessionConfig> {
  await loadSessionConfig();
  return _sessionConfig;
}
