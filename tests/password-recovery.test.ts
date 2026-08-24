import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRecoveryGrant,
  verifyRecoveryGrant,
  verifyRecoveryKey,
} from "../src/lib/services/password-recovery.ts";
import { recoveryPasswordResetInputSchema } from "../src/lib/services/schemas.ts";

const secret = "a".repeat(64);
const env = { PASSWORD_RECOVERY_KEY: secret };

describe("password recovery", () => {
  it("fails closed when the recovery key is missing or too short", () => {
    assert.equal(verifyRecoveryKey("anything", {}), "unconfigured");
    assert.equal(verifyRecoveryKey("short", { PASSWORD_RECOVERY_KEY: "short" }), "unconfigured");
  });

  it("accepts only the configured recovery key", () => {
    assert.equal(verifyRecoveryKey(secret, env), "valid");
    assert.equal(verifyRecoveryKey(`${secret}x`, env), "invalid");
    assert.equal(verifyRecoveryKey("b".repeat(64), env), "invalid");
  });

  it("binds a signed grant to its user, session, and expiry", () => {
    const now = 1_000_000;
    const grant = createRecoveryGrant("user-1", "session-1", env, now);
    assert.ok(grant);
    assert.equal(verifyRecoveryGrant(grant, "user-1", "session-1", env, now + 1), true);
    assert.equal(verifyRecoveryGrant(grant, "user-2", "session-1", env, now + 1), false);
    assert.equal(verifyRecoveryGrant(grant, "user-1", "session-2", env, now + 1), false);
    assert.equal(verifyRecoveryGrant(grant, "user-1", "session-1", env, now + 300_001), false);
    assert.equal(verifyRecoveryGrant(`${grant.slice(0, -1)}x`, "user-1", "session-1", env, now + 1), false);
  });

  it("validates password length and confirmation on the server", () => {
    assert.equal(recoveryPasswordResetInputSchema.safeParse({ newPassword: "short", confirmPassword: "short" }).success, false);
    assert.equal(recoveryPasswordResetInputSchema.safeParse({ newPassword: "long-enough", confirmPassword: "different" }).success, false);
    assert.equal(recoveryPasswordResetInputSchema.safeParse({ newPassword: "long-enough", confirmPassword: "long-enough" }).success, true);
  });
});
