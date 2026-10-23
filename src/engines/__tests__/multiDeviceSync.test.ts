import { describe, expect, it } from "vitest";
import { MultiDeviceSync } from "../multiDeviceSync";

describe("MultiDeviceSync", () => {
  it("initializes room and registers handler", () => {
    const sync = new MultiDeviceSync("ROOM-123");
    let received = 0;
    const unbind = sync.onMessage(() => {
      received++;
    });

    expect(typeof unbind).toBe("function");
    sync.destroy();
  });
});
