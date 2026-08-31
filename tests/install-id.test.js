import test from "node:test";
import assert from "node:assert/strict";
import { getInstallId, isVipInstallId, setInstallId } from "../src/shared/install-id.js";

test("Install ID 首次生成并在后续读取中保持不变", async () => {
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

  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(second, first);
  assert.equal(values.installId, first);
  assert.equal(writes, 1);

  const editable = await setInstallId("emma", storage);
  assert.equal(editable, "emma");
  assert.equal(await getInstallId(storage), "emma");
  assert.equal(isVipInstallId("EMMA"), true);
  assert.equal(isVipInstallId("other"), false);
  assert.equal(writes, 2);
});
