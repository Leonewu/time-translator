import test from "node:test";
import assert from "node:assert/strict";
import { getAnonymousInstallId, getInstallId, isVipInstallId, setInstallId } from "../src/shared/install-id.js";

test("Lucky Code 默认为空，只有用户输入后才保存", async () => {
  const values = {};
  let writes = 0;
  const storage = {
    async get(key) {
      return { [key]: values[key] };
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

  const anonymousId = await getAnonymousInstallId(storage);
  const sameAnonymousId = await getAnonymousInstallId(storage);
  assert.match(anonymousId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(sameAnonymousId, anonymousId);
  assert.equal(globalThis.__TIME_TRANSLATOR_ANONYMOUS_INSTALL_ID__, anonymousId);
  assert.equal(values.anonymousInstallId, anonymousId);
  assert.equal(values.installId, "");
  assert.equal(writes, 3);
});
