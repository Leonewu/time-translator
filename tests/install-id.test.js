import test from "node:test";
import assert from "node:assert/strict";
import { getInstallId, isVipInstallId, setInstallId } from "../src/shared/install-id.js";

test("Magic Code 默认留空，用户填写 emma 后可启用 VIP", async () => {
  const values = {};
  let writes = 0;
  const storage = {
    async get(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? { [key]: values[key] } : {};
    },
    async set(value) {
      writes += 1;
      Object.assign(values, value);
    },
  };

  const first = await getInstallId(storage);
  const second = await getInstallId(storage);

  assert.equal(first, "");
  assert.equal(second, first);
  assert.equal(values.installId, undefined);
  assert.equal(writes, 0);

  const editable = await setInstallId("emma", storage);
  assert.equal(editable, "emma");
  assert.equal(await getInstallId(storage), "emma");
  assert.equal(isVipInstallId("EMMA"), true);
  assert.equal(isVipInstallId("Emma"), true);
  assert.equal(isVipInstallId(" emMa "), true);
  assert.equal(isVipInstallId("other"), false);

  const cleared = await setInstallId("", storage);
  assert.equal(cleared, "");
  assert.equal(await getInstallId(storage), "");
  assert.equal(isVipInstallId(""), false);
  assert.equal(writes, 2);
  assert.equal(values.installId, "");
});
